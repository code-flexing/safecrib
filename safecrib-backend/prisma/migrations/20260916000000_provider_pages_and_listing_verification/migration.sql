-- Provider verification is separate from listing verification. Existing listings
-- are promoted in the follow-up migration; new listings must pass the workflow.
CREATE TYPE "ProviderVerificationState" AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED');
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'HIDDEN');

ALTER TYPE "ListingStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "ListingStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE "ListingStatus" ADD VALUE IF NOT EXISTS 'UNDER_REVIEW';
ALTER TYPE "ListingStatus" ADD VALUE IF NOT EXISTS 'VERIFIED';
ALTER TYPE "ListingStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TABLE "listings" ADD COLUMN "provider_page_id" TEXT;
ALTER TABLE "reviews" ADD COLUMN "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "reviews" ADD COLUMN "moderated_at" TIMESTAMP(3);
ALTER TABLE "reviews" ADD COLUMN "moderated_by" TEXT;

CREATE TABLE "provider_pages" (
  "id" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "description" TEXT,
  "phone" TEXT,
  "verification_state" "ProviderVerificationState" NOT NULL DEFAULT 'DRAFT',
  "submitted_at" TIMESTAMP(3),
  "verified_at" TIMESTAMP(3),
  "verified_by" TEXT,
  "verification_notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "provider_pages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_pages_owner_id_key" ON "provider_pages"("owner_id");
CREATE INDEX "provider_pages_verification_state_idx" ON "provider_pages"("verification_state");
CREATE INDEX "listings_provider_page_id_idx" ON "listings"("provider_page_id");
ALTER TABLE "listings" ADD CONSTRAINT "listings_provider_page_id_fkey"
  FOREIGN KEY ("provider_page_id") REFERENCES "provider_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "provider_pages" ADD CONSTRAINT "provider_pages_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL,
  "actor_id" TEXT,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");
