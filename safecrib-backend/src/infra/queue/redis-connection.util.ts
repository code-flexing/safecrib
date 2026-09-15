import type { ConnectionOptions } from 'bullmq';

export function parseRedisConnection(
  redisUrl: string | undefined,
): ConnectionOptions {
  const url = redisUrl || 'redis://localhost:6379';
  const parsed = new URL(url);

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
  };
}
