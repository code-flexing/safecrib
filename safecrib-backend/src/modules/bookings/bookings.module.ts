import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { SecureQuoteService } from './secure-quote.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PaymentsModule } from '../payments/payments.module.js';

@Module({
  imports: [
    NotificationsModule,
    PaymentsModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService, SecureQuoteService],
  exports: [BookingsService, SecureQuoteService],
})
export class BookingsModule {}