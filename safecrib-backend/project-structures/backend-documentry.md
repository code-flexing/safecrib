# SafeCrib Platform — Backend Documentation

## 0. Core Architecture Principle

The trust-scoring, duplicate-detection, and booking-lock logic lives as **plain
TypeScript domain code** that knows nothing about NestJS, HTTP, or Prisma.

```
src/
  domain/              ← pure logic, zero framework/DB imports, fully unit-testable
  modules/             ← NestJS glue: controllers, DTOs, Prisma calls, queues
  infra/               ← PrismaService, MailService, BullMQ workers
```

Each `modules/*` service is thin: fetch data via Prisma → call the matching
`domain/*` engine with plain objects → persist the result. The engine itself
never sees a Prisma model or an HTTP request.

## 1. Auth Module

**Flow:**
1. `POST /auth/register` — validates input (class-validator), hashes password
   with **argon2id**, creates an active account, returns the user plus access and
   refresh tokens, and queues a welcome email through BullMQ. Mail delivery is
   never an account-access gate.
2. `POST /auth/verify-email` — consumes a SHA-256 hashed token stored in DB.
3. `POST /auth/login` — verifies password with argon2, issues short-lived
   **access token** (JWT, 15 min) + longer-lived **refresh token** (7 days,
   rotated on use, stored hashed in DB so it can be revoked).
4. `POST /auth/refresh` — rotates refresh token, issues new access token.
5. `POST /auth/forgot-password` — same token pattern as email verification.
6. `POST /auth/reset-password` — resets password using valid token.
7. `POST /auth/logout` — revokes the refresh token server-side.

**Security:**
- `@nestjs/throttler` rate-limits `/auth/login` and `/auth/forgot-password`
  per IP + per account.
- Same generic error message for "email not found" and "wrong password"
  (prevents user enumeration).
- Password authentication and server-side authorization gate protected actions;
  welcome-email delivery never blocks a user.
- Helmet + CORS locked to configured frontend origins.

**DTOs:** `RegisterDto`, `LoginDto`, `RefreshDto`, `VerifyEmailDto`,
`ForgotPasswordDto`, `ResetPasswordDto`

## 2. Domain Engines

### 2.1 `trust-score.engine.ts`

Pure function: `computeTrustScore(events: TrustEvent[], now: Date): TrustScoreResult`

Score is a weighted composite, recomputed on every new signal:
- **Verified transaction weight** — reviews only count if tied to a completed
  booking (enforced by requiring `reviewerTrustFactor`).
- **Recency decay** — exponential half-life (~6 months).
- **Consistency / variance** — high variance in event weights triggers
  `flaggedForReview`.
- **Dispute outcomes** — disputes against an agent subtract more than positive
  events add.
- **Sybil resistance** — `REVIEW_RECEIVED` events are weighted by the
  reviewer's own trust factor (0–1).
- **Append-only ledger** — events are inserted, never updated. The score is
  always a recomputation from `trust_events`.

### 2.2 `duplicate-detector.engine.ts`

Pure functions:
- `comparePhash(hashA, hashB)` — Hamming distance between perceptual hashes
- `compareListingText(a, b)` — TF-IDF + cosine similarity (see `text-similarity.ts`)
- `evaluateDuplicateRisk(candidate, existing[])` — returns `DuplicateFlag[]`

Flags are inserted, not auto-deleted. Human review is required.

### 2.3 `booking-state-machine.ts`

Explicit state machine prevents double-selling:

```
AVAILABLE → HELD (on deposit-intent, sets hold_expires_at)
HELD → BOOKED (on deposit confirmed)
HELD → AVAILABLE (on hold expiry or cancellation — by BullMQ delayed job)
HELD → CANCELLED
BOOKED → COMPLETED (unlock review eligibility)
BOOKED → DISPUTED
BOOKED → CANCELLED
DISPUTED → COMPLETED
DISPUTED → CANCELLED
```

Illegal transitions throw `IllegalStateTransitionError`.
Concurrent holds are prevented by:
1. Application-level check (find existing HELD/BOOKED)
2. DB-level: listing is set to `FLAGGED` status during hold
3. (Future) Unique partial index on `Booking(listingId) WHERE status IN ('HELD','BOOKED')`

## 3. Modules

| Module | Responsibility |
|---|---|
| `auth` | Registration, login, tokens, email verification, password reset |
| `users` | Profile CRUD, password change |
| `listings` | Create/edit listings, photo upload with pHash |
| `bookings` | Deposit hold + concurrent-hold locking, state machine |
| `trust` | Exposes `trust_events` → cached score via background job |
| `fraud` | Fraud report intake, wraps `duplicate-detector.engine`, admin queue |
| `admin` | Manual agent onboarding, identity verification, dispute resolution |
| `provider-pages` | Provider Page creation, submission, verification, and publishing entitlement |
| `reviews` | Completed-booking-only review creation and admin moderation |

## 3.1 Server-authoritative capability contract

The client may render hints from these states, but it must never be treated as
the authority. Every operation below re-reads the relevant record on the
server. A client-supplied `verified=true`, role, listing status, or Page ID
does not grant a capability.

| Server state | Client capability | Server enforcement |
|---|---|---|
| Authenticated and email verified | Enter dashboard and discover homes | All marketplace routes require JWT authentication and resolve the user from the database. |
| `role ∈ {AGENT, LANDLORD}` | Create one provider Page | `POST /provider-pages` rejects student/admin roles. |
| Page `DRAFT` / `REJECTED` | Submit provider details | `POST /provider-pages/me/submit` transitions only these states to `SUBMITTED`. |
| Page `VERIFIED` | Upload Home / create draft listing | `POST /listings` calls `requireVerifiedPage`; role alone is insufficient. |
| Listing `DRAFT` / `REJECTED` with photo | Submit home for review | `POST /listings/:id/submit` checks ownership and photos. |
| Listing `VERIFIED` | Appear in authenticated marketplace / be bookable | Search filters to `VERIFIED`; booking rejects every other state. |
| Booking `COMPLETED` and owned by student | Write one review | `POST /reviews` checks both booking ownership and completed state. |
| `ADMIN` | Verify/reject Pages and homes; moderate reviews | Admin-only endpoints make state transitions and write audit records. |

Listing lifecycle: `DRAFT → SUBMITTED → VERIFIED | REJECTED`. Verification and
visibility are separate from the provider Page lifecycle: `DRAFT → SUBMITTED →
VERIFIED | REJECTED`. A verified Page is required to create a listing, but a
verified Page never publishes a listing by itself.

## 4. Background Jobs (BullMQ)

| Queue | Trigger | Job |
|---|---|---|
| `email` | Welcome and password-reset email | Send through the Brevo Transactional Email API, retry five times with exponential backoff |
| `image-hash` | Photo uploaded | Compute pHash, run duplicate check, write flags |
| `trust-recompute` | New `trust_events` row | Recompute + cache score for affected user |
| `booking-hold-expiry` | Booking enters HELD | Delayed job, releases hold if not confirmed |
| `duplicate-sweep` | Scheduled (nightly) | Batch text-similarity pass across active listings |

## 5. Prisma Schema (core tables)

- `User` (email, passwordHash, role, emailVerified, identityVerified, trustScore, trustScoreUpdatedAt)
- `Listing` (ownerId, title, description, price, lat, lng, campus, status)
- `ListingPhoto` (listingId, url, phash)
- `Booking` (listingId, studentId, status, depositAmount, holdExpiresAt, ...)
- `Review` (bookingId unique, reviewerId, revieweeId, rating, text)
- `TrustEvent` (userId, eventType, weight, occurredAt, payload) — append-only
- `FraudReport` (reporterId, targetUserId/listingId, type, description, status, resolution)
- `DuplicateFlag` (listingIdA, listingIdB, matchType, similarity, status)
- `RefreshToken` (userId, tokenHash, revoked, expiresAt)
- `EmailVerificationToken` (userId, tokenHash, expiresAt)
- `PasswordResetToken` (userId, tokenHash, expiresAt)

## 6. Testing Strategy

- **Domain engines (`domain/*`)**: exhaustive unit tests, no mocks — 56 tests.
- **Booking state machine**: tests every transition, illegal transitions throw.
- **Duplicate detection**: tests with known duplicate/distinct fixtures.
- **Trust scoring**: tests for new accounts, disputes, fraud, sybil reviews, recency decay.

## 7. Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection (pooler) |
| `DIRECT_URL` | PostgreSQL for migrations |
| `REDIS_URL` | Redis for BullMQ |
| `JWT_ACCESS_SECRET` | Access token signing key |
| `JWT_REFRESH_SECRET` | Refresh token signing key |
| `BREVO_API_KEY` | Brevo Transactional Email API key |
| `BREVO_SENDER_EMAIL`/`BREVO_SENDER_NAME` | Brevo-verified sender identity |
| `FRONTEND_URL_TESTING` | Frontend origin for CORS + email links |
