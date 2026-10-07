#!/usr/bin/env node
/**
 * Backfill script: generate a `username` for every user where it is null or empty.
 *
 * Uses the same `generateUniqueUsername` helper as the signup paths so the
 * format and collision behaviour are identical.
 *
 * Usage:
 *   DRY RUN (safe, prints counts + 10 samples, no writes):
 *     npx tsx scripts/backfill-usernames.ts --dry-run
 *
 *   APPLY (writes usernames to the database):
 *     npx tsx scripts/backfill-usernames.ts
 *
 *   ALSO FILL EMPTY DISPLAY NAMES (optional):
 *     npx tsx scripts/backfill-usernames.ts --with-display-names
 *
 * The script is additive and reversible: it only ever SETS a username on rows
 * where the column is null or empty. It never overwrites an existing username.
 * When `--with-display-names` is passed, it also fills in a display name for
 * users where it is null, deriving it from the email local part as a last resort.
 */

import { PrismaClient } from '@prisma/client';
import { generateUniqueUsername } from '../src/common/username.utils.js';

const prisma = new PrismaClient();

function emailNameFallback(email: string): string {
  const localPart = String(email ?? '').split('@')[0] ?? '';
  const cleaned = localPart.toLowerCase().replace(/[^a-z]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'SafeCrib member';
}

async function exists(username: string, excludeUserId?: string): Promise<boolean> {
  const where: any = { username };
  if (excludeUserId) {
    where.NOT = { id: excludeUserId };
  }
  const found = await prisma.user.findFirst({ where, select: { id: true } });
  return found !== null;
}

async function main() {
  const apply = process.argv.includes('--dry-run') === false;
  const fillDisplayNames = process.argv.includes('--with-display-names');

  const users = await prisma.user.findMany({
    where: { OR: [{ username: null }, { username: '' }] },
    select: { id: true, email: true, displayName: true, username: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${users.length} users with a missing username.`);

  const samples: Array<{ email: string; displayName: string | null; username: string }> = [];
  let generated = 0;
  let displayFilled = 0;

  for (const user of users) {
    const username = await generateUniqueUsername(user.email, (candidate) =>
      exists(candidate, user.id),
    );

    const data: { username: string; displayName?: string } = { username };

    if (fillDisplayNames && (!user.displayName || !user.displayName.trim())) {
      data.displayName = emailNameFallback(user.email);
      displayFilled += 1;
    }

    if (apply) {
      await prisma.user.update({
        where: { id: user.id },
        data,
      });
    }
    generated += 1;
    if (samples.length < 10) {
      samples.push({ email: user.email, displayName: data.displayName ?? user.displayName, username });
    }
  }

  console.log(`\nGenerated ${generated} usernames${apply ? ' (applied)' : ' (dry-run, not applied)'}.`);
  if (fillDisplayNames) {
    console.log(`Would fill / filled ${displayFilled} empty display names from the email local part.`);
  }

  if (samples.length) {
    console.log('\nSample usernames (first 10):');
    for (const sample of samples) {
      console.log(`  ${sample.email} -> @${sample.username} (display: ${sample.displayName ?? '—'})`);
    }
  }

  // Also report existing users with a valid username, for context.
  const withUsername = await prisma.user.count({ where: { username: { not: null } } });
  console.log(`\nUsers with an existing username (untouched): ${withUsername}`);
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });