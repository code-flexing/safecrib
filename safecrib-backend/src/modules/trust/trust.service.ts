import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { computeTrustScore } from '../../domain/trust/trust-score.engine.js';
import type { TrustEvent } from '../../domain/trust/trust-score.engine.js';

export interface TrustScoreResult {
  score: number | null;
  breakdown: Record<string, number>;
  flaggedForReview: boolean;
  lastUpdated: Date | null;
  eventCount: number;
}

@Injectable()
export class TrustService {
  constructor(private readonly prisma: PrismaService) {}

  async getTrustScore(userId: string): Promise<TrustScoreResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        trustScore: true,
        trustScoreUpdatedAt: true,
        _count: { select: { trustEvents: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.trustScore === null || user.trustScoreUpdatedAt === null) {
      const result = await this.recomputeScore(userId);
      return result;
    }

    return {
      score: user.trustScore,
      breakdown: {},
      flaggedForReview: false,
      lastUpdated: user.trustScoreUpdatedAt,
      eventCount: user._count.trustEvents,
    };
  }

  async recomputeScore(userId: string): Promise<TrustScoreResult> {
    const events = await this.prisma.trustEvent.findMany({
      where: { userId },
      orderBy: { occurredAt: 'desc' },
    });

    const domainEvents: TrustEvent[] = events.map((e) => ({
      type: e.eventType as TrustEvent['type'],
      weight: e.weight,
      occurredAt: e.occurredAt,
      reviewerTrustFactor: (e.payload as any)?.reviewerTrustFactor,
    }));

    const result = computeTrustScore(domainEvents, new Date());

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        trustScore: result.score,
        trustScoreUpdatedAt: new Date(),
      },
    });

    return {
      score: result.score,
      breakdown: result.breakdown,
      flaggedForReview: result.flaggedForReview,
      lastUpdated: new Date(),
      eventCount: events.length,
    };
  }

  async recordTrustEvent(
    userId: string,
    eventType: TrustEvent['type'],
    weight: number,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.trustEvent.create({
      data: {
        userId,
        eventType,
        weight,
        payload: payload ?? undefined as any,
      },
    });
  }

  async getTrustScoreBreakdown(userId: string): Promise<{
    score: number;
    breakdown: Record<string, number>;
    flaggedForReview: boolean;
    events: Array<{ type: string; weight: number; occurredAt: Date }>;
  }> {
    const events = await this.prisma.trustEvent.findMany({
      where: { userId },
      orderBy: { occurredAt: 'desc' },
    });

    const domainEvents: TrustEvent[] = events.map((e) => ({
      type: e.eventType as TrustEvent['type'],
      weight: e.weight,
      occurredAt: e.occurredAt,
      reviewerTrustFactor: (e.payload as any)?.reviewerTrustFactor,
    }));

    const result = computeTrustScore(domainEvents, new Date());

    return {
      score: result.score,
      breakdown: result.breakdown,
      flaggedForReview: result.flaggedForReview,
      events: events.map((e) => ({
        type: e.eventType,
        weight: e.weight,
        occurredAt: e.occurredAt,
      })),
    };
  }
}
