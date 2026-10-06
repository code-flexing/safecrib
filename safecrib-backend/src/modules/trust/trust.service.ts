import { InjectJobQueue } from '../../infra/queue/queue-injection.js';
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { JobQueueClient } from '../../infra/queue/queue.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { EMAIL_QUEUE } from '../../infra/queue/queue.constants.js';
import { computeTrustScore } from '../../domain/trust/trust-score.engine.js';
import type { TrustEvent } from '../../domain/trust/trust-score.engine.js';

export type VerificationStageName = 'PROFILE_VERIFIED' | 'AGENT_VERIFIED' | 'TRUST_CROWN';
export type VerificationBadge = 'GREEN_CHECK' | 'BLUE_SHIELD' | 'GOLD_CROWN';
export type VerificationBadgeColor = 'green' | 'blue' | 'gold';

export interface VerificationStageCriterion {
  key: 'identity' | 'provider' | 'student' | 'followers' | 'trust';
  label: string;
  met: boolean;
  required: boolean;
}

export interface VerificationStageResult {
  userId: string;
  role: string | null;
  eligible: boolean;
  stage: VerificationStageName;
  badge: VerificationBadge;
  badgeColor: VerificationBadgeColor;
  riskBlocked: boolean;
  nextMilestone: string | null;
  criteria: VerificationStageCriterion[];
  generatedAt: Date;
}

export interface ComputeUserVerificationStageInput {
  userId: string;
  role?: string | null;
  identityVerified?: boolean;
  trustScore?: number | null;
  providerPageVerified?: boolean;
  studentProfileApproved?: boolean;
  followerCount?: number;
  confirmedFraudCount?: number;
  recentFraudCount?: number;
  flaggedForReview?: boolean;
}

export interface ProviderDiscoveryStats {
  providerId: string;
  trustScore: number;
  activeDays: number;
  recommendationCount: number;
  followerCount: number;
  recommendationScore: number;
}

export function computeProviderRecommendationScore(input: {
  trustScore: number;
  activeDays: number;
  recommendationCount: number;
}): number {
  const trust = Math.max(0, Math.min(100, input.trustScore));
  const activity = Math.max(0, Math.min(30, input.activeDays)) / 30 * 100;
  const recommendations = Math.min(100, Math.log1p(Math.max(0, input.recommendationCount)) / Math.log1p(50) * 100);
  return Math.round(trust * 0.45 + activity * 0.25 + recommendations * 0.3);
}

export function computeUserVerificationStage(
  input: ComputeUserVerificationStageInput,
): VerificationStageResult {
  const role = input.role ?? null;
  const confirmedFraudCount = Math.max(0, input.confirmedFraudCount ?? 0);
  const recentFraudCount = Math.max(0, input.recentFraudCount ?? 0);
  const flaggedForReview = input.flaggedForReview === true;
  const riskBlocked = confirmedFraudCount > 0 || recentFraudCount > 0 || flaggedForReview;

  const identityMet = input.identityVerified === true;
  const providerMet = ['AGENT', 'LANDLORD'].includes(role ?? '') && input.providerPageVerified === true;
  const studentMet = role === 'STUDENT' && input.studentProfileApproved === true;
  const trustMet = (input.trustScore ?? 0) >= 85;
  const followersMet = (input.followerCount ?? 0) >= 10;

  const isProvider = ['AGENT', 'LANDLORD'].includes(role ?? '');
  const eligible = identityMet && (
    (isProvider && providerMet) ||
    (role === 'STUDENT' && studentMet) ||
    role === 'ADMIN'
  );
  const criteria: VerificationStageCriterion[] = [
    { key: 'identity', label: 'Identity verified', met: identityMet, required: true },
    ...(isProvider
      ? [
          { key: 'provider' as const, label: 'Provider verification', met: providerMet, required: true },
          { key: 'followers' as const, label: '10 followers', met: followersMet, required: true },
          { key: 'trust' as const, label: 'Trust score threshold', met: trustMet, required: false },
        ]
      : role === 'STUDENT'
        ? [
            { key: 'student' as const, label: 'Student verification', met: studentMet, required: true },
            { key: 'followers' as const, label: '10 followers', met: followersMet, required: true },
          ]
        : []),
  ];

  let stage: VerificationStageName = 'PROFILE_VERIFIED';
  let badge: VerificationBadge = 'GREEN_CHECK';
  let badgeColor: VerificationBadgeColor = 'green';
  let nextMilestone: string | null = null;

  if (riskBlocked) {
    stage = 'PROFILE_VERIFIED';
    badge = 'GREEN_CHECK';
    badgeColor = 'green';
    nextMilestone = 'Resolve reported fraud and restore account health';
  } else if (!identityMet) {
    stage = 'PROFILE_VERIFIED';
    badge = 'GREEN_CHECK';
    badgeColor = 'green';
    nextMilestone = 'Complete identity verification';
  } else if (providerMet && followersMet && trustMet) {
    stage = 'TRUST_CROWN';
    badge = 'GOLD_CROWN';
    badgeColor = 'gold';
    nextMilestone = null;
  } else if (providerMet && followersMet) {
    stage = 'AGENT_VERIFIED';
    badge = 'BLUE_SHIELD';
    badgeColor = 'blue';
    nextMilestone = 'Reach a trust score of 85 for the crown badge';
  } else {
    stage = 'PROFILE_VERIFIED';
    badge = 'GREEN_CHECK';
    badgeColor = 'green';
    if (['AGENT', 'LANDLORD'].includes(role ?? '')) {
      nextMilestone = !providerMet
        ? 'Submit and verify your provider profile'
        : 'Reach 10 followers to unlock your provider badge';
    } else if (role === 'STUDENT' && !studentMet) {
      nextMilestone = 'Complete student verification';
    } else if (role === 'STUDENT' && !followersMet) {
      nextMilestone = 'Reach 10 followers to complete your verification';
    } else {
      nextMilestone = 'Complete profile verification to unlock recognition';
    }
  }

  return {
    userId: input.userId,
    role,
    eligible,
    stage,
    badge,
    badgeColor,
    riskBlocked,
    nextMilestone,
    criteria,
    generatedAt: new Date(),
  };
}

export interface TrustScoreResult {
  score: number | null;
  breakdown: Record<string, number>;
  flaggedForReview: boolean;
  lastUpdated: Date | null;
  eventCount: number;
}

@Injectable()
export class TrustService {
  private readonly logger = new Logger(TrustService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectJobQueue(EMAIL_QUEUE) private readonly emailQueue: JobQueueClient,
  ) {}

  async getVerificationStage(userId: string): Promise<VerificationStageResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        identityVerified: true,
        trustScore: true,
        providerPage: {
          select: { verificationState: true },
        },
        studentProfile: {
          select: { status: true },
        },
        _count: { select: { followers: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const trustScore = await this.getTrustScore(userId);
    const confirmedFraudCount = await this.prisma.fraudReport.count({
      where: { targetUserId: userId, status: 'CONFIRMED' },
    });
    const recentFraudCount = await this.prisma.fraudReport.count({
      where: {
        targetUserId: userId,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
    });

    const computed = computeUserVerificationStage({
      userId: user.id,
      role: user.role,
      identityVerified: user.identityVerified,
      trustScore: user.trustScore ?? trustScore.score ?? 0,
      providerPageVerified: user.providerPage?.verificationState === 'VERIFIED',
      studentProfileApproved: user.studentProfile?.status === 'APPROVED',
      followerCount: user._count.followers,
      confirmedFraudCount,
      recentFraudCount,
      flaggedForReview: trustScore.flaggedForReview,
    });

    const persistedTrustScore = Math.round(user.trustScore ?? trustScore.score ?? 0);
    let previousVerification: { stage: VerificationStageName; identityVerified: boolean } | null = null;
    try {
      previousVerification = await this.prisma.userVerification.findUnique({
        where: { userId },
        select: { stage: true, identityVerified: true },
      });
      await this.prisma.userVerification.upsert({
        where: { userId },
        update: {
          stage: computed.stage,
          badge: computed.badge,
          badgeColor: computed.badgeColor,
          riskBlocked: computed.riskBlocked,
          identityVerified: computed.criteria.some((criterion) => criterion.key === 'identity' && criterion.met),
          providerVerified: computed.criteria.some((criterion) => criterion.key === 'provider' && criterion.met),
          studentProfileApproved: computed.criteria.some((criterion) => criterion.key === 'student' && criterion.met),
          trustScore: computed.stage === 'TRUST_CROWN' ? Math.max(85, persistedTrustScore) : persistedTrustScore,
          nextMilestone: computed.nextMilestone,
          lastComputedAt: new Date(),
        },
        create: {
          userId,
          stage: computed.stage,
          badge: computed.badge,
          badgeColor: computed.badgeColor,
          riskBlocked: computed.riskBlocked,
          identityVerified: computed.criteria.some((criterion) => criterion.key === 'identity' && criterion.met),
          providerVerified: computed.criteria.some((criterion) => criterion.key === 'provider' && criterion.met),
          studentProfileApproved: computed.criteria.some((criterion) => criterion.key === 'student' && criterion.met),
          trustScore: persistedTrustScore,
          nextMilestone: computed.nextMilestone,
        },
      });
    } catch (error) {
      this.logger.error(
        `Unable to read or persist verification stage for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { ...computed, generatedAt: new Date() };
    }

    this.enqueueBadgeAwardIfNew(
      { ...user, verification: previousVerification },
      computed,
      Number(user.trustScore ?? trustScore.score ?? 0),
    );

    return { ...computed, generatedAt: new Date() };
  }

  private enqueueBadgeAwardIfNew(
    user: {
      id: string;
      email: string;
      displayName: string | null;
      verification: { stage: VerificationStageName; identityVerified: boolean } | null;
    },
    computed: VerificationStageResult,
    trustScore: number,
  ) {
    if (computed.riskBlocked) return;

    const previous = user.verification;
    const identityMet = computed.criteria.some((criterion) => criterion.key === 'identity' && criterion.met);
    const newlyAwarded =
      computed.eligible && (
        (computed.stage === 'TRUST_CROWN' && previous?.stage !== 'TRUST_CROWN') ||
        (computed.stage === 'AGENT_VERIFIED' && previous?.stage !== 'AGENT_VERIFIED' && previous?.stage !== 'TRUST_CROWN') ||
        (computed.stage === 'PROFILE_VERIFIED' && identityMet && previous?.identityVerified !== true)
      );

    if (!newlyAwarded) return;

    void this.emailQueue
      .add('verification-badge-awarded', {
        type: 'verification-badge',
        to: user.email,
        displayName: user.displayName,
        stage: computed.stage,
        badge: computed.badge,
        badgeColor: computed.badgeColor,
        trustScore,
      }, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
        jobId: `email:verification-badge:${user.id}:${computed.stage}`,
      })
      .catch((error: Error) => {
        this.logger.error(`Unable to queue verification badge email for ${user.email}: ${error.message}`, error.stack);
      });
  }

  async getTrustScore(userId: string): Promise<TrustScoreResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        trustScore: true,
        trustScoreUpdatedAt: true,
        _count: { select: { trustEvents: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!['AGENT', 'LANDLORD'].includes(user.role)) {
      return this.recomputeScore(userId);
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (!['AGENT', 'LANDLORD'].includes(user.role)) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { trustScore: null, trustScoreUpdatedAt: null },
      });
      return {
        score: null,
        breakdown: {},
        flaggedForReview: false,
        lastUpdated: null,
        eventCount: 0,
      };
    }

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
    score: number | null;
    breakdown: Record<string, number>;
    flaggedForReview: boolean;
    events: Array<{ type: string; weight: number; occurredAt: Date }>;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!['AGENT', 'LANDLORD'].includes(user.role)) {
      return { score: null, breakdown: {}, flaggedForReview: false, events: [] };
    }

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

  async recordProviderActivity(userId: string): Promise<{ recorded: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'AGENT' && user.role !== 'LANDLORD') {
      throw new ForbiddenException('Only providers have activity-day tracking');
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await this.prisma.providerActivityDay.upsert({
      where: { providerId_activeDate: { providerId: userId, activeDate: today } },
      create: { providerId: userId, activeDate: today },
      update: {},
    });
    return { recorded: true };
  }

  async recommendProvider(recommenderId: string, providerId: string): Promise<{ recommended: boolean }> {
    if (recommenderId === providerId) throw new ForbiddenException('You cannot recommend yourself');
    const [recommender, provider] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: recommenderId }, select: { role: true } }),
      this.prisma.user.findUnique({ where: { id: providerId }, select: { role: true } }),
    ]);
    if (!recommender || recommender.role !== 'STUDENT') {
      throw new ForbiddenException('Only students can recommend providers');
    }
    if (!provider || (provider.role !== 'AGENT' && provider.role !== 'LANDLORD')) {
      throw new NotFoundException('Provider not found');
    }

    await this.prisma.providerRecommendation.upsert({
      where: { recommenderId_providerId: { recommenderId, providerId } },
      create: { recommenderId, providerId },
      update: {},
    });
    return { recommended: true };
  }

  async removeProviderRecommendation(recommenderId: string, providerId: string): Promise<{ recommended: boolean }> {
    await this.prisma.providerRecommendation.deleteMany({ where: { recommenderId, providerId } });
    return { recommended: false };
  }

  async getMyRecommendations(recommenderId: string): Promise<string[]> {
    const records = await this.prisma.providerRecommendation.findMany({
      where: { recommenderId },
      select: { providerId: true },
    });
    return records.map((record) => record.providerId);
  }

  async getProviderDiscoveryStats(providerId: string): Promise<ProviderDiscoveryStats> {
    const provider = await this.prisma.user.findUnique({
      where: { id: providerId },
      select: { id: true, role: true, trustScore: true, _count: { select: { followers: true } } },
    });
    if (!provider || (provider.role !== 'AGENT' && provider.role !== 'LANDLORD')) {
      throw new NotFoundException('Provider not found');
    }

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 29);
    cutoff.setUTCHours(0, 0, 0, 0);
    const [activeDays, recommendationCount] = await Promise.all([
      this.prisma.providerActivityDay.count({ where: { providerId, activeDate: { gte: cutoff } } }),
      this.prisma.providerRecommendation.count({ where: { providerId } }),
    ]);
    const trustScore = Number(provider.trustScore ?? 0);
    return {
      providerId,
      trustScore,
      activeDays,
      recommendationCount,
      followerCount: provider._count.followers,
      recommendationScore: computeProviderRecommendationScore({ trustScore, activeDays, recommendationCount }),
    };
  }
}
