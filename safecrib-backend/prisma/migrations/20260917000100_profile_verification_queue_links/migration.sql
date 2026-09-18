ALTER TABLE "admin_review_queue"
ADD COLUMN IF NOT EXISTS "entity_type" TEXT,
ADD COLUMN IF NOT EXISTS "entity_id" TEXT;

CREATE INDEX IF NOT EXISTS "admin_review_queue_status_idx" ON "admin_review_queue"("status");
CREATE INDEX IF NOT EXISTS "admin_review_queue_tier_status_idx" ON "admin_review_queue"("tier", "status");
CREATE INDEX IF NOT EXISTS "admin_review_queue_entity_type_entity_id_idx" ON "admin_review_queue"("entity_type", "entity_id");

ALTER TABLE "provider_pages"
ADD COLUMN IF NOT EXISTS "proof_of_license" TEXT,
ADD COLUMN IF NOT EXISTS "profile_picture" TEXT,
ADD COLUMN IF NOT EXISTS "payoutAccounts" JSONB,
ADD COLUMN IF NOT EXISTS "provider_type" TEXT,
ADD COLUMN IF NOT EXISTS "business_name" TEXT,
ADD COLUMN IF NOT EXISTS "business_reg_number" TEXT,
ADD COLUMN IF NOT EXISTS "business_address" TEXT,
ADD COLUMN IF NOT EXISTS "additional_contacts" JSONB,
ADD COLUMN IF NOT EXISTS "socialLinks" JSONB;
