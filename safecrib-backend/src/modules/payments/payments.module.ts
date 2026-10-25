import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsWebhookController } from './payments.webhook.controller.js';
import { PaystackService } from './paystack.service.js';
import { ReceiptsModule } from '../receipts/receipts.module.js';

@Module({
  imports: [ReceiptsModule],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [PrismaService, PaystackService],
  exports: [PaystackService],
})
export class PaymentsModule {}