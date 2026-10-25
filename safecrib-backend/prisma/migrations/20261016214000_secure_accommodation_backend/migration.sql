-- Migration: Secure accommodation backend (hold, payment, ledger, escrow, receipts)
-- Additive + reversible where possible. Do not run automatically.

-- Booking status extension
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BookingStatus') THEN
    CREATE TYPE "BookingStatus" AS ENUM ('HELD', 'BOOKED', 'CANCELLED', 'COMPLETED', 'DISPUTED');
  END IF;
END $$;

-- Add fields to bookings
ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "amount_minor" INTEGER,
  ADD COLUMN IF NOT EXISTS "currency" TEXT DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS "quote_snapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "hold_expires_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "booked_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);

-- Payments
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentStatus') THEN
    CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'SUCCESS', 'FAILED', 'ABANDONED');
  END IF;
END $$;

-- All PKs in this DB are TEXT (uuid() default applied at insert), so FK columns are TEXT too.
CREATE TABLE IF NOT EXISTS "payments" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "booking_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "listing_id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
  "provider_raw_status" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paid_at" TIMESTAMP(3),
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payments_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "payments_reference_key" ON "payments"("reference");
CREATE INDEX IF NOT EXISTS "payments_booking_id_idx" ON "payments"("booking_id");
CREATE INDEX IF NOT EXISTS "payments_user_id_idx" ON "payments"("user_id");
CREATE INDEX IF NOT EXISTS "payments_status_idx" ON "payments"("status");

-- Escrow
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EscrowState') THEN
    CREATE TYPE "EscrowState" AS ENUM ('HELD');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "escrows" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "booking_id" TEXT NOT NULL,
  "payment_id" TEXT NOT NULL,
  "payer_id" TEXT NOT NULL,
  "agent_id" TEXT,
  "listing_id" TEXT NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "state" "EscrowState" NOT NULL DEFAULT 'HELD',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "escrows_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "escrows"
  ADD CONSTRAINT "escrows_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "escrows_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "escrows_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "escrows_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "escrows_payment_id_key" ON "escrows"("payment_id");
CREATE UNIQUE INDEX IF NOT EXISTS "escrows_payer_id_booking_id_key" ON "escrows"("payer_id", "booking_id");

-- Ledger
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LedgerDirection') THEN
    CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ledger_entries" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "transaction_id" TEXT NOT NULL,
  "booking_id" TEXT,
  "payment_id" TEXT,
  "account" TEXT NOT NULL,
  "direction" "LedgerDirection" NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "memo" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ledger_entries_transaction_id_idx" ON "ledger_entries"("transaction_id");
CREATE INDEX IF NOT EXISTS "ledger_entries_booking_id_idx" ON "ledger_entries"("booking_id");

-- Receipts
CREATE TABLE IF NOT EXISTS "receipts" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "receipt_number" TEXT NOT NULL,
  "payment_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "escrow_id" TEXT,
  "payer_id" TEXT NOT NULL,
  "agent_id" TEXT,
  "listing_id" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "total_minor" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ISSUED',
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "snapshot" JSONB NOT NULL,
  "snapshot_hash" TEXT NOT NULL,
  CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "receipts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "receipts_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "receipts_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "receipts_receipt_number_key" ON "receipts"("receipt_number");
CREATE UNIQUE INDEX IF NOT EXISTS "receipts_payment_id_key" ON "receipts"("payment_id");

-- Booking index for race safety (partial index to ensure at most one active/confirmed per listing)
-- For HELD/BOOKED statuses
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_listing_active_unique"
  ON "bookings"("listing_id")
  WHERE "status" IN ('HELD', 'BOOKED');

-- Rollback hints (informational, do not execute):
-- DROP INDEX IF EXISTS "bookings_listing_active_unique";
-- DROP TABLE IF EXISTS "receipts" CASCADE;
-- DROP TABLE IF EXISTS "ledger_entries" CASCADE;
-- DROP TABLE IF EXISTS "escrows" CASCADE;
-- DROP TABLE IF EXISTS "payments" CASCADE;
-- ALTER TABLE "bookings" DROP COLUMN IF EXISTS "cancelled_at", DROP COLUMN IF EXISTS "completed_at", DROP COLUMN IF EXISTS "booked_at", DROP COLUMN IF EXISTS "hold_expires_at", DROP COLUMN IF EXISTS "quote_snapshot", DROP COLUMN IF EXISTS "currency", DROP COLUMN IF EXISTS "amount_minor";

-- Extend BookingStatus enum with new values
DO $$
BEGIN
  ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT';
  ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED';
  ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
  ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'PAID_AFTER_EXPIRY';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Notification source/actor (additive)
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "source" TEXT,
  ADD COLUMN IF NOT EXISTS "actor_id" TEXT,
  ADD COLUMN IF NOT EXISTS "actor_snapshot" JSONB;