import { describe, expect, it } from 'vitest';
import {
  generateRandomDigits,
  generateUniqueUsername,
  generateUsername,
  isBlockedDisplayName,
  normaliseDisplayName,
} from '../../src/common/username.utils.js';

describe('generateUsername', () => {
  it('derives the name part from the email local part (lowercased, letters only)', () => {
    const username = generateUsername('VictoryGray59@gmail.com');
    expect(username).toMatch(/^victorygray_\d{5}$/);
  });

  it('strips dots, plus tags, hyphens and numbers', () => {
    const username = generateUsername('john.doe+newsletter@example.com');
    expect(username).toMatch(/^johndoenewsl_\d{5}$/);
    expect(username.split('_')[0]).toHaveLength(12);
  });

  it('strips numbers-only local parts and falls back to "user"', () => {
    const username = generateUsername('12345@gmail.com');
    expect(username).toMatch(/^user_\d{5}$/);
  });

  it('caps the name part at 12 characters', () => {
    const username = generateUsername('averylongemailaddress@example.com');
    expect(username).toMatch(/^averylongema_\d{5}$/);
    expect(username.split('_')[0]).toHaveLength(12);
  });

  it('handles unicode letters by dropping them (non a-z stripped)', () => {
    const username = generateUsername('josé@example.com');
    expect(username).toMatch(/^jos_\d{5}$/);
  });

  it('lowercases the name part', () => {
    const username = generateUsername('UPPERCASE@EXAMPLE.COM');
    expect(username).toMatch(/^uppercase_\d{5}$/);
  });

  it('returns a 5-digit suffix derived from a UUID (not Math.random)', () => {
    const username = generateUsername('test@example.com');
    const suffix = username.split('_')[1];
    expect(suffix).toMatch(/^\d{5}$/);
    expect(suffix).not.toBe('00000');
  });

  it('never produces a username with the leading @', () => {
    const username = generateUsername('test@example.com');
    expect(username.startsWith('@')).toBe(false);
  });
});

describe('generateRandomDigits', () => {
  it('returns a 5-digit string', () => {
    const digits = generateRandomDigits();
    expect(digits).toMatch(/^\d{5}$/);
  });
});

describe('generateUniqueUsername', () => {
  it('returns a unique username when no collisions occur', async () => {
    const exists = async () => false;
    const username = await generateUniqueUsername('alice@example.com', exists);
    expect(username).toMatch(/^alice_\d{5}$/);
  });

  it('retries with fresh digits on collision', async () => {
    // Capture the first candidate and force a collision on exactly that one.
    let firstCandidate: string | null = null;
    let calls = 0;
    const exists = async (candidate: string) => {
      calls += 1;
      if (firstCandidate === null) firstCandidate = candidate;
      return candidate === firstCandidate;
    };
    const username = await generateUniqueUsername('bob@example.com', exists);
    expect(username).toMatch(/^bob_\d{5}$/);
    expect(calls).toBeGreaterThan(1);
    expect(username).not.toBe(firstCandidate);
  });

  it('falls back to 6 digits after 5 consecutive 5-digit collisions', async () => {
    // Everything collides at 5 digits, but 6-digit candidates are accepted.
    let calls = 0;
    const exists = async (candidate: string) => {
      calls += 1;
      return candidate.length - candidate.indexOf('_') - 1 === 5;
    };
    const username = await generateUniqueUsername('carol@example.com', exists);
    expect(username).toMatch(/^carol_\d{6}$/);
    expect(calls).toBe(6); // 5 attempts at 5 digits + 1 accepted 6-digit attempt
  });

  it('never throws even under total collision', async () => {
    const exists = async () => true;
    const username = await generateUniqueUsername('dave@example.com', exists);
    expect(typeof username).toBe('string');
    expect(username.startsWith('dave_')).toBe(true);
  });
});

describe('normaliseDisplayName', () => {
  it('trims and collapses repeated spaces', () => {
    expect(normaliseDisplayName('  Jane    Doe  ')).toBe('Jane Doe');
  });

  it('rejects names shorter than 2 characters', () => {
    expect(normaliseDisplayName('A')).toBeNull();
  });

  it('rejects names longer than 50 characters', () => {
    expect(normaliseDisplayName('A'.repeat(51))).toBeNull();
  });

  it('allows exactly 2 and 50 characters', () => {
    expect(normaliseDisplayName('AB')).toBe('AB');
    expect(normaliseDisplayName('A'.repeat(50))).toHaveLength(50);
  });

  it('strips control characters and HTML tags', () => {
    expect(normaliseDisplayName('<b>Jane</b>')).toBe('Jane');
    expect(normaliseDisplayName('Jane\x00Doe')).toBe('JaneDoe');
  });

  it('allows emojis and unicode letters', () => {
    expect(normaliseDisplayName('José 😎')).toBe('José 😎');
  });

  it('returns null for non-string input', () => {
    expect(normaliseDisplayName(null)).toBeNull();
    expect(normaliseDisplayName(undefined)).toBeNull();
    expect(normaliseDisplayName(123 as unknown as string)).toBeNull();
  });
});

describe('isBlockedDisplayName', () => {
  it('blocks exact platform impersonation names (case-insensitive)', () => {
    expect(isBlockedDisplayName('SafeCribs')).toBe(true);
    expect(isBlockedDisplayName('admin')).toBe(true);
    expect(isBlockedDisplayName('Support')).toBe(true);
  });

  it('does not block normal names', () => {
    expect(isBlockedDisplayName('Jane Doe')).toBe(false);
    expect(isBlockedDisplayName('SafeCrib Support Team')).toBe(false);
  });
});