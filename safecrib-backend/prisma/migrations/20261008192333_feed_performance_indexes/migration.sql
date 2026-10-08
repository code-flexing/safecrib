-- Add indexes for feed performance (likes, comments, recommendations lookups)
-- These are additive and reversible (DROP INDEX if needed)

-- listing_likes: already has @@unique([userId, listingId]) and @@index([listingId, createdAt])
-- Ensure index on listingId exists for count queries
CREATE INDEX IF NOT EXISTS "listing_likes_listing_id_idx" ON "listing_likes" ("listing_id");

-- listing_comments: already has @@index([listingId, parentId, createdAt])
-- Ensure index on listingId exists for count queries
CREATE INDEX IF NOT EXISTS "listing_comments_listing_id_idx" ON "listing_comments" ("listing_id");

-- provider_recommendations: already has @@unique([recommenderId, providerId]) and @@index([providerId, createdAt])
-- Ensure index on providerId exists for count queries
CREATE INDEX IF NOT EXISTS "provider_recommendations_provider_id_idx" ON "provider_recommendations" ("provider_id");

-- listing_views: already has @@id([userId, listingId]) and @@index([listingId, firstViewedAt])
-- No additional index needed

-- bookmarks: already has @@unique([userId, listingId]) and @@index([userId, createdAt])
-- Add index on listingId for count queries
CREATE INDEX IF NOT EXISTS "bookmarks_listing_id_idx" ON "bookmarks" ("listing_id");

-- page_follows: already has @@id([followerId, pageId]) and @@index([pageId, createdAt])
-- No additional index needed