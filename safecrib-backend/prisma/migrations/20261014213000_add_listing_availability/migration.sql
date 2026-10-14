-- Migration: add availability status to listings
-- Additive + reversible.
-- Rollback:
--   ALTER TABLE "listings" DROP COLUMN "availability_updated_by_id";
--   ALTER TABLE "listings" DROP COLUMN "availability_updated_at";
--   ALTER TABLE "listings" DROP COLUMN "availability";
--   DROP TYPE "AvailabilityStatus";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AvailabilityStatus') THEN
    CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'BOOKED', 'RENTED', 'SOLD');
  END IF;
END $$;

ALTER TABLE "listings"
  ADD COLUMN IF NOT EXISTS "availability" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN IF NOT EXISTS "availability_updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "availability_updated_by_id" TEXT;

CREATE INDEX IF NOT EXISTS "listings_availability_idx" ON "listings"("availability");
