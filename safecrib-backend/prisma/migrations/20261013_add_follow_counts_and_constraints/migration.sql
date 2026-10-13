-- Migration: Add follow counts and unique constraints
-- Created: 2026-10-13

-- 1. Add follower_count and following_count columns to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "follower_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "following_count" INTEGER NOT NULL DEFAULT 0;

-- 2. Add follower_count column to provider_pages table
ALTER TABLE "provider_pages" ADD COLUMN IF NOT EXISTS "follower_count" INTEGER NOT NULL DEFAULT 0;

-- 3. Create unique indexes for user_follows and page_follows (if not already exist)
-- These should already exist via @@id in the schema, but we verify
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'user_follows_pkey'
  ) THEN
    ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_pkey" PRIMARY KEY ("follower_id", "followed_id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'page_follows_pkey'
  ) THEN
    ALTER TABLE "page_follows" ADD CONSTRAINT "page_follows_pkey" PRIMARY KEY ("follower_id", "page_id");
  END IF;
END $$;

-- 4. Backfill follower_count for users
UPDATE "users" u SET "follower_count" = (
  SELECT COUNT(*) FROM "user_follows" uf WHERE uf."followed_id" = u."id"
);

-- 5. Backfill following_count for users
UPDATE "users" u SET "following_count" = (
  SELECT COUNT(*) FROM "user_follows" uf WHERE uf."follower_id" = u."id"
);

-- 6. Backfill follower_count for provider_pages
UPDATE "provider_pages" p SET "follower_count" = (
  SELECT COUNT(*) FROM "page_follows" pf WHERE pf."page_id" = p."id"
);