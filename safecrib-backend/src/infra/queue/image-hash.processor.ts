import { Worker, Job } from 'bullmq';
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { IMAGE_HASH_QUEUE } from '../../infra/queue/queue.constants.js';
import { parseRedisConnection } from '../../infra/queue/redis-connection.util.js';
import {
  evaluateDuplicateRisk,
  type ListingFingerprint,
} from '../../domain/fraud/duplicate-detector.engine.js';

export interface ImageHashJobData {
  listingId: string;
  photoId: string;
  phash: string;
  url: string;
}

@Injectable()
export class ImageHashProcessor implements OnModuleInit {
  private readonly logger = new Logger(ImageHashProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

    this.worker = new Worker<ImageHashJobData>(
      IMAGE_HASH_QUEUE,
      async (job: Job<ImageHashJobData>) => {
        const { listingId, phash } = job.data;

        const listing = await this.prisma.listing.findUnique({
          where: { id: listingId },
          select: {
            lat: true,
            lng: true,
            price: true,
            description: true,
          },
        });

        if (!listing) {
          this.logger.warn(`Listing ${listingId} not found for image hash check`);
          return;
        }

        const allListings = await this.prisma.listing.findMany({
          where: {
            id: { not: listingId },
            status: { in: ['ACTIVE', 'FLAGGED'] as any },
          },
          select: {
            id: true,
            lat: true,
            lng: true,
            price: true,
            description: true,
            photos: {
              select: { phash: true },
            },
          },
        });

        const candidate: ListingFingerprint = {
          id: listingId,
          phash,
          description: listing.description ?? '',
          lat: listing.lat,
          lng: listing.lng,
          price: listing.price,
        };

        const existing: ListingFingerprint[] = allListings.map((l) => ({
          id: l.id,
          phash: l.photos[0]?.phash ?? null,
          description: l.description ?? '',
          lat: l.lat,
          lng: l.lng,
          price: l.price,
        }));

        const flags = evaluateDuplicateRisk(candidate, existing);

        for (const flag of flags) {
          await this.prisma.duplicateFlag.upsert({
            where: {
              listingIdA_listingIdB_matchType: {
                listingIdA: flag.listingIdA,
                listingIdB: flag.listingIdB,
                matchType: flag.matchType,
              },
            },
            create: {
              listingIdA: flag.listingIdA,
              listingIdB: flag.listingIdB,
              matchType: flag.matchType,
              similarity: flag.similarity,
            },
            update: {
              similarity: flag.similarity,
            },
          });
        }

        if (flags.length > 0) {
          this.logger.log(
            `Found ${flags.length} duplicate flags for listing ${listingId}`,
          );
        }
      },
      {
        connection: parseRedisConnection(redisUrl),
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Image hash job failed for listing ${job?.data?.listingId}: ${err?.message}`,
        err?.stack,
      );
    });

    this.worker.on('completed', (job) => {
      this.logger.log(`Image hash check completed for listing ${job.data.listingId}`);
    });
  }
}
