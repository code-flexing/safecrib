import { Module } from '@nestjs/common';
import { QueueModule } from '../../infra/queue/queue.module.js';
import { TrustModule } from '../trust/trust.module.js';
import { ProviderPagesController } from './provider-pages.controller.js';
import { ProviderPagesService } from './provider-pages.service.js';

@Module({
  imports: [QueueModule, TrustModule],
  controllers: [ProviderPagesController],
  providers: [ProviderPagesService],
  exports: [ProviderPagesService],
})
export class ProviderPagesModule {}
