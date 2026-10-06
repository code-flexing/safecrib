-- Add optional property detail columns to listings
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "bedrooms" INTEGER;
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "bathrooms" INTEGER;
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "property_type" TEXT;
