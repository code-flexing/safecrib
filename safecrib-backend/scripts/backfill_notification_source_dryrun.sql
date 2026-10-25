-- DRY RUN ONLY - DO NOT EXECUTE. Counts and samples of notifications without source.
SELECT
  type,
  COUNT(*) AS count
FROM notifications
WHERE source IS NULL
GROUP BY type
ORDER BY count DESC
LIMIT 20;

SELECT
  id,
  type,
  created_at
FROM notifications
WHERE source IS NULL
ORDER BY created_at DESC
LIMIT 10;
