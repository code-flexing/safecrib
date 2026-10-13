#!/usr/bin/env node
/**
 * Dry-run script to check for duplicate follows before applying unique constraints.
 * Run with: node prisma/migrations/20261013_add_follow_counts_and_constraints/dry-run-check-duplicates.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkUserFollowDuplicates() {
  console.log('Checking for duplicate user follows...');
  
  const duplicates = await prisma.$queryRaw`
    SELECT "follower_id", "followed_id", COUNT(*) as count
    FROM "user_follows"
    GROUP BY "follower_id", "followed_id"
    HAVING COUNT(*) > 1
  `;
  
  if (duplicates.length > 0) {
    console.log(`❌ Found ${duplicates.length} duplicate user follow(s):`);
    duplicates.forEach((d: any) => {
      console.log(`  follower_id: ${d.follower_id}, followed_id: ${d.followed_id}, count: ${d.count}`);
    });
  } else {
    console.log('✅ No duplicate user follows found');
  }
  
  return duplicates;
}

async function checkPageFollowDuplicates() {
  console.log('\nChecking for duplicate page follows...');
  
  const duplicates = await prisma.$queryRaw`
    SELECT "follower_id", "page_id", COUNT(*) as count
    FROM "page_follows"
    GROUP BY "follower_id", "page_id"
    HAVING COUNT(*) > 1
  `;
  
  if (duplicates.length > 0) {
    console.log(`❌ Found ${duplicates.length} duplicate page follow(s):`);
    duplicates.forEach((d: any) => {
      console.log(`  follower_id: ${d.follower_id}, page_id: ${d.page_id}, count: ${d.count}`);
    });
  } else {
    console.log('✅ No duplicate page follows found');
  }
  
  return duplicates;
}

async function checkCountDrift() {
  console.log('\nChecking follower/following count drift...');
  
  // Check user follower_count drift
  const userFollowerDrift = await prisma.$queryRaw`
    SELECT u.id, u.follower_count, COUNT(uf.id) as actual_count
    FROM "users" u
    LEFT JOIN "user_follows" uf ON uf.followed_id = u.id
    GROUP BY u.id, u.follower_count
    HAVING u.follower_count != COUNT(uf.id)
  `;
  
  if (userFollowerDrift.length > 0) {
    console.log(`❌ Found ${userFollowerDrift.length} user(s) with follower_count drift:`);
    userFollowerDrift.forEach((d: any) => {
      console.log(`  user_id: ${d.id}, stored: ${d.follower_count}, actual: ${d.actual_count}`);
    });
  } else {
    console.log('✅ No user follower_count drift');
  }
  
  // Check user following_count drift
  const userFollowingDrift = await prisma.$queryRaw`
    SELECT u.id, u.following_count, COUNT(uf.id) as actual_count
    FROM "users" u
    LEFT JOIN "user_follows" uf ON uf.follower_id = u.id
    GROUP BY u.id, u.following_count
    HAVING u.following_count != COUNT(uf.id)
  `;
  
  if (userFollowingDrift.length > 0) {
    console.log(`❌ Found ${userFollowingDrift.length} user(s) with following_count drift:`);
    userFollowingDrift.forEach((d: any) => {
      console.log(`  user_id: ${d.id}, stored: ${d.following_count}, actual: ${d.actual_count}`);
    });
  } else {
    console.log('✅ No user following_count drift');
  }
  
  // Check provider_page follower_count drift
  const pageFollowerDrift = await prisma.$queryRaw`
    SELECT p.id, p.follower_count, COUNT(pf.id) as actual_count
    FROM "provider_pages" p
    LEFT JOIN "page_follows" pf ON pf.page_id = p.id
    GROUP BY p.id, p.follower_count
    HAVING p.follower_count != COUNT(pf.id)
  `;
  
  if (pageFollowerDrift.length > 0) {
    console.log(`❌ Found ${pageFollowerDrift.length} provider page(s) with follower_count drift:`);
    pageFollowerDrift.forEach((d: any) => {
      console.log(`  page_id: ${d.id}, stored: ${d.follower_count}, actual: ${d.actual_count}`);
    });
  } else {
    console.log('✅ No provider page follower_count drift');
  }
}

async function main() {
  console.log('=== Follow System Dry-Run Checks ===\n');
  
  const userDupes = await checkUserFollowDuplicates();
  const pageDupes = await checkPageFollowDuplicates();
  await checkCountDrift();
  
  const hasIssues = userDupes.length > 0 || pageDupes.length > 0;
  
  if (hasIssues) {
    console.log('\n⚠️  Issues found. Migration should NOT be applied until resolved.');
    console.log('\nCleanup script (review before running):');
    console.log('---');
    console.log('-- Remove duplicate user follows (keep first)');
    console.log('DELETE FROM "user_follows"');
    console.log('WHERE ctid NOT IN (');
    console.log('  SELECT MIN(ctid) FROM "user_follows"');
    console.log('  GROUP BY "follower_id", "followed_id"');
    console.log(');');
    console.log('');
    console.log('-- Remove duplicate page follows (keep first)');
    console.log('DELETE FROM "page_follows"');
    console.log('WHERE ctid NOT IN (');
    console.log('  SELECT MIN(ctid) FROM "page_follows"');
    console.log('  GROUP BY "follower_id", "page_id"');
    console.log(');');
    console.log('---');
    process.exit(1);
  } else {
    console.log('\n✅ All checks passed. Safe to apply migration.');
    process.exit(0);
  }
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });