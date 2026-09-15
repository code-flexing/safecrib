import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  BOOKING_HOLD_EXPIRY_QUEUE,
  DUPLICATE_SWEEP_QUEUE,
  EMAIL_QUEUE,
  IMAGE_HASH_QUEUE,
  TRUST_RECOMPUTE_QUEUE,
} from './queue.constants.js';

function parseRedisUrl(url: string): { host: string; port: number } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
  };
}

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL') || 'redis://localhost:6379';
        const { host, port } = parseRedisUrl(redisUrl);
        return {
          connection: { host, port },
        };
      },
    }),
    BullModule.registerQueue(
      { name: EMAIL_QUEUE },
      { name: IMAGE_HASH_QUEUE },
      { name: TRUST_RECOMPUTE_QUEUE },
      { name: BOOKING_HOLD_EXPIRY_QUEUE },
      { name: DUPLICATE_SWEEP_QUEUE },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
