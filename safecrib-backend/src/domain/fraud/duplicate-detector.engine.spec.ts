import { describe, it, expect } from 'vitest';
import {
  comparePhash,
  compareListingText,
  evaluateDuplicateRisk,
  isHighRiskFlag,
} from './duplicate-detector.engine.js';
import type { ListingFingerprint } from './duplicate-detector.engine.js';

describe('duplicate-detector', () => {
  describe('comparePhash', () => {
    it('returns 0 for identical hashes', () => {
      expect(comparePhash('abcdef', 'abcdef')).toBe(0);
    });

    it('returns number of differing bits', () => {
      expect(comparePhash('abcdef', 'abceef')).toBe(1);
      expect(comparePhash('abcdef', 'gbcdij')).toBe(3);
    });

    it('returns Infinity for different length hashes', () => {
      expect(comparePhash('abc', 'abcdef')).toBe(Infinity);
    });
  });

  describe('compareListingText', () => {
    it('returns 1 for identical text', () => {
      expect(compareListingText('hello world test', 'hello world test')).toBe(1);
    });

    it('returns 0 for completely different text', () => {
      expect(compareListingText('hello world', 'xyz abc')).toBe(0);
    });

    it('returns partial similarity for overlapping tokens', () => {
      const sim = compareListingText('hello world test foo', 'hello world bar');
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });

    it('ignores short tokens (<=2 chars)', () => {
      expect(compareListingText('a b c', 'a b c')).toBe(0);
    });

    it('is case insensitive', () => {
      expect(compareListingText('HELLO World', 'hello world')).toBe(1);
    });
  });

  describe('evaluateDuplicateRisk', () => {
    const base: ListingFingerprint = {
      id: 'listing-1',
      description: 'Cozy room near campus with wifi and AC',
      lat: 9.0765,
      lng: 7.3986,
      price: 50000,
    };

    it('flags identical photo hashes', () => {
      const existing: ListingFingerprint[] = [
        { ...base, id: 'listing-2', phash: base.phash },
      ];
      const candidate = { ...base, id: 'listing-1', phash: 'abc123def456' };
      const existingWithHash = [{ ...existing[0], phash: 'abc123def456' }];
      const flags = evaluateDuplicateRisk(candidate, existingWithHash);
      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].matchType).toBe('IMAGE_PHASH');
    });

    it('does not flag different photos with different phashes', () => {
      const existing: ListingFingerprint[] = [
        { ...base, id: 'listing-2', phash: 'aaaa1111bbbb2222' },
      ];
      const candidate = { ...base, id: 'listing-1', phash: 'cccc3333dddd4444' };
      const flags = evaluateDuplicateRisk(candidate, existing);
      const imageFlags = flags.filter((f) => f.matchType === 'IMAGE_PHASH');
      expect(imageFlags).toHaveLength(0);
    });

    it('flags geo+price collision', () => {
      const existing: ListingFingerprint[] = [
        { ...base, id: 'listing-2', phash: 'aaaa', description: 'totally different' },
      ];
      const candidate = {
        ...base,
        id: 'listing-1',
        phash: 'zzzzz',
        description: 'something else entirely',
      };
      const flags = evaluateDuplicateRisk(candidate, existing);
      const geoFlags = flags.filter((f) => f.matchType === 'GEO_PRICE');
      expect(geoFlags.length).toBe(1);
    });

  it('does not flag geo+price when coords differ slightly', () => {
    const existing: ListingFingerprint[] = [
      { ...base, id: 'listing-2', phash: 'aaaa', description: 'totally different' },
    ];
    const candidate = {
      ...base,
      id: 'listing-1',
      phash: 'zzzzz',
      lat: 9.1, // ~0.023 difference — clearly different location
      description: 'something else entirely',
    };
    const flags = evaluateDuplicateRisk(candidate, existing);
    const geoFlags = flags.filter((f) => f.matchType === 'GEO_PRICE');
    expect(geoFlags).toHaveLength(0);
  });

    it('does not flag text-similarity when text is very different', () => {
      const existing: ListingFingerprint[] = [
        { ...base, id: 'listing-2', phash: 'aaaa' },
      ];
      const candidate = {
        ...base,
        id: 'listing-1',
        phash: 'zzzz',
        description: 'completely unrelated listing about cats',
      };
      const flags = evaluateDuplicateRisk(candidate, existing);
      const textFlags = flags.filter((f) => f.matchType === 'TEXT_SIMILARITY');
      expect(textFlags).toHaveLength(0);
    });

    it('skips self comparison', () => {
      const existing: ListingFingerprint[] = [{ ...base, id: 'listing-1' }];
      const candidate = { ...base, id: 'listing-1' };
      const flags = evaluateDuplicateRisk(candidate, existing);
      expect(flags).toHaveLength(0);
    });
  });

  describe('isHighRiskFlag', () => {
    it('returns true for high text similarity', () => {
      expect(
        isHighRiskFlag([
          { listingIdA: 'a', listingIdB: 'b', matchType: 'TEXT_SIMILARITY', similarity: 0.95 },
        ]),
      ).toBe(true);
    });

    it('returns true for geo_price match', () => {
      expect(
        isHighRiskFlag([
          { listingIdA: 'a', listingIdB: 'b', matchType: 'GEO_PRICE', similarity: 1.0 },
        ]),
      ).toBe(true);
    });

    it('returns false for low similarity', () => {
      expect(
        isHighRiskFlag([
          { listingIdA: 'a', listingIdB: 'b', matchType: 'TEXT_SIMILARITY', similarity: 0.5 },
        ]),
      ).toBe(false);
    });
  });
});
