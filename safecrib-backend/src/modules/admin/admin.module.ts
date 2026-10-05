import { Module } from '@nestjs/common';
import { QueueModule } from '../../infra/queue/queue.module.js';
import { TrustModule } from '../trust/trust.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [QueueModule, TrustModule, NotificationsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
