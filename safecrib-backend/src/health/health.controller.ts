import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/public.decorator.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { QueueService } from '../infra/queue/queue.service.js';
import { getRedisStatus } from '../lib/redis.js';

@Controller()
@Public()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
  ) {}

  @Get('healthz')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('readyz')
  async readiness(@Res() response: Response): Promise<void> {
    const database = await this.prisma.isAvailable();
    const dependencies = {
      redis: getRedisStatus(),
      database: database ? 'ready' : 'not_ready',
      queues: this.queues.isReady ? 'ready' : 'not_ready',
    };
    const ready = Object.values(dependencies).every((status) => status === 'ready');
    response.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      dependencies,
    });
  }
}
