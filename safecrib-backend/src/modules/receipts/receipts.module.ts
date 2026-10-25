import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ReceiptsController } from './receipts.controller.js';
import { ReceiptService } from './receipt.service.js';

@Module({
  controllers: [ReceiptsController],
  providers: [PrismaService, ReceiptService],
  exports: [ReceiptService],
})
export class ReceiptsModule {}