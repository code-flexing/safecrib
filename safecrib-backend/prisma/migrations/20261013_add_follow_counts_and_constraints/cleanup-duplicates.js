#!/usr/bin/env node
/**
 * Cleanup script to remove duplicate follows.
 * Run with: node prisma/migrations/20261013_add_follow_counts_and_constraints/cleanup-duplicates.js
 * ONLY RUN AFTER REVIEWING THE DRY-RUN OUTPUT AND CONFIRMING.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function cleanupUserFollowDuplicates() {
  console.log('Cleaning up duplicate user follows...');
  
  // Delete duplicates, keeping the first (oldest) one based on created_at
  const result = await prisma.$executeRaw`
    DELETE FROM "user_follows"
    WHERE ctid NOT IN (
      SELECT MIN(ctid) FROM "user_follows"
      GROUP BY "follower_id", "followed_id"
    )
  `;
  
  console.log(`Deleted ${result} duplicate user follow rows`);
  return result;
}

async function cleanupPageFollowDuplicates() {
  console.log('Cleaning up duplicate page follows...');
  
  const result = await prisma.$executeRaw`
    DELETE FROM "page_follows"
    WHERE ctid NOT IN (
      SELECT MIN(ctid) FROM "page_follows"
      GROUP BY "follower_id", "page_id"
    )
  `;
  
  console.log(`Deleted ${result} duplicate page follow rows`);
  return result;
}

async function recalculateCounts() {
  console.log('Recalculating follower/following counts...');
  
  // Recalculate user follower_count
  await prisma.$executeRaw`
    UPDATE "users" u SET "follower_count" = (
      SELECT COUNT(*) FROM "user_follows" uf WHERE uf."followed_id" = u."id"
    )
  `;
  
  // Recalculate user following_count
  await prisma.$executeRaw`
    UPDATE "users" u SET "following_count" = (
      SELECT COUNT(*) FROM "user_follows" uf WHERE uf."follower_id" = u."id"
    )
  `;
  
  // Recalculate provider_page follower_count
  await prisma.$executeRaw`
    UPDATE "provider_pages" p SET "follower_count" = (
      SELECT COUNT(*) FROM "page_follows" pf WHERE pf."page_id" = p."id"
    )
  `;
  
  console.log('Counts recalculated');
}

async function main() {
  console.log('=== Follow Duplicate Cleanup ===\n');
  console.log('⚠️  This will DELETE duplicate follow rows. Ensure you have a backup.\n');
  
  await cleanupUserFollowDuplicates();
  await cleanupPageFollowDuplicates();
  await recalculateCounts();
  
  console.log('\n✅ Cleanup complete. Run dry-run check again to verify.');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });