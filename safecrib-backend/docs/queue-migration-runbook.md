# BullMQ to pg-boss production cutover

The new application only reads and writes jobs in PostgreSQL. It does not
delete, inspect, or consume the old BullMQ data in Redis. The live Redis queue
inventory cannot be determined from the repository; capture it from the
existing deployment before the cutover.

## Before deployment

1. Keep the current API and its BullMQ workers running. Take an external
   snapshot/export of the Redis queue data because the Render FREE Key Value
   service has no persistence.
2. Record, for each old queue (`email`, `image-hash`, `trust-recompute`,
   `booking-hold-expiry`, `duplicate-sweep`, `media-webhook`,
   `media-deletion`, `media-cleanup`, and `notifications`), counts for waiting,
   active, delayed, failed, and completed jobs. Export the job name, payload,
   remaining delay, attempt count, and retry/backoff options for work that
   cannot be drained.
3. Schedule a short maintenance window. Stop new requests that enqueue work,
   but leave the old workers running while they drain waiting and active work.
   Delayed 24-hour booking-hold jobs must either be allowed to run or exported
   with their remaining delay and imported by a controlled one-time operator
   utility. Do not discard failed jobs; export and disposition them manually.
4. Confirm the old queues contain no waiting, active, or delayed jobs before
   deploying the version without BullMQ. Retain the external export until the
   new workers and dead-letter queues have been verified.

There is no BullMQ-to-pg-boss import utility in the new application by design:
it does not retain BullMQ as a runtime dependency. If draining is not possible,
use an isolated one-time tool built against the currently deployed BullMQ
version to export/import the listed fields and verify per-queue counts before
reopening traffic. Never run old and new queue consumers against the same
queue.

## New deployment settings

- Set `PGBOSS_DATABASE_URL` to the Supabase **session pooler** URL on port
  `5432`. Port `6543` is rejected. The app creates/maintains the `pgboss`
  schema using the configured PostgreSQL role.
- Set Render's health-check path to `/healthz`; `/readyz` returns `503` until
  Redis, Prisma/Postgres, and pg-boss are connected.
- Set the Redis service policy to `noeviction` where Render permits it. The
  backend logs a warning if policy inspection is denied or reports another
  policy.

pg-boss provisions its tables in the `pgboss` schema at startup. No Prisma
migration is required for those tables. Prisma migrations still run through
the existing Render pre-deploy command.

## Rollback

Do not roll back to the old BullMQ app and expect it to consume pg-boss jobs.
Keep the PostgreSQL `pgboss` schema and the cutover export intact. A rollback
that must process new jobs requires a deliberate export/replay into BullMQ;
do not drop either queue store until the owner verifies all job outcomes.
