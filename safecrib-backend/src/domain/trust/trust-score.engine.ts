export type TrustEventType =
  | 'BOOKING_COMPLETED'
  | 'DISPUTE_RESOLVED_AGAINST'
  | 'DISPUTE_RESOLVED_FOR'
  | 'FRAUD_REPORT_CONFIRMED'
  | 'REVIEW_RECEIVED'
  | 'IDENTITY_VERIFIED';

export interface TrustEvent {
  type: TrustEventType;
  weight: number;
  occurredAt: Date;
  reviewerTrustFactor?: number;
}

export interface TrustScoreResult {
  score: number;
  breakdown: Record<string, number>;
  flaggedForReview: boolean;
}

const DEFAULT_WEIGHTS: Record<TrustEventType, number> = {
  IDENTITY_VERIFIED: 15,
  BOOKING_COMPLETED: 20,
  REVIEW_RECEIVED: 10,
  DISPUTE_RESOLVED_FOR: -15,
  DISPUTE_RESOLVED_AGAINST: -30,
  FRAUD_REPORT_CONFIRMED: -60,
};

const DECAY_HALF_LIFE_MS = 180 * 24 * 60 * 60 * 1000;

const MIN_SCORE = 0;
const MAX_SCORE = 100;
const NEUTRAL_SCORE = 50;

function recencyWeight(occurredAt: Date, now: Date): number {
  const ageMs = now.getTime() - occurredAt.getTime();
  if (ageMs < 0) return 0;
  return Math.pow(0.5, ageMs / DECAY_HALF_LIFE_MS);
}

export function computeTrustScore(
  events: TrustEvent[],
  now: Date = new Date(),
): TrustScoreResult {
  const breakdown: Record<string, number> = {};
  let total = 0;

  const categorySums: Record<string, { sum: number; count: number; values: number[] }> = {};

  for (const event of events) {
    const baseWeight = event.weight > 0 ? event.weight : DEFAULT_WEIGHTS[event.type];
    const recency = recencyWeight(event.occurredAt, now);

    let effectiveWeight = baseWeight * recency;

    if (event.type === 'REVIEW_RECEIVED' && event.reviewerTrustFactor !== undefined) {
      const rtf = Math.max(0, Math.min(1, event.reviewerTrustFactor));
      effectiveWeight *= rtf;
    }

    const category = event.type;
    if (!categorySums[category]) {
      categorySums[category] = { sum: 0, count: 0, values: [] };
    }
    categorySums[category].sum += effectiveWeight;
    categorySums[category].count += 1;
    categorySums[category].values.push(effectiveWeight);

    total += effectiveWeight;
    breakdown[category] = (breakdown[category] ?? 0) + effectiveWeight;
  }

  const MAX_EXPECTED_WEIGHT = 200;
  const normalized = total / MAX_EXPECTED_WEIGHT;
  const score = Math.max(MIN_SCORE, Math.min(MAX_SCORE, NEUTRAL_SCORE + normalized * NEUTRAL_SCORE));

  const { flaggedForReview } = computeVarianceAndFlags(categorySums);

  return {
    score: Math.round(score),
    breakdown,
    flaggedForReview: flaggedForReview || hasRecentDispute(events, now),
  };
}

function computeVarianceAndFlags(
  categorySums: Record<string, { sum: number; count: number; values: number[] }>,
): { flaggedForReview: boolean; variance: Record<string, number> } {
  const variance: Record<string, number> = {};
  let flagged = false;

  const allValues: number[] = [];

  for (const [category, data] of Object.entries(categorySums)) {
    if (data.values.length === 0) continue;

    const mean = data.sum / data.count;
    let sumSqDiff = 0;
    for (const v of data.values) {
      sumSqDiff += Math.pow(v - mean, 2);
    }
    const catVariance = data.count > 1 ? sumSqDiff / data.count : 0;
    variance[category] = catVariance;
    allValues.push(...data.values);

    if (catVariance > 200) {
      flagged = true;
    }
  }

  if (allValues.length > 3) {
    const overallVariance = computeVariance(allValues);
    if (overallVariance > 100) {
      flagged = true;
    }
  }

  return { flaggedForReview: flagged, variance };
}

function computeVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiffs = values.map((v) => Math.pow(v - mean, 2));
  return sqDiffs.reduce((a, b) => a + b, 0) / values.length;
}

function hasRecentDispute(events: TrustEvent[], now: Date): boolean {
  const sixMonthsMs = 180 * 24 * 60 * 60 * 1000;
  return events.some(
    (e) =>
      (e.type === 'DISPUTE_RESOLVED_AGAINST' || e.type === 'FRAUD_REPORT_CONFIRMED') &&
      now.getTime() - e.occurredAt.getTime() < sixMonthsMs,
  );
}

export function computeReviewerTrustFactor(
  events: TrustEvent[],
  now: Date = new Date(),
): number {
  const totalWeight = events.reduce((sum, e) => {
    const baseWeight = e.weight > 0 ? e.weight : DEFAULT_WEIGHTS[e.type];
    return sum + baseWeight * recencyWeight(e.occurredAt, now);
  }, 0);

  const maxExpected = 500;
  return Math.max(0, Math.min(1, totalWeight / maxExpected));
}
