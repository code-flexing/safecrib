import { Module } from '@nestjs/common';
import { FraudController } from './fraud.controller.js';
import { FraudService } from './fraud.service.js';

@Module({
  imports: [
  ],
  controllers: [FraudController],
  providers: [FraudService],
  exports: [FraudService],
})
export class FraudModule {}
