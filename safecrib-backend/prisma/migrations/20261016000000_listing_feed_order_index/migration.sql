-- Support verified-listing feed filters and newest-first cursor pagination.
CREATE INDEX "listings_status_created_at_id_idx"
  ON "listings" ("status", "created_at" DESC, "id" DESC);
