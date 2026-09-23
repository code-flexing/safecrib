import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisPolicyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisPolicyService.name);
  private client: Redis | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const enforceNoEviction = this.configService
      .get<string>('REDIS_ENFORCE_NOEVICTION')
      ?.trim()
      .toLowerCase();
    if (enforceNoEviction === 'false') return;

    const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy: (times) => Math.min(times * 250, 5000),
    });

    try {
      await this.client.connect();
      const current = await this.client.config('GET', 'maxmemory-policy');
      const policy = Array.isArray(current) ? current[1] : undefined;
      if (policy !== 'noeviction') {
        await this.client.config('SET', 'maxmemory-policy', 'noeviction');
        this.logger.warn(`Redis maxmemory-policy changed from ${policy ?? 'unknown'} to noeviction`);
      }
      this.logger.log('Redis maxmemory-policy is noeviction');
    } catch (error) {
      this.logger.error(
        `Redis maxmemory-policy could not be verified or changed: ${(error as Error).message}. Configure maxmemory-policy=noeviction in the Redis service settings.`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.client) await this.client.quit().catch(() => undefined);
  }
}