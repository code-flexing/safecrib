safecrib-backend/
├── src/
│   ├── main.ts                              # Bootstrap, security headers, CORS, validation, Swagger
│   ├── app.module.ts                        # Root module — wires all modules + processors
│   │
│   ├── common/
│   │   ├── roles.decorator.ts               # @Roles() metadata decorator
│   │   ├── roles.guard.ts                   # Role-based + emailVerified guard
│   │   ├── filters/
│   │   │   └── all-exceptions.filter.ts     # Global exception filter
│   │   └── index.ts                        # Barrel re-exports
│   │
│   ├── domain/                              # PURE LOGIC — no NestJS/DB imports, fully unit-testable
│   │   ├── booking/
│   │   │   ├── booking-state-machine.ts    # State machine: AVAILABLE->HELD->BOOKED->COMPLETED
│   │   │   └── booking-state-machine.spec.ts
│   │   ├── fraud/
│   │   │   ├── duplicate-detector.engine.ts # pHash, text similarity, geo+price matching
│   │   │   ├── duplicate-detector.engine.spec.ts
│   │   │   ├── image-phash.ts              # pHash computation via sharp + DCT
│   │   │   ├── text-similarity.ts          # TF-IDF + cosine similarity
│   │   │   └── index.ts
│   │   └── trust/
│   │       ├── trust-score.engine.ts       # Weighted composite trust score with decay/variance
│   │       ├── trust-score.engine.spec.ts
│   │       └── index.ts
│   │
│   ├── infra/
│   │   ├── prisma/
│   │   │   ├── prisma.service.ts           # Injectable PrismaClient wrapper
│   │   │   └── prisma.module.ts            # Global Prisma module
│   │   ├── mail/
│   │   │   ├── mail.service.ts             # SMTP/nodemailer email sender
│   │   │   └── mail.module.ts
│   │   └── queue/
│   │       ├── queue.module.ts             # BullMQ global config
│   │       ├── queue.constants.ts          # Queue name constants
│   │       ├── redis-connection.util.ts    # Redis URL -> connection options parser
│   │       ├── email.processor.ts          # Worker: sends verification/reset emails
│   │       ├── image-hash.processor.ts     # Worker: pHash duplicate detection on photo upload
│   │       ├── trust-recompute.processor.ts # Worker: recomputes user trust score
│   │       ├── booking-hold-expiry.processor.ts # Worker: releases expired booking holds
│   │       └── duplicate-sweep.processor.ts # Worker: nightly text-similarity sweep
│   │
│   ├── modules/                            # NestJS feature modules (thin glue over domain engines)
│   │   ├── auth/
│   │   │   ├── auth.controller.ts          # /auth/register, login, verify, refresh, logout, etc.
│   │   │   ├── auth.service.ts             # argon2 hashing, JWT, refresh-token rotation
│   │   │   ├── auth.module.ts
│   │   │   ├── strategies/
│   │   │   │   └── jwt.strategy.ts         # JWT access-token strategy
│   │   │   ├── guards/
│   │   │   │   └── jwt-auth.guard.ts
│   │   │   ├── decorators/
│   │   │   │   └── current-user.decorator.ts
│   │   │   └── dto/
│   │   │       └── auth.dto.ts
│   │   ├── users/
│   │   │   ├── users.controller.ts         # /users/me profile CRUD
│   │   │   ├── users.service.ts
│   │   │   ├── users.module.ts
│   │   │   └── dto/
│   │   │       └── user.dto.ts
│   │   ├── listings/
│   │   │   ├── listings.controller.ts      # /listings CRUD + search + photo upload
│   │   │   ├── listings.service.ts         # Delegates pHash to domain engine
│   │   │   ├── listings.module.ts
│   │   │   └── dto/
│   │   │       └── listing.dto.ts
│   │   ├── bookings/
│   │   │   ├── bookings.controller.ts      # /bookings hold/confirm/cancel/complete/dispute
│   │   │   ├── bookings.service.ts         # Wraps domain state machine + concurrency lock
│   │   │   ├── bookings.module.ts
│   │   │   └── dto/
│   │   │       └── booking.dto.ts
│   │   ├── trust/
│   │   │   ├── trust.controller.ts         # /trust/users/:id, /trust/me
│   │   │   ├── trust.service.ts            # Fetches trust_events -> calls domain engine -> caches
│   │   │   └── trust.module.ts
│   │   ├── fraud/
│   │   │   ├── fraud.controller.ts         # /fraud/reports, /fraud/duplicates
│   │   │   ├── fraud.service.ts            # Report intake + admin resolution
│   │   │   ├── fraud.module.ts
│   │   │   └── dto/
│   │   │       └── fraud.dto.ts
│   │   └── admin/
│   │       ├── admin.controller.ts         # /admin/onboard, /admin/users, dispute resolution
│   │       ├── admin.service.ts
│   │       ├── admin.module.ts
│   │       └── dto/
│   │           └── admin.dto.ts
│
├── prisma/
│   ├── schema.prisma                      # Core data model
│   └── migrations/
│       └── 20260914225052_init_student_lodge/
│           └── migration.sql

├── test/                                  # e2e tests
│   └── app.e2e-spec.ts

├── .env, .env.example                     # Environment configuration
├── tsconfig.json, tsconfig.build.json     # TypeScript config
├── vitest.config.ts, vitest.config.e2e.ts # Vitest config
├── oxlint.json                            # Linter config
└── package.json
