CREATE TYPE "ProfileTier" AS ENUM ('STUDENT', 'LANDLORD');
CREATE TYPE "ReviewType" AS ENUM ('SIGNUP', 'CREATE_PAGE');
CREATE TYPE "ProfileStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "student_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "proof_of_studentship" TEXT NOT NULL,
    "school_of_study" TEXT NOT NULL,
    "course_of_study" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "profile_picture" TEXT NOT NULL,
    "date_of_birth" TIMESTAMP(3),
    "gender" TEXT,
    "phone_number" TEXT,
    "emergency_contact" TEXT,
    "socialLinks" JSONB,
    "status" "ProfileStatus" NOT NULL DEFAULT 'PENDING',
    "review_notes" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_profiles_email_key" ON "student_profiles"("email");
CREATE UNIQUE INDEX "student_profiles_user_id_key" ON "student_profiles"("user_id") WHERE ("user_id" IS NOT NULL);

ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "admin_review_queue" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tier" "ProfileTier" NOT NULL,
    "reviewType" "ReviewType" NOT NULL,
    "status" "ProfileStatus" NOT NULL DEFAULT 'PENDING',
    "entity_type" TEXT,
    "entity_id" TEXT,
    "submittedData" JSONB NOT NULL,
    "review_notes" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "admin_review_queue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_review_queue_status_idx" ON "admin_review_queue"("status");
CREATE INDEX "admin_review_queue_tier_status_idx" ON "admin_review_queue"("tier", "status");
CREATE INDEX "admin_review_queue_entity_type_entity_id_idx" ON "admin_review_queue"("entity_type", "entity_id");
