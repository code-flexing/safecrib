import { Worker, Job } from 'bullmq';
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { DUPLICATE_SWEEP_QUEUE } from '../../infra/queue/queue.constants.js';
import { parseRedisConnection } from '../../infra/queue/redis-connection.util.js';
import {
  evaluateDuplicateRisk,
  type ListingFingerprint,
} from '../../domain/fraud/duplicate-detector.engine.js';

export interface DuplicateSweepJobData {
  batchSize: number;
  offset: number;
}

@Injectable()
export class DuplicateSweepProcessor implements OnModuleInit {
  private readonly logger = new Logger(DuplicateSweepProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

    this.worker = new Worker<DuplicateSweepJobData>(
      DUPLICATE_SWEEP_QUEUE,
      async (job: Job<DuplicateSweepJobData>) => {
        const { batchSize, offset } = job.data;

        const listings = await this.prisma.listing.findMany({
          where: { status: { in: ['ACTIVE', 'FLAGGED'] } },
          select: {
            id: true,
            lat: true,
            lng: true,
            price: true,
            description: true,
            photos: {
              select: { phash: true },
              take: 1,
            },
          },
          skip: offset,
          take: batchSize,
          orderBy: { createdAt: 'desc' },
        });

        if (listings.length < 2) {
          this.logger.log('Duplicate sweep: fewer than 2 listings, nothing to compare');
          return;
        }

        const fingerprints: ListingFingerprint[] = listings.map((l) => ({
          id: l.id,
          phash: l.photos[0]?.phash ?? null,
          description: l.description ?? '',
          lat: l.lat,
          lng: l.lng,
          price: l.price,
        }));

        let flagCount = 0;

        for (let i = 0; i < fingerprints.length; i++) {
          const candidate = fingerprints[i];
          const existing = fingerprints.slice(i + 1);

          const flags = evaluateDuplicateRisk(candidate, existing);

          for (const flag of flags) {
            try {
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
              flagCount++;
            } catch (err) {
              this.logger.warn(`Failed to upsert duplicate flag: ${(err as Error).message}`);
            }
          }
        }

        this.logger.log(`Duplicate sweep batch processed: ${flagCount} flags`);
      },
      {
        connection: parseRedisConnection(redisUrl),
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Duplicate sweep failed: ${err?.message}`, err?.stack);
    });
  }
}
