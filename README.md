<img width="1536" height="1024" alt="ChatGPT Image Sep 17, 2026, 12_50_57 AM" src="https://github.com/user-attachments/assets/60b10e6a-5045-42f0-ab56-f4ae23c9518d" />



**SafeCrib — The trust layer for student housing.**

SafeCrib protects students from scams, double-booked rooms, and misrepresented
listings. Every architectural decision — perceptual image hashing, a booking
state machine with database-level locks, append-only trust-event ledgers, and
refresh-token rotation — exists to guarantee a student will not pay a deposit
for a fake, already-sold, or fraudulent room.

---

## Table of contents

- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Monorepo structure](#monorepo-structure)
- [Data model](#data-model)
- [Backend modules](#backend-modules)
- [API](#api)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [Non-functional considerations](#non-functional-considerations)

---

## Architecture

Three surfaces talk to one backend. The web dashboard and mobile app consume the
same NestJS API — they never talk to Postgres/Redis directly.

```
                          +---------------------------+
                          |      Next.js Web App       |
                          |  (listings, bookings,      |
                          |   trust scores, messages)   |
                          +--------------+-------------+
                                         |
                                         |  REST / WebSocket
                                         v
 +------------------+   +---------------------------+   +------------------+
 |  Students        |<->|     NestJS Backend API     |<->|  Postgres (DB)   |
 |  (web clients)   |   |  - Auth (JWT + refresh)    |   |  users, listings, |
 +---------+--------+   |  - Listing module          |   |  bookings, trust |
           |            |  - Booking state machine   |   |  events, reviews |
           v            |  - Trust score engine      |   +------------------+
 +------------------+     |  - Fraud & duplicate       |   +------------------+
 |  AI Agents       |     |    detection               |-->|  Redis (cache /  |
 |  (fraud scanning, |     +---------------+-------------+   |  job queue)      |
 |   text analysis)  |                     |                  +------------------+
 +--------------------+                    | reads/writes
                                           v
                                  +---------------------------+
                                  |  Background Workers        |
                                  |  (BullMQ: email, image-    |
                                  |   hash, trust-recompute,   |
                                  |   booking-hold-expiry,     |
                                  |   duplicate-sweep)          |
                                  +---------------------------+
```

**Key boundary:** the web app is a human-facing surface that consumes the same
NestJS API as background AI agents. No direct database access from the frontend.

---

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Web frontend | Next.js (App Router) + TypeScript + Tailwind CSS | Server Components for fast page loads |
| Backend API | NestJS + TypeScript | Modular structure maps 1:1 onto trust-domain boundaries |
| Database | PostgreSQL (via Prisma) | Relational data with strong consistency guarantees |
| Cache / queue | Redis + BullMQ | Background jobs: email, pHash, trust-recompute, hold expiry, duplicate sweep |
| Auth | JWT (access + rotated refresh tokens) + Argon2id | Short-lived access tokens; refresh tokens rotated and stored hashed |
| Images | Sharp + pHash (DCT-based) | Perceptual hashing catches stolen listing photos |
| Rate limiting | @nestjs/throttler | Per-IP + per-endpoint limits on auth and fraud endpoints |

---

## Monorepo structure

```
safecrib/
├── apps/
│   └── web/                   # Next.js web application
│       ├── app/               # App Router: auth, dashboard, marketing
│       ├── components/        # Reusable UI components
│       ├── lib/               # API client, auth, query client
│       ├── hooks/             # React hooks
│       ├── middleware.ts      # Route guards
│       └── .env.example
├── safecrib-backend/          # NestJS backend
│   ├── src/
│   │   ├── main.ts            # Bootstrap, security headers, CORS, validation, Swagger
│   │   ├── app.module.ts      # Root module — wires all modules + processors
│   │   ├── common/            # Guards, decorators, filters
│   │   ├── domain/            # Pure logic (trust, fraud, booking) — no framework imports
│   │   ├── infra/             # PrismaService, MailService, BullMQ queue processors
│   │   └── modules/           # NestJS controllers + thin services wrapping domain engines
│   ├── prisma/                # Schema + migrations
│   ├── test/                  # E2e tests
│   └── package.json
├── .github/workflows/cy.yml   # CI
├── package-lock.json
└── netlify.toml
```

---

## Data model

Core entities owned by the backend:

| Entity | Key fields |
|---|---|
| `User` | `id`, `email`, `passwordHash`, `role`, `emailVerified`, `identityVerified`, `trustScore` |
| `Listing` | `ownerId`, `title`, `description`, `price`, `lat`, `lng`, `status` |
| `ListingPhoto` | `listingId`, `url`, `phash` |
| `Booking` | `listingId`, `studentId`, `status`, `depositAmount`, `holdExpiresAt` |
| `Review` | `bookingId` (unique), `reviewerId`, `revieweeId`, `rating`, `text` |
| `TrustEvent` | `userId`, `eventType`, `weight`, `occurredAt`, `payload` — append-only |
| `FraudReport` | `reporterId`, `targetUserId`/`targetListingId`, `type`, `status` |
| `DuplicateFlag` | `listingIdA`, `listingIdB`, `matchType`, `similarity`, `status` |
| `RefreshToken` | `userId`, `tokenHash`, `revoked`, `expiresAt` |
| `EmailVerificationToken` | `userId`, `tokenHash`, `expiresAt` |
| `PasswordResetToken` | `userId`, `tokenHash`, `expiresAt` |

---

## Backend modules

| Module | Responsibility |
|---|---|
| `auth` | Registration, login, JWT access + refresh tokens, email verification, password reset |
| `users` | Profile CRUD, password change |
| `listings` | Create/edit listings, photo upload with pHash duplicate detection |
| `bookings` | Deposit hold + concurrent-hold locking, state machine (AVAILABLE→HELD→BOOKED→COMPLETED) |
| `trust` | Exposes `trust_events` → cached score via background job |
| `fraud` | Fraud report intake, duplicate detection, admin review |
| `admin` | Manual onboarding, identity verification, dispute/listing resolution |

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

---

## API

All endpoints are under `/api/v1/`. API documentation is available at
`/api/v1/docs` when `ENABLE_SWAGGER=true`.

### Auth
- `POST /auth/register` — Register with email + password
- `POST /auth/verify-email` — Verify email with token
- `POST /auth/login` — Login, get access + refresh tokens
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

### Admin
- `POST /admin/onboard` — Manually onboard agent/landlord
- `PATCH /admin/users/:id/verify-identity` — Verify user identity
- `GET /admin/users` — List all users
- `GET /admin/users/:id` — Get user detail with trust events
- `PATCH /admin/listings/:id/flag` — Flag a listing

---

## Environment variables

**`safecrib-backend/.env`**

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `DIRECT_URL` | PostgreSQL connection for Prisma migrations |
| `REDIS_URL` | Redis connection for BullMQ queues |
| `JWT_ACCESS_SECRET` | Access token signing secret |
| `JWT_REFRESH_SECRET` | Refresh token signing secret |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Gmail SMTP credentials for transactional emails |
| `SMTP_FROM` | Sender email address |
| `FRONTEND_URL_TESTING` | Frontend origin for CORS + email links |
| `ENABLE_SWAGGER` | Enable Swagger docs (`true`/`false`) |
| `API_NAME` | API name shown in Swagger |
| `API_VERSION` | API version (default `1.0.0`) |

**`apps/web/.env`**

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL for the API |
| `NEXTAUTH_URL` | Base URL of the web app |
| `NEXTAUTH_SECRET` | Auth.js session secret |
| `GITHUB_ID` / `GITHUB_SECRET` | GitHub OAuth app credentials |
| `GOOGLE_ID` / `GOOGLE_SECRET` | Google OAuth credentials |

Never commit real values — `.env.example` files should list keys only.

---

## Scripts

### Backend (from `safecrib-backend/`)

```bash
npm install          # Install dependencies
npm run start:dev    # Start API server (watch mode)
npm run start:worker:dev  # Start BullMQ workers (separate terminal)
npm test             # Unit tests (domain engines)
npm run test:e2e    # End-to-end tests
npm run lint        # Lint (oxlint)
npx tsc --noEmit    # Typecheck
npm run build       # Production build
```

### Frontend (from `apps/web/`)

```bash
npm install          # Install dependencies
npm run dev          # Start dev server
npm run build        # Production build
npm test             # Unit tests
npm run lint         # Lint
```

---

## Testing

- **Domain engines** (`domain/*`): exhaustive unit tests with no mocks — 56 tests covering trust scoring, duplicate detection (pHash, text similarity, geo+price), and the booking state machine.
- **E2E tests** (`test/`): 3 tests covering registration validation, user creation, and login rejection.

```bash
cd safecrib-backend
npm test              # Unit tests
npm run test:e2e      # E2e tests
npm run test:cov      # Coverage report
```

---

## Getting started

### Prerequisites

- Node.js 20+
- Docker (for local Postgres + Redis)

### Setup

```bash
# Start local PostgreSQL + Redis
docker run -d --name postgres-safecrib \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=safecrib_dev \
  -p 5432:5432 postgres:16-alpine

docker run -d --name redis-safecrib -p 6379:6379 redis:7-alpine

# Backend
cd safecrib-backend
npm install
cp .env.example .env   # fill in JWT secrets
npx prisma migrate dev
npm run start:dev       # API on http://localhost:3001
# In a separate terminal:
npm run start:worker:dev  # BullMQ workers

# Frontend
cd ../apps/web
npm install
cp .env.example .env
npm run dev             # Web app on http://localhost:3000
```

---

## Roadmap

| Phase | Theme | Status |
|---|---|---|
| **v1.0** | Trust engine MVP | Backend complete — auth, listings, bookings, fraud, trust, admin |
| **v1.1** | Web frontend | Next.js dashboard, API client, auth flow |
| **v1.2** | Mobile experience | Progressive Web App support |

---

## Non-functional considerations

- **Auth model:** JWT access tokens (15 min, revocable) + rotated refresh tokens (7 days, stored hashed in DB). Email verification gated before listing creation.
- **Rate limiting:** `@nestjs/throttler` on auth and fraud endpoints.
- **Security headers:** Helmet with CSP, HSTS (production), frameguard, no-sniff.
- **CORS:** Locked to configured frontend origins only; credentials enabled.
- **Image safety:** pHash computed at upload via Sharp + DCT, checked against existing listings.
- **Privacy by default:** No full source code stored. Only trust-relevant events are recorded.

---

## License

UNLICENSED
