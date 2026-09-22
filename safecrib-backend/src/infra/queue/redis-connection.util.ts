import type { ConnectionOptions } from 'bullmq';

export function parseRedisConnection(
  redisUrl: string | undefined,
): ConnectionOptions {
  const url = redisUrl || 'redis://localhost:6379';
  const parsed = new URL(url);
  const tls = parsed.protocol === 'rediss:';
  const connection: ConnectionOptions = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : (tls ? 6380 : 6379),
    username: parsed.username || undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: parsed.pathname && parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined,
    tls: tls ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (times: number) => Math.min(times * 250, 5000),
  };

  return connection;
}
