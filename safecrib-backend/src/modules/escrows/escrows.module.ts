import { Module } from '@nestjs/common';
import { EscrowsService } from './escrows.service.js';
import { EscrowsController } from './escrows.controller.js';

@Module({
  providers: [EscrowsService],
  controllers: [EscrowsController],
  exports: [EscrowsService],
})
export class EscrowsModule {}
