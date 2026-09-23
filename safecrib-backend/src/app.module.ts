import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

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
import { MediaModule } from './modules/media/media.module.js';
import { EmailProcessor } from './infra/queue/email.processor.js';
import { ImageHashProcessor } from './infra/queue/image-hash.processor.js';
import { TrustRecomputeProcessor } from './infra/queue/trust-recompute.processor.js';
import { BookingHoldExpiryProcessor } from './infra/queue/booking-hold-expiry.processor.js';
import { DuplicateSweepProcessor } from './infra/queue/duplicate-sweep.processor.js';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { SupportModule } from './modules/support/support.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL') || 'redis://localhost:6379';

        const shortTtl = (config.get<number>('THROTTLE_TTL') || 60) * 1000;
        const shortLimit = config.get<number>('THROTTLE_LIMIT') || 10;

        const authTtl = (config.get<number>('THROTTLE_AUTH_TTL') || 60) * 1000;
        const authLimit = config.get<number>('THROTTLE_AUTH_LIMIT') || 5;

        const strictTtl = (config.get<number>('THROTTLE_STRICT_TTL') || 3600) * 1000;
        const strictLimit = config.get<number>('THROTTLE_STRICT_LIMIT') || 3;

        return {
          throttlers: [
            { name: 'short', ttl: shortTtl, limit: shortLimit },
            { name: 'auth', ttl: authTtl, limit: authLimit },
            { name: 'strict', ttl: strictTtl, limit: strictLimit },
          ],
          storage: new ThrottlerStorageRedisService(redisUrl),
        };
      },
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
    MediaModule,
    SupportModule,
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
