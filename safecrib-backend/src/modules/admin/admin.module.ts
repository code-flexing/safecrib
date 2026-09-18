import { Module } from '@nestjs/common';
import { QueueModule } from '../../infra/queue/queue.module.js';
import { TrustModule } from '../trust/trust.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [QueueModule, TrustModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
