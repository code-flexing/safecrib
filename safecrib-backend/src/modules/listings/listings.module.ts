import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';
import { IMAGE_HASH_QUEUE } from '../../infra/queue/queue.constants.js';
import { ProviderPagesModule } from '../provider-pages/provider-pages.module.js';

@Module({
  imports: [
    ProviderPagesModule,
    BullModule.registerQueue({
      name: IMAGE_HASH_QUEUE,
    }),
  ],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
