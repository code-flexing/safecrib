import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { BOOKING_HOLD_EXPIRY_QUEUE, TRUST_RECOMPUTE_QUEUE } from '../../infra/queue/queue.constants.js';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: BOOKING_HOLD_EXPIRY_QUEUE },
      { name: TRUST_RECOMPUTE_QUEUE },
    ),
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
