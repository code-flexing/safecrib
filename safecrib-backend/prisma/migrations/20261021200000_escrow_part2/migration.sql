-- Escrow Part 2 migration (additive only, DO NOT RUN)
-- Extend escrow states
DO $$
BEGIN
  ALTER TYPE "EscrowState" ADD VALUE IF NOT EXISTS 'PROOF_SUBMITTED';
  ALTER TYPE "EscrowState" ADD VALUE IF NOT EXISTS 'RELEASE_PENDING';
  ALTER TYPE "EscrowState" ADD VALUE IF NOT EXISTS 'RELEASED';
  ALTER TYPE "EscrowState" ADD VALUE IF NOT EXISTS 'DISPUTED';
  ALTER TYPE "EscrowState" ADD VALUE IF NOT EXISTS 'REFUND_PENDING';
  ALTER TYPE "EscrowState" ADD VALUE IF NOT EXISTS 'REFUNDED';
  ALTER TYPE "EscrowState" ADD VALUE IF NOT EXISTS 'PAYOUT_FAILED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "escrows"
  ADD COLUMN IF NOT EXISTS "proof_submitted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "auto_release_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "released_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "refunded_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "disputed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "blocker_code" TEXT;

CREATE TABLE IF NOT EXISTS "escrow_events" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "escrow_id" TEXT NOT NULL REFERENCES "escrows"(id),
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  reason TEXT,
  metadata JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "escrow_events_escrow_id_idx" ON "escrow_events"("escrow_id");

CREATE TABLE IF NOT EXISTS "escrow_proofs" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "escrow_id" TEXT NOT NULL REFERENCES "escrows"(id),
  "uploaded_by" TEXT NOT NULL,
  "media_id" TEXT,
  type TEXT NOT NULL,
  note TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "escrow_proofs_escrow_id_idx" ON "escrow_proofs"("escrow_id");

CREATE TABLE IF NOT EXISTS "payouts" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "escrow_id" TEXT NOT NULL REFERENCES "escrows"(id),
  "agent_id" TEXT,
  "amount_minor" INTEGER NOT NULL,
  "fee_minor" INTEGER,
  "paystack_transfer_code" TEXT,
  reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  "failure_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "payouts_escrow_id_nonfailed_unique" ON "payouts"("escrow_id") WHERE status <> 'FAILED';