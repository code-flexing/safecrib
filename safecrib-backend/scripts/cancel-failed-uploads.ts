#!/usr/bin/env node
/**
 * cancel-failed-uploads.ts
 *
 * One-off cleanup script for media records left in the PENDING state after
 * failed Cloudinary uploads (for example when an upload preset did not exist
 * and Cloudinary rejected the upload with "Upload preset not found").
 *
 * Run after the Cloudinary configuration has been corrected:
 *
 *   npx ts-node -r tsconfig-paths/register scripts/cancel-failed-uploads.ts
 *
 * By default it cancels every PENDING record older than 10 minutes (the
 * signature TTL — anything older is certainly abandoned) and marks it FAILED
 * with a descriptive reason. Set MAX_AGE_MINUTES to raise or lower the cutoff.
 *
 * Requirements:
 *   DATABASE_URL (Prisma connection string)
 */

import { config } from 'dotenv';
config({ path: '.env' });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['error', 'warn', 'info'],
});

const MAX_AGE_MINUTES = Number(process.env.MAX_AGE_MINUTES ?? '10');
const CUTOFF_MS = MAX_AGE_MINUTES * 60 * 1000;
const REASON =
  'Upload failed: Cloudinary rejected the upload (invalid or missing upload preset). ' +
  'Record cancelled during post-fix cleanup.';

async function main(): Promise<void> {
  const cutoff = new Date(Date.now() - CUTOFF_MS);

  const stale = await prisma.media.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: cutoff },
    },
    select: { id: true, purpose: true, publicId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  if (stale.length === 0) {
    console.log(`\nNo stale PENDING media records found (cutoff: ${cutoff.toISOString()}).`);
    return;
  }

  console.log(
    `\nFound ${stale.length} stale PENDING media record(s) older than ${MAX_AGE_MINUTES} min. ` +
      `Cancelling as FAILED...\n`,
  );

  const result = await prisma.media.updateMany({
    where: {
      status: 'PENDING',
      id: { in: stale.map((m) => m.id) },
    },
    data: {
      status: 'FAILED',
      failureReason: REASON,
    },
  });

  for (const m of stale) {
    console.log(`  ✓ FAILED  purpose=${m.purpose}  publicId=${m.publicId}  createdAt=${m.createdAt.toISOString()}`);
  }

  console.log(
    `\n✅  Cancelled ${result.count} stale PENDING media record(s). ` +
      `No Cloudinary assets need deletion (these uploads never completed).`,
  );
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
