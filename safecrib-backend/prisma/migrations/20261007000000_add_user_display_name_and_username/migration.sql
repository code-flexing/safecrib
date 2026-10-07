-- Migration: add_user_display_name_and_username
-- Adds a unique, case-insensitive `username` handle to users.
-- `display_name` already exists (nullable) and is left untouched.

-- 1. Add the nullable username column (safe on existing rows).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" TEXT;

-- 2. Unique case-insensitive index on the username handle.
--    Two handles that differ only by case (e.g. "Victory" vs "victory") collide.
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_lower_idx"
  ON "users" (lower("username"));