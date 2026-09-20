import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './infra/prisma/prisma.module.js';
import { MailModule } from './infra/mail/mail.module.js';
import { QueueModule } from './infra/queue/queue.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ListingsModule } from './modules/listings/listings.module.js';
import { BookingsModule } from './modules/bookings/bookings.module.js';
import { TrustModule } from './modules/trust/trust.module.js';
import { FraudModule } from './modules/fraud/fraud.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { ProviderPagesModule } from './modules/provider-pages/provider-pages.module.js';
import { ReviewsModule } from './modules/reviews/reviews.module.js';
import { StudentProfilesModule } from './modules/student-profiles/student-profiles.module.js';
import { EmailProcessor } from './infra/queue/email.processor.js';
import { ImageHashProcessor } from './infra/queue/image-hash.processor.js';
import { TrustRecomputeProcessor } from './infra/queue/trust-recompute.processor.js';
import { BookingHoldExpiryProcessor } from './infra/queue/booking-hold-expiry.processor.js';
import { DuplicateSweepProcessor } from './infra/queue/duplicate-sweep.processor.js';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'short',
            ttl: config.get<number>('THROTTLE_TTL') || 60,
            limit: config.get<number>('THROTTLE_LIMIT') || 10,
          },
        ],
      }),
    }),

    PrismaModule,
    MailModule,
    QueueModule,

    AuthModule,
    UsersModule,
    ListingsModule,
    BookingsModule,
    TrustModule,
    FraudModule,
    AdminModule,
    ProviderPagesModule,
    ReviewsModule,
    StudentProfilesModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    EmailProcessor,
    ImageHashProcessor,
    TrustRecomputeProcessor,
    BookingHoldExpiryProcessor,
    DuplicateSweepProcessor,
  ],
})
export class AppModule {}
