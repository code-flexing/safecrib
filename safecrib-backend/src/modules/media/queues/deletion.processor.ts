import { Worker, Job } from 'bullmq';
import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseRedisConnection } from '../../../infra/queue/redis-connection.util.js';
import { MEDIA_DELETION_QUEUE } from '../../../infra/queue/queue.constants.js';
import { MediaRepository } from '../media.repository.js';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../providers/storage-provider.interface.js';

export interface DeletionJobData {
  mediaId: string;
  publicId: string;
  resourceType: 'image' | 'video' | 'raw';
  deliveryType: 'upload' | 'authenticated' | 'private';
}

@Injectable()
export class MediaDeletionProcessor implements OnModuleInit {
  private readonly logger = new Logger(MediaDeletionProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly mediaRepo: MediaRepository,
    private readonly configService: ConfigService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  onModuleInit(): void {
    const redisUrl =
      this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

    this.worker = new Worker<DeletionJobData>(
      MEDIA_DELETION_QUEUE,
      async (job: Job<DeletionJobData>) => {
        await this.process(job.data);
      },
      {
        connection: parseRedisConnection(redisUrl),
        concurrency: 3,
        limiter: {
          max: 10,       // max 10 concurrent deletions
          duration: 1000, // per second (Admin API rate limit protection)
        },
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Deletion job ${job?.id} (mediaId=${job?.data?.mediaId}) failed after ${job?.attemptsMade} attempts: ${err?.message}`,
        err?.stack,
      );
    });

    this.worker.on('completed', (job) => {
      this.logger.log(
        `Deletion job ${job.id} completed: mediaId=${job.data.mediaId}`,
      );
    });
  }

  private async process(data: DeletionJobData): Promise<void> {
    const { mediaId, publicId, resourceType, deliveryType } = data;

    try {
      const result = await this.storage.deleteAsset(publicId, {
        resourceType,
        deliveryType,
      });

      // "not found" means it was already gone — treat as success
      if (result.result === 'ok' || result.result === 'not found') {
        await this.mediaRepo.markDeleted(mediaId);
        this.logger.log(
          `Asset deleted from Cloudinary: publicId=${publicId} result=${result.result}`,
        );
      } else {
        throw new Error(`Unexpected Cloudinary delete result: ${result.result}`);
      }
    } catch (err) {
      this.logger.error(
        `Failed to delete asset publicId=${publicId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err; // BullMQ will retry
    }
  }
}
