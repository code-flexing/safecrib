-- PostgreSQL requires enum additions to be committed before they can be used
-- as a column default, so this intentionally follows the enum migration.
ALTER TABLE "listings" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
UPDATE "listings" SET "status" = 'VERIFIED' WHERE "status" = 'ACTIVE';
