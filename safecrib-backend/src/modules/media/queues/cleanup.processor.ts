import { Worker, Queue, Job } from 'bullmq';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseRedisConnection } from '../../../infra/queue/redis-connection.util.js';
import {
  MEDIA_CLEANUP_QUEUE,
  MEDIA_DELETION_QUEUE,
} from '../../../infra/queue/queue.constants.js';
import { MediaRepository } from '../media.repository.js';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../providers/storage-provider.interface.js';
import { InjectQueue } from '@nestjs/bullmq';
import type { Media } from '@prisma/client';

/**
 * PENDING uploads older than 30 minutes are considered orphaned (the signed
 * upload signature TTL is 10 minutes, so anything older was either abandoned
 * or a failed upload — e.g. Cloudinary rejected an invalid upload preset and
 * no asset was ever stored).
 */
const ORPHAN_AGE_MS = 30 * 60 * 1000;

@Injectable()
export class MediaCleanupProcessor implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(MediaCleanupProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly mediaRepo: MediaRepository,
    private readonly configService: ConfigService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @InjectQueue(MEDIA_DELETION_QUEUE) private readonly deletionQueue: Queue,
    @InjectQueue(MEDIA_CLEANUP_QUEUE) private readonly cleanupQueue: Queue,
  ) {}

  onModuleInit(): void {
    const redisUrl =
      this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

    this.worker = new Worker<Record<string, never>>(
      MEDIA_CLEANUP_QUEUE,
      async (_job: Job) => {
        await this.runCleanup();
      },
      {
        connection: parseRedisConnection(redisUrl),
        concurrency: 1,
      },
    );

    void this.cleanupQueue.add('run-cleanup', {}, {
      jobId: 'media-cleanup-scheduled',
      repeat: { every: 5 * 60 * 1000 },
      removeOnComplete: 10,
      removeOnFail: 50,
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Cleanup job ${job?.id} failed: ${err?.message}`, err?.stack);
    });

    this.worker.on('completed', (job) => {
      this.logger.log(`Cleanup job ${job.id} completed`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) await this.worker.close();
  }

  private async runCleanup(): Promise<void> {
    this.logger.log('Starting orphan media cleanup');

    // 1. Cancel stale PENDING uploads. These were either abandoned by the
    //    client or failed uploads (e.g. an invalid upload preset). Because the
    //    signed-upload signature TTL is 10 min, anything pending past 30 min
    //    never completed, so no Cloudinary asset exists to delete — mark it
    //    FAILED directly instead of making a no-op Admin API call.
    const cancelled = await this.mediaRepo.cancelStalePending(
      ORPHAN_AGE_MS,
      'Upload aborted: no Cloudinary webhook received within the signature TTL window.',
      200,
    );
    this.logger.log(`Cancelled ${cancelled} stale PENDING media records`);

    // 2. Retry stale DELETING records that may have been missed
    const deleting = await this.mediaRepo.findDeletingRecords(50);
    this.logger.log(`Re-queuing ${deleting.length} stale DELETING records`);

    for (const media of deleting) {
      await this.scheduleForDeletion(media);
    }
  }

  private async scheduleForDeletion(media: Media): Promise<void> {
    // Mark as DELETING first so we don't re-enqueue on next run
    if (media.status !== 'DELETING') {
      await this.mediaRepo.markDeleting(media.id);
    }

    await this.deletionQueue.add(
      'delete-asset',
      {
        mediaId: media.id,
        publicId: media.publicId,
        resourceType: this.rtToSdk(media.resourceType),
        deliveryType: this.dtToSdk(media.deliveryType),
      },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: false,
        // Deduplicate: don't add if already queued for the same publicId
        jobId: `delete:${media.id}`,
      },
    );
  }

  private rtToSdk(rt: string): 'image' | 'video' | 'raw' {
    const m: Record<string, 'image' | 'video' | 'raw'> = {
      IMAGE: 'image',
      VIDEO: 'video',
      RAW: 'raw',
    };
    return m[rt] ?? 'image';
  }

  private dtToSdk(dt: string): 'upload' | 'authenticated' | 'private' {
    const m: Record<string, 'upload' | 'authenticated' | 'private'> = {
      UPLOAD: 'upload',
      AUTHENTICATED: 'authenticated',
      PRIVATE: 'private',
    };
    return m[dt] ?? 'upload';
  }
}
