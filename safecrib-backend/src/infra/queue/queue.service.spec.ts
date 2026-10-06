import { afterEach, describe, expect, it } from 'vitest';
import { QueueService } from './queue.service.js';

describe('QueueService pg-boss configuration', () => {
  const originalUrl = process.env.PGBOSS_DATABASE_URL;
  const service = new QueueService();

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.PGBOSS_DATABASE_URL;
    else process.env.PGBOSS_DATABASE_URL = originalUrl;
  });

  it('rejects the Supabase transaction pooler with a clear message', () => {
    process.env.PGBOSS_DATABASE_URL = 'postgresql://user:pass@db.pooler.supabase.com:6543/postgres';

    expect(() => service.validateConfiguration()).toThrow(
      'PGBOSS_DATABASE_URL uses port 6543',
    );
  });

  it('accepts the session pooler on port 5432', () => {
    const connectionString = 'postgresql://user:pass@db.pooler.supabase.com:5432/postgres';
    process.env.PGBOSS_DATABASE_URL = connectionString;

    expect(service.validateConfiguration()).toBe(connectionString);
  });

  it('uses configured TLS options instead of URL ssl query parameters', () => {
    process.env.PGBOSS_DATABASE_URL =
      'postgresql://worker:password@db.pooler.supabase.com:5432/postgres?sslmode=require&application_name=worker';

    const validated = service.validateConfiguration();
    const parsed = new URL(validated);

    expect(parsed.searchParams.has('sslmode')).toBe(false);
    expect(parsed.searchParams.get('application_name')).toBe('worker');
  });

  it('fails clearly when the connection URL is missing', () => {
    delete process.env.PGBOSS_DATABASE_URL;

    expect(() => service.validateConfiguration()).toThrow(
      'PGBOSS_DATABASE_URL is required to start pg-boss workers',
    );
  });
});
