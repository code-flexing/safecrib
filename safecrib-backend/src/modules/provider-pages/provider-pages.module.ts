import { Module } from '@nestjs/common';
import { QueueModule } from '../../infra/queue/queue.module.js';
import { TrustModule } from '../trust/trust.module.js';
import { StudentProfilesModule } from '../student-profiles/student-profiles.module.js';
import { ProviderPagesController } from './provider-pages.controller.js';
import { ProvidersController } from './providers.controller.js';
import { ProviderPagesService } from './provider-pages.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [QueueModule, TrustModule, StudentProfilesModule, NotificationsModule],
  controllers: [ProviderPagesController, ProvidersController],
  providers: [ProviderPagesService],
  exports: [ProviderPagesService],
})
export class ProviderPagesModule {}
