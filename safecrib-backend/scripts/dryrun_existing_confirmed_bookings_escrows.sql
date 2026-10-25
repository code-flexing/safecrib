-- DRY RUN ONLY - DO NOT EXECUTE
-- Count confirmed/paid bookings from Part 1 that may need escrow handling
SELECT
  COUNT(*) AS confirmed_bookings,
  COUNT(*) FILTER (WHERE e.id IS NULL) AS confirmed_without_escrow,
  COUNT(*) FILTER (WHERE e.id IS NOT NULL) AS confirmed_with_escrow
FROM bookings b
LEFT JOIN escrows e ON e.booking_id = b.id
WHERE b.status IN ('BOOKED','CONFIRMED');
