ALTER TABLE "student_profiles"
    ADD COLUMN "short_bio" VARCHAR(160) NOT NULL DEFAULT '',
    ADD COLUMN "long_bio" VARCHAR(2000);

ALTER TABLE "provider_pages"
    ADD COLUMN "short_bio" VARCHAR(160) NOT NULL DEFAULT '',
    ADD COLUMN "long_bio" VARCHAR(2000);

CREATE TABLE "notification_push_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" VARCHAR(2048) NOT NULL,
    "p256dh" VARCHAR(256) NOT NULL,
    "auth" VARCHAR(256) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_push_subscriptions_endpoint_key"
    ON "notification_push_subscriptions"("endpoint");
CREATE INDEX "notification_push_subscriptions_user_id_idx"
    ON "notification_push_subscriptions"("user_id");

ALTER TABLE "notification_push_subscriptions"
    ADD CONSTRAINT "notification_push_subscriptions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
