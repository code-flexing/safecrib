import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { INestApplication } from '@nestjs/common';
import type { ServerOptions } from 'socket.io';

export class RedisSocketAdapter extends IoAdapter {
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  constructor(private readonly app: INestApplication, redisUrl?: string) {
    super(app);
    this.publisher = new Redis(redisUrl ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    this.subscriber = this.publisher.duplicate();
  }

  async connectToRedis(): Promise<void> {
    const [publisher, subscriber] = [this.publisher, this.subscriber];
    if (!publisher || !subscriber) throw new Error('Redis Socket.IO adapter is not initialized');
    await Promise.all([publisher.ping(), subscriber.ping()]);
    this.adapterConstructor = createAdapter(publisher, subscriber);
  }

  override createIOServer(port: number, options?: ServerOptions): ReturnType<IoAdapter['createIOServer']> {
    const server = super.createIOServer(port, options);
    if (!this.adapterConstructor) {
      throw new Error('Redis Socket.IO adapter must connect before creating the server');
    }
    server.adapter(this.adapterConstructor);
    return server;
  }

  override async dispose(): Promise<void> {
    await super.dispose();
    await Promise.all(
      [this.publisher, this.subscriber]
        .filter((client): client is Redis => client !== null)
        .map((client) => client.quit()),
    );
    this.publisher = null;
    this.subscriber = null;
  }
}
