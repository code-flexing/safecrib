# SafeCrib — Backend

NestJS + PostgreSQL + Prisma + BullMQ backend for the SafeCrib platform.
The trust engine is the core product — every architectural decision protects
the guarantee that a student will not pay a deposit for a fake, already-sold,
or misrepresented room.

**Version:** 1.0.0

## Quick Start

```bash
# Install dependencies
npm install

# Start PostgreSQL (Docker)
docker run -d --name postgres-safecrib \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=safecrib_dev \
  -p 5432:5432 postgres:16-alpine

# Start Redis (Docker) with a durable queue policy
docker run -d --name redis-safecrib -p 6379:6379 redis:7-alpine \
   redis-server --maxmemory-policy noeviction

# Apply database migrations
npx prisma migrate dev

# Start the API server
npm run start:dev

# Start background job workers (separate terminal)
npm run start:worker:dev
```

## Environment Variables

See `.env.example` for all available variables. Key ones:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `DIRECT_URL` | PostgreSQL connection for Prisma migrations |
| `REDIS_URL` | Redis connection for BullMQ queues |
| `REDIS_ENFORCE_NOEVICTION` | When `true`, verify/repair Redis `maxmemory-policy`; set `false` for managed providers that reject `CONFIG SET` |
| `JWT_ACCESS_SECRET` | Access token signing secret |
| `JWT_REFRESH_SECRET` | Refresh token signing secret |
| `BREVO_API_KEY` | Brevo transactional-email API key |
| `BREVO_SENDER_EMAIL` | Sender address verified in Brevo |
| `SMTP_FROM` | Compatibility fallback sender address when `BREVO_SENDER_EMAIL` is not set |
| `BREVO_SENDER_NAME` | Display name for transactional email |

Before sending, verify the sender/domain in Brevo and keep the Brevo API key and sender address in the environment.

BullMQ works best with Redis `maxmemory-policy noeviction`. For Render or another
managed Redis provider that reports `allkeys-lru` or rejects `CONFIG SET`, set
`REDIS_ENFORCE_NOEVICTION=false` and configure the policy in the Redis service
settings when possible. Changing `REDIS_URL` in the web service cannot change a
Redis server policy. Restart the API and worker services after changing these
settings.

Brevo failures are logged with the HTTP status, Brevo error code/message, and
Brevo request ID (when supplied), so delivery issues can be diagnosed without
logging the API key.

## Architecture

The codebase separates **pure domain logic** (trust scoring, duplicate detection,
booking state machine) from **NestJS orchestration**. This ensures the most
trust-critical code is fully unit-testable without any framework or database
setup.

```
src/
  domain/       ← pure logic (trust, fraud, booking) — zero framework imports
  infra/        ← PrismaService, MailService, BullMQ queue processors
  modules/      ← NestJS controllers + thin services wrapping domain engines
```

### Key Design Decisions

1. **Trust score is recomputed, never mutated** — `trust_events` is an append-only
   log. The score is a derived value, recomputed via a background job on every new
   event.
2. **Booking state machine enforces no double-selling** — a listing transitions
   to `FLAGGED` on hold, preventing concurrent holds. A unique partial index in
   the DB backs this up.
3. **Image pHash at upload time** — every photo gets a perceptual hash on upload,
   checked against existing listings to catch stolen photos.
4. **Argon2id password hashing** — better GPU resistance than bcrypt.
5. **Refresh token rotation** — each use invalidates the previous token; tokens
   are stored hashed in DB so they can be revoked server-side.

### Verification Decisions
- Rejected Tier 1 and Tier 2 submissions can be resubmitted.
- A rejected Tier 2 Page remains `REJECTED` and locked from publishing until corrected and resubmitted.
- Tier 1 and Tier 2 are parallel verification tracks; page creation does not require the student checklist fields.
- Tier 2 uses its own profile picture and does not require it to match Tier 1.
- No automatic annual re-verification trigger is enabled in this build.

## API Endpoints

All endpoints are under `/api/v1/`.

### Auth
- `POST /auth/register` — Submit the basic Tier 1 profile for admin review; no tokens are issued until approval
- `POST /student-profiles/signup` — Submit the same basic profile for admin review
- `POST /auth/login` — Login after approval and receive access + refresh tokens
- `POST /auth/refresh` — Exchange refresh token for new pair
- `POST /auth/forgot-password` — Send password reset email
- `POST /auth/reset-password` — Reset password with token
- `POST /auth/resend-verification` — Resend verification email
- `POST /auth/logout` — Revoke refresh token

### Users
- `GET /users/me` — Get current user profile
- `PATCH /users/me` — Update profile (displayName)
- `POST /users/me/change-password` — Change password
- `GET /users/me/trust` — Get your own trust score

### Listings
- `GET /listings` — Search listings (with location + price filters)
- `GET /listings/my` — Get your listings
- `GET /listings/:id` — Get listing details
- `POST /listings` — Create listing (agents/landlords only)
- `POST /listings/:id/photos` — Upload listing photo (triggers pHash check)
- `PATCH /listings/:id` — Update listing
- `DELETE /listings/:id` — Delete listing

### Bookings
- `POST /bookings` — Create a booking hold
- `PATCH /bookings/:id/confirm` — Confirm booking (pay deposit)
- `PATCH /bookings/:id/cancel` — Cancel booking
- `PATCH /bookings/:id/complete` — Mark as completed
- `PATCH /bookings/:id/dispute` — Raise a dispute
- `GET /bookings` — List your bookings
- `GET /bookings/:id` — Get booking details

### Trust
- `GET /trust/users/:userId` — Public trust score for a user
- `GET /trust/users/:userId/breakdown` — Full breakdown (admin only)
- `GET /trust/me` — Your own trust score

### Fraud
- `POST /fraud/reports` — Submit a fraud report
- `GET /fraud/reports` — List all reports (admin)
- `GET /fraud/reports/pending` — List pending reports (admin)
- `PATCH /fraud/reports/:id/resolve` — Resolve a report (admin)
- `GET /fraud/duplicates/pending` — List pending duplicate flags (admin)
- `PATCH /fraud/duplicates/:id/resolve` — Resolve a duplicate flag (admin)

### Student Profiles
- `GET /student-profiles/me` — Get the current basic submission
- `GET /student-profiles/submissions/:id` — Get a submission by review queue ID

### Provider Pages
- `GET /provider-pages/me` — Get the current provider Page
- `POST /provider-pages` — Create a Page or replace a rejected Page
- `PATCH /provider-pages/me` — Update a draft or rejected Page
- `POST /provider-pages/me/submit` — Submit Tier 2 verification
- `GET /provider-pages/admin/pending` — List pending Tier 2 Pages
- `PATCH /provider-pages/:id/verify` — Approve a Tier 2 Page
- `PATCH /provider-pages/:id/reject` — Reject a Tier 2 Page with a reason

### Admin Review
- `GET /admin/review-queue` — List Tier 1 and Tier 2 submissions
- `GET /admin/review-queue/:id` — Get one submission and its submitted data
- `POST /admin/review` — Approve or reject a submission; rejection requires a reason
- `POST /admin/onboard` — Manually onboard agent/landlord
- `PATCH /admin/users/:id/verify-identity` — Verify user identity
- `GET /admin/users` — List all users
- `GET /admin/users/:id` — Get user detail with trust events
- `PATCH /admin/listings/:id/flag` — Flag a listing

## Background Jobs (BullMQ)

| Queue | Worker | Triggered By |
|---|---|---|
| `email` | EmailProcessor | Verification, password reset, welcome, and profile-review notifications |
| `image-hash` | ImageHashProcessor | Photo upload |
| `trust-recompute` | TrustRecomputeProcessor | New trust event |
| `booking-hold-expiry` | BookingHoldExpiryProcessor | Booking enters HELD |
| `duplicate-sweep` | DuplicateSweepProcessor | Nightly scheduled job |

## Testing

```bash
npm test              # Unit tests (domain engines)
npm run test:e2e      # End-to-end tests
npm run test:cov      # Coverage report
```

## Swagger

API documentation is available at `/api/v1/docs` when `ENABLE_SWAGGER=true`.
