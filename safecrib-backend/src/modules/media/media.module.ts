import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import {
  MEDIA_CLEANUP_QUEUE,
  MEDIA_DELETION_QUEUE,
  MEDIA_WEBHOOK_QUEUE,
} from '../../infra/queue/queue.constants.js';
import { CloudinaryStorageProvider } from './providers/cloudinary.provider.js';
import { STORAGE_PROVIDER } from './providers/storage-provider.interface.js';
import { MediaPathBuilder } from './services/media-path-builder.service.js';
import { MediaPolicyService } from './services/media-policy.service.js';
import { MediaService } from './services/media.service.js';
import { MediaRepository } from './media.repository.js';
import { MediaController } from './media.controller.js';
import { MediaWebhookProcessor } from './queues/webhook.processor.js';
import { MediaDeletionProcessor } from './queues/deletion.processor.js';
import { MediaCleanupProcessor } from './queues/cleanup.processor.js';

@Module({
  imports: [
    ConfigModule,

    // Register the three media queues
    BullModule.registerQueue(
      { name: MEDIA_WEBHOOK_QUEUE },
      { name: MEDIA_DELETION_QUEUE },
      { name: MEDIA_CLEANUP_QUEUE },
    ),
  ],
  controllers: [MediaController],
  providers: [
    // Provider abstraction — swap this to MockStorageProvider in tests
    {
      provide: STORAGE_PROVIDER,
      useClass: CloudinaryStorageProvider,
    },

    MediaRepository,
    MediaPathBuilder,
    MediaPolicyService,
    MediaService,

    // Queue workers (created in onModuleInit)
    MediaWebhookProcessor,
    MediaDeletionProcessor,
    MediaCleanupProcessor,
  ],
  exports: [
    MediaService,
    MediaRepository,
    MediaPathBuilder,
    STORAGE_PROVIDER,
  ],
})
export class MediaModule {}
