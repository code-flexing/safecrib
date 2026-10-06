import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

const logger = new Logger('Redis');
let redis: Redis | undefined;

export function getRedis(): Redis {
  if (redis) return redis;

  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error('REDIS_URL is required to start the backend');
  }

  const tls = redisUrl.startsWith('rediss://') ? {} : undefined;
  redis = new Redis(redisUrl, {
    connectionName: 'safecrib-backend',
    lazyConnect: true,
    keepAlive: 10_000,
    connectTimeout: 10_000,
    enableReadyCheck: true,
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt: number) => {
      const cappedDelay = Math.min(500 * 2 ** Math.min(attempt - 1, 6), 30_000);
      return cappedDelay + Math.floor(Math.random() * Math.min(cappedDelay * 0.2, 1_000));
    },
    ...(tls ? { tls } : {}),
  });

  redis.on('error', (error: Error & { code?: string }) => {
    logger.error(`Redis error: ${error.code ?? error.message}`);
  });
  redis.on('connect', () => logger.log('Redis connection established'));
  redis.on('ready', () => logger.log('Redis client ready'));
  redis.on('reconnecting', (delay: number) =>
    logger.warn(`Redis reconnecting in ${delay}ms`),
  );
  redis.on('end', () => logger.warn('Redis connection ended'));

  return redis;
}

export async function connectRedis(): Promise<void> {
  const client = getRedis();
  if (client.status === 'wait') await client.connect();
  await client.ping();
}

export async function closeRedis(): Promise<void> {
  if (!redis) return;
  const client = redis;
  redis = undefined;
  try {
    if (client.status === 'ready') await client.quit();
    else client.disconnect();
  } finally {
    client.removeAllListeners();
  }
}

export function getRedisStatus(): string {
  return redis?.status ?? 'not_initialized';
}
