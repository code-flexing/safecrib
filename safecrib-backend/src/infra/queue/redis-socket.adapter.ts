import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { getRedis } from '../../lib/redis.js';
import type { INestApplication } from '@nestjs/common';
import type { ServerOptions, Server } from 'socket.io';
import { Redis } from 'ioredis';

export class RedisSocketAdapter extends IoAdapter {
  private readonly socketLogger = new Logger(RedisSocketAdapter.name);
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private server: Server | undefined;
  private closed = false;

  constructor(app: INestApplication) {
    super(app);
    this.publisher = getRedis().duplicate();
    this.subscriber = getRedis().duplicate();
    for (const client of [this.publisher, this.subscriber]) {
      client.on('error', (error: Error & { code?: string }) => {
        this.socketLogger.error(`Socket.IO Redis error: ${error.code ?? error.message}`);
      });
      client.on('ready', () => this.installAdapter());
    }
  }

  async connectToRedis(): Promise<void> {
    try {
      await Promise.all([this.connectClient(this.publisher), this.connectClient(this.subscriber)]);
      await Promise.all([this.publisher.ping(), this.subscriber.ping()]);
      this.installAdapter();
    } catch (error) {
      this.socketLogger.warn(
        `Socket.IO is running in single-node mode because Redis is unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  override createIOServer(
    port: number,
    options?: ServerOptions,
  ): ReturnType<IoAdapter['createIOServer']> {
    // Engine.IO's default heartbeat uses ping/pong every 25s with a 20s timeout.
    const server = super.createIOServer(port, options) as Server;
    this.server = server;
    this.installAdapter();
    return server;
  }

  override async dispose(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await super.dispose();
    await Promise.all([this.closeClient(this.publisher), this.closeClient(this.subscriber)]);
  }

  private async connectClient(client: Redis): Promise<void> {
    if (client.status === 'wait') await client.connect();
  }

  private async closeClient(client: Redis): Promise<void> {
    try {
      if (client.status === 'ready') {
        await client.quit();
      } else {
        client.disconnect();
      }
    } finally {
      client.removeAllListeners();
    }
  }

  private installAdapter(): void {
    if (
      this.closed ||
      !this.server ||
      this.publisher.status !== 'ready' ||
      this.subscriber.status !== 'ready'
    ) {
      return;
    }
    this.server.adapter(createAdapter(this.publisher, this.subscriber));
    this.socketLogger.log('Socket.IO Redis adapter enabled');
  }
}
