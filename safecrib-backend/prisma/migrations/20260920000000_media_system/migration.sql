-- CreateEnum
CREATE TYPE "MediaPurpose" AS ENUM (
  'AVATAR',
  'LISTING_PHOTO',
  'LISTING_VIDEO',
  'PROVIDER_LOGO',
  'STUDENT_ID',
  'PROOF_OF_STUDENTSHIP',
  'PROOF_OF_LICENSE',
  'CONTRACT_DOCUMENT'
);

-- CreateEnum
CREATE TYPE "MediaResourceType" AS ENUM ('IMAGE', 'VIDEO', 'RAW');

-- CreateEnum
CREATE TYPE "MediaDeliveryType" AS ENUM ('UPLOAD', 'AUTHENTICATED', 'PRIVATE');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'DELETING', 'DELETED');

-- CreateTable
CREATE TABLE "media" (
    "id"              TEXT NOT NULL,
    "owner_id"        TEXT NOT NULL,
    "purpose"         "MediaPurpose" NOT NULL,
    "resource_type"   "MediaResourceType" NOT NULL,
    "delivery_type"   "MediaDeliveryType" NOT NULL,
    "public_id"       TEXT NOT NULL,
    "asset_id"        TEXT,
    "version"         BIGINT,
    "format"          TEXT,
    "bytes"           INTEGER,
    "width"           INTEGER,
    "height"          INTEGER,
    "duration_sec"    DOUBLE PRECISION,
    "etag"            TEXT,
    "status"          "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "failure_reason"  TEXT,
    "idempotency_key" TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,
    "ready_at"        TIMESTAMP(3),
    "deleted_at"      TIMESTAMP(3),

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_attachments" (
    "id"          TEXT NOT NULL,
    "media_id"    TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id"   TEXT NOT NULL,
    "role"        TEXT NOT NULL,
    "position"    INTEGER NOT NULL DEFAULT 0,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_access_logs" (
    "id"          TEXT NOT NULL,
    "media_id"    TEXT NOT NULL,
    "accessor_id" TEXT NOT NULL,
    "ip"          TEXT,
    "user_agent"  TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_public_id_key"       ON "media"("public_id");
CREATE UNIQUE INDEX "media_idempotency_key_key"  ON "media"("idempotency_key");
CREATE INDEX "media_owner_id_purpose_idx"       ON "media"("owner_id", "purpose");
CREATE INDEX "media_status_created_at_idx"      ON "media"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "media_attachments_media_id_entity_type_entity_id_role_key"
    ON "media_attachments"("media_id", "entity_type", "entity_id", "role");
CREATE INDEX "media_attachments_entity_type_entity_id_role_position_idx"
    ON "media_attachments"("entity_type", "entity_id", "role", "position");

-- CreateIndex
CREATE INDEX "media_access_logs_media_id_idx"    ON "media_access_logs"("media_id");
CREATE INDEX "media_access_logs_accessor_id_idx" ON "media_access_logs"("accessor_id");

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "media_attachments" ADD CONSTRAINT "media_attachments_media_id_fkey"
    FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
