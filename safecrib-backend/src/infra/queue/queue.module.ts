import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import {
  BOOKING_HOLD_EXPIRY_QUEUE,
  DUPLICATE_SWEEP_QUEUE,
  EMAIL_QUEUE,
  IMAGE_HASH_QUEUE,
  MEDIA_CLEANUP_QUEUE,
  MEDIA_DELETION_QUEUE,
  MEDIA_WEBHOOK_QUEUE,
  TRUST_RECOMPUTE_QUEUE,
} from './queue.constants.js';
import { parseRedisConnection } from './redis-connection.util.js';
import { RedisPolicyService } from './redis-policy.service.js';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL') || 'redis://localhost:6379';
        return { connection: parseRedisConnection(redisUrl) };
      },
    }),
    BullModule.registerQueue(
      { name: EMAIL_QUEUE },
      { name: IMAGE_HASH_QUEUE },
      { name: TRUST_RECOMPUTE_QUEUE },
      { name: BOOKING_HOLD_EXPIRY_QUEUE },
      { name: DUPLICATE_SWEEP_QUEUE },
      { name: MEDIA_WEBHOOK_QUEUE },
      { name: MEDIA_DELETION_QUEUE },
      { name: MEDIA_CLEANUP_QUEUE },
    ),
  ],
  providers: [RedisPolicyService],
  exports: [BullModule],
})
export class QueueModule {}
