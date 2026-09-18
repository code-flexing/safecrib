-- SafeCrib no longer uses delivery of a verification email as an access gate.
-- Existing accounts are activated so users previously waiting on a failed email
-- can sign in with their password.
UPDATE "users" SET "email_verified" = true WHERE "email_verified" = false;
