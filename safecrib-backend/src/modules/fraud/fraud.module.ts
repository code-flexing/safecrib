import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FraudController } from './fraud.controller.js';
import { FraudService } from './fraud.service.js';
import { TRUST_RECOMPUTE_QUEUE } from '../../infra/queue/queue.constants.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: TRUST_RECOMPUTE_QUEUE }),
  ],
  controllers: [FraudController],
  providers: [FraudService],
  exports: [FraudService],
})
export class FraudModule {}
