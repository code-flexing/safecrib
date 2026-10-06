import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { MEDIA_DELETION_QUEUE } from '../../../infra/queue/queue.constants.js';
import { QueueService } from '../../../infra/queue/queue.service.js';
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

  constructor(
    private readonly mediaRepo: MediaRepository,
    private readonly queues: QueueService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  onModuleInit(): void {
    this.queues.registerWorker<DeletionJobData>(
      MEDIA_DELETION_QUEUE,
      3,
      async (job) => this.process(job.data),
      { max: 10, durationMs: 1000 },
    );
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
      throw err;
    }
  }
}
