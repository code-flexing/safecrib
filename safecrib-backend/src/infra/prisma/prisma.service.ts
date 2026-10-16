import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const HEALTH_CHECK_TIMEOUT_MS = 1_500;
const SLOW_QUERY_THRESHOLD_MS = 100;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });

    this.$on('query', (event) => {
      if (event.duration < SLOW_QUERY_THRESHOLD_MS) return;
      this.logger.warn(JSON.stringify({
        event: 'slow_database_query',
        durationMs: event.duration,
        target: event.target,
      }));
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.$connect();
    this.connected = true;
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.connected) return;
    await this.$disconnect();
    this.connected = false;
    this.logger.log('Database connection closed');
  }

  async isAvailable(): Promise<boolean> {
    if (!this.connected) return false;
    let timeout: NodeJS.Timeout | undefined;
    try {
      const query = this.$queryRaw`SELECT 1`.then(
        () => true,
        () => false,
      );
      const deadline = new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), HEALTH_CHECK_TIMEOUT_MS);
      });
      return await Promise.race([query, deadline]);
    } catch {
      return false;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
