import { describe, it, expect } from 'vitest';
import { computeTrustScore, type TrustEvent } from './trust-score.engine.js';

const now = new Date('2026-01-01T00:00:00Z');

function events(overrided: Partial<TrustEvent>): TrustEvent;
function events(ev: Partial<TrustEvent>): TrustEvent;
function events(ev: Partial<TrustEvent>): TrustEvent {
  return {
    type: 'BOOKING_COMPLETED',
    weight: 20,
    occurredAt: now,
    ...ev,
  };
}

describe('computeTrustScore', () => {
  it('returns neutral score for no events', () => {
    const result = computeTrustScore([], now);
    expect(result.score).toBe(50);
    expect(result.flaggedForReview).toBe(false);
  });

  it('scores high for many completed bookings', () => {
    const es: TrustEvent[] = Array.from({ length: 10 }, () =>
      events({ type: 'BOOKING_COMPLETED', weight: 20, occurredAt: now }),
    );
    const result = computeTrustScore(es, now);
    expect(result.score).toBeGreaterThan(70);
    expect(result.flaggedForReview).toBe(false);
  });

  it('penalizes heavily for confirmed fraud', () => {
    const es: TrustEvent[] = [
      events({ type: 'FRAUD_REPORT_CONFIRMED', weight: -60, occurredAt: now }),
    ];
    const result = computeTrustScore(es, now);
    expect(result.score).toBeLessThan(40);
    expect(result.flaggedForReview).toBe(true);
  });

  it('weights disputes against more than disputes for', () => {
    const against = computeTrustScore(
      [events({ type: 'DISPUTE_RESOLVED_AGAINST', weight: -30, occurredAt: now })],
      now,
    );
    const forEv = computeTrustScore(
      [events({ type: 'DISPUTE_RESOLVED_FOR', weight: 15, occurredAt: now })],
      now,
    );
    expect(against.score).toBeLessThan(50);
    expect(forEv.score).toBeGreaterThan(50);
  });

  it('applies recency decay — old events count less', () => {
    const recent = computeTrustScore(
      [events({ type: 'BOOKING_COMPLETED', weight: 20, occurredAt: now })],
      now,
    );
    const oldScore = computeTrustScore(
      [
        events({
          type: 'BOOKING_COMPLETED',
          weight: 20,
          occurredAt: new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000),
        }),
      ],
      now,
    );
    expect(recent.score).toBeGreaterThan(oldScore.score);
  });

  it('weights reviews by reviewer trust factor (sybil resistance)', () => {
    const trusted = computeTrustScore(
      [events({ type: 'REVIEW_RECEIVED', weight: 10, occurredAt: now, reviewerTrustFactor: 0.9 })],
      now,
    );
    const sybil = computeTrustScore(
      [events({ type: 'REVIEW_RECEIVED', weight: 10, occurredAt: now, reviewerTrustFactor: 0.1 })],
      now,
    );
    expect(trusted.score).toBeGreaterThan(sybil.score);
  });

  it('flags for review on high variance (inconsistent ratings)', () => {
    const es: TrustEvent[] = [];
    for (let i = 0; i < 4; i++) {
      es.push(events({ type: 'BOOKING_COMPLETED', weight: 20, occurredAt: now }));
      es.push(events({ type: 'DISPUTE_RESOLVED_AGAINST', weight: 30, occurredAt: now }));
    }
    const result = computeTrustScore(es, now);
    expect(result.flaggedForReview).toBe(true);
  });

  it('does not flag consistent positive history', () => {
    const es: TrustEvent[] = Array.from({ length: 5 }, () =>
      events({ type: 'BOOKING_COMPLETED', weight: 20, occurredAt: now }),
    );
    const result = computeTrustScore(es, now);
    expect(result.flaggedForReview).toBe(false);
  });

  it('flags for review when a recent dispute exists', () => {
    const es: TrustEvent[] = [
      events({ type: 'DISPUTE_RESOLVED_AGAINST', weight: 30, occurredAt: now }),
    ];
    const result = computeTrustScore(es, now);
    expect(result.flaggedForReview).toBe(true);
  });

  it('does not flag when dispute is very old', () => {
    const es: TrustEvent[] = [
      events({
        type: 'DISPUTE_RESOLVED_AGAINST',
        weight: 30,
        occurredAt: new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000),
      }),
    ];
    const result = computeTrustScore(es, now);
    expect(result.flaggedForReview).toBe(false);
  });

  it('includes identity verification in breakdown', () => {
    const es: TrustEvent[] = [
      events({ type: 'IDENTITY_VERIFIED', weight: 15, occurredAt: now }),
    ];
    const result = computeTrustScore(es, now);
    expect(result.breakdown.IDENTITY_VERIFIED).toBeGreaterThan(0);
  });

  it('clamps score to 0-100 range', () => {
    const es: TrustEvent[] = Array.from({ length: 50 }, () =>
      events({ type: 'BOOKING_COMPLETED', weight: 100, occurredAt: now }),
    );
    const result = computeTrustScore(es, now);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
