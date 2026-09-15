import { Worker, Job } from 'bullmq';
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { TRUST_RECOMPUTE_QUEUE } from '../../infra/queue/queue.constants.js';
import { parseRedisConnection } from '../../infra/queue/redis-connection.util.js';
import { computeTrustScore } from '../../domain/trust/trust-score.engine.js';
import type { TrustEvent } from '../../domain/trust/trust-score.engine.js';

export interface TrustRecomputeJobData {
  userId: string;
}

@Injectable()
export class TrustRecomputeProcessor implements OnModuleInit {
  private readonly logger = new Logger(TrustRecomputeProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

    this.worker = new Worker<TrustRecomputeJobData>(
      TRUST_RECOMPUTE_QUEUE,
      async (job: Job<TrustRecomputeJobData>) => {
        const { userId } = job.data;

        const events = await this.prisma.trustEvent.findMany({
          where: { userId },
          orderBy: { occurredAt: 'asc' },
        });

        const domainEvents: TrustEvent[] = events.map((e) => ({
          type: e.eventType as TrustEvent['type'],
          weight: e.weight,
          occurredAt: e.occurredAt,
          payload: e.payload as any,
        }));

        const result = computeTrustScore(domainEvents, new Date());

        await this.prisma.user.update({
          where: { id: userId },
          data: {
            trustScore: result.score,
            trustScoreUpdatedAt: new Date(),
          },
        });

        this.logger.log(
          `Recomputed trust score for user ${userId}: ${result.score} (flagged: ${result.flaggedForReview})`,
        );
      },
      {
        connection: parseRedisConnection(redisUrl),
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Trust recompute failed: ${err?.message}`, err?.stack);
    });
  }
}
