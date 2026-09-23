import { Module } from '@nestjs/common';
import { QueueModule } from '../../infra/queue/queue.module.js';
import { AdminSupportController, SupportController } from './support.controller.js';
import { SupportService } from './support.service.js';

@Module({
  imports: [QueueModule],
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
