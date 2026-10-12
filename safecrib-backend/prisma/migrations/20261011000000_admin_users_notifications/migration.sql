-- Migration: Admin Users and Notifications
-- Adds indexes for admin user queries and extends Notification model for ADMIN_MESSAGE type

-- Enable pg_trgm before creating trigram indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Indexes for admin user list queries
CREATE INDEX IF NOT EXISTS "users_role_email_verified_idx" ON "users" ("role", "email_verified");
CREATE INDEX IF NOT EXISTS "users_role_identity_verified_idx" ON "users" ("role", "identity_verified");
CREATE INDEX IF NOT EXISTS "users_created_at_idx" ON "users" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "users_email_trgm_idx" ON "users" USING GIN ("email" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "users_display_name_trgm_idx" ON "users" USING GIN ("display_name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "users_username_trgm_idx" ON "users" USING GIN ("username" gin_trgm_ops);

-- Notification model already has the necessary fields (data JSON can store sender snapshot)
-- No schema changes needed for ADMIN_MESSAGE type - it uses existing JSON data field
-- The senderAdminId, senderNameSnapshot, senderAvatarSnapshot are stored in the data JSON column

-- Index for admin notifications sent to a user
CREATE INDEX IF NOT EXISTS "notifications_user_id_type_created_at_idx" ON "notifications" ("user_id", "type", "created_at" DESC);

-- Index for audit log queries
CREATE INDEX IF NOT EXISTS "audit_logs_entity_type_entity_id_idx" ON "audit_logs" ("entity_type", "entity_id");