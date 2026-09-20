-- Registration is now minimal (email + password). Student profile completion is a
-- separate, gated step that enters an admin review queue.
-- Existing student_profiles rows keep their status; users without a profile are
-- treated as NOT_SUBMITTED.

ALTER TYPE "ProfileStatus" ADD VALUE IF NOT EXISTS 'NOT_SUBMITTED';