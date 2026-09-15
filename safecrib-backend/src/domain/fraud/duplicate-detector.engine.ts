export interface ListingFingerprint {
  id: string;
  phash?: string | null;
  description: string;
  lat: number;
  lng: number;
  price: number;
}

export interface DuplicateFlag {
  listingIdA: string;
  listingIdB: string;
  matchType: 'IMAGE_PHASH' | 'TEXT_SIMILARITY' | 'GEO_PRICE';
  similarity: number;
}

export interface DuplicateDetectionConfig {
  phashThreshold: number;
  textSimilarityThreshold: number;
  geoPriceThreshold: number;
}

const DEFAULT_CONFIG: DuplicateDetectionConfig = {
  phashThreshold: 15,
  textSimilarityThreshold: 0.85,
  geoPriceThreshold: 1,
};

export function comparePhash(hashA: string, hashB: string): number {
  if (hashA.length !== hashB.length) return Infinity;
  let distance = 0;
  for (let i = 0; i < hashA.length; i++) {
    if (hashA[i] !== hashB[i]) distance++;
  }
  return distance;
}

export function compareListingText(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  if (tokensA.size === 0 && tokensB.size === 0) return 0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  const intersection = [...tokensA].filter((t) => tokensB.has(t));
  const union = new Set([...tokensA, ...tokensB]);

  return intersection.length / union.size;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

export function evaluateDuplicateRisk(
  candidate: ListingFingerprint,
  existing: ListingFingerprint[],
  config: Partial<DuplicateDetectionConfig> = {},
): DuplicateFlag[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const flags: DuplicateFlag[] = [];

  for (const ex of existing) {
    if (ex.id === candidate.id) continue;

    if (candidate.phash && ex.phash) {
      const distance = comparePhash(candidate.phash, ex.phash);
      if (distance <= cfg.phashThreshold) {
        flags.push({
          listingIdA: candidate.id,
          listingIdB: ex.id,
          matchType: 'IMAGE_PHASH',
          similarity: 1 - distance / (candidate.phash.length || 1),
        });
      }
    }

    const textSim = compareListingText(candidate.description, ex.description);
    if (textSim >= cfg.textSimilarityThreshold) {
      flags.push({
        listingIdA: candidate.id,
        listingIdB: ex.id,
        matchType: 'TEXT_SIMILARITY',
        similarity: textSim,
      });
    }

    if (
      Math.abs(candidate.lat - ex.lat) < 0.001 &&
      Math.abs(candidate.lng - ex.lng) < 0.001 &&
      candidate.price === ex.price
    ) {
      flags.push({
        listingIdA: candidate.id,
        listingIdB: ex.id,
        matchType: 'GEO_PRICE',
        similarity: 1.0,
      });
    }
  }

  return flags;
}

export function isHighRiskFlag(flags: DuplicateFlag[]): boolean {
  return flags.some(
    (f) =>
      f.similarity >= 0.85 ||
      (f.matchType === 'GEO_PRICE' && f.similarity >= 0.9) ||
      (f.matchType === 'IMAGE_PHASH' && f.similarity >= 0.8),
  );
}
