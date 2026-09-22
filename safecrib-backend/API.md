# SafeCrib Platform API

All endpoints are under `/api/v1/`.

## Authentication

JWT Bearer tokens are required for protected routes. `POST /auth/register` submits the basic Tier 1 profile for admin review; it does not issue tokens until approval. `POST /auth/login` issues tokens only for an approved account.

## Student / Basic Account

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Submit the basic profile with Tier 1 documents for review |
| POST | `/student-profiles/signup` | Submit the same basic profile for review |
| GET | `/student-profiles/me` | Get the current user's basic submission |
| GET | `/student-profiles/submissions/:id` | Get a submission by review queue ID |
| POST | `/auth/login` | Log in after approval |
| POST | `/auth/refresh` | Refresh an access token |
| POST | `/auth/forgot-password` | Send reset email |
| POST | `/auth/reset-password` | Reset password |
| POST | `/auth/logout` | Revoke refresh token |
| GET | `/users/me` | Get profile |
| PATCH | `/users/me` | Update profile |
| POST | `/users/me/change-password` | Change password |
| GET | `/users/me/trust` | Your trust score |
| GET | `/listings` | Search listings |
| GET | `/listings/my` | Get the authenticated provider's listings |
| GET | `/listings/:id` | Listing details |
| POST | `/listings/:id/bookmark` | Save a listing; returns `{ saved: true, listingId }` |
| DELETE | `/listings/:id/bookmark` | Unsave a listing; returns `{ saved: false, listingId }` |
| GET | `/listings/bookmarks` | Get saved listings in listing response shape |
| POST | `/bookings` | Create booking hold |
| PATCH | `/bookings/:id/confirm` | Confirm booking |
| PATCH | `/bookings/:id/cancel` | Cancel booking |
| PATCH | `/bookings/:id/complete` | Mark completed |
| PATCH | `/bookings/:id/dispute` | Raise dispute |
| GET | `/bookings` | List your bookings |
| GET | `/bookings/:id` | Get booking details |
| GET | `/trust/me` | Your trust score |
| GET | `/trust/users/:userId` | Public trust score |
| POST | `/fraud/reports` | Submit fraud report |

## Agent / Landlord Pages

| Method | Path | Description |
|---|---|---|
| GET | `/provider-pages/me` | Get the current provider Page |
| POST | `/provider-pages` | Create a Page or replace a rejected Page |
| PATCH | `/provider-pages/me` | Update a draft or rejected Page |
| POST | `/provider-pages/me/submit` | Submit Tier 2 Page verification |
| GET | `/provider-pages/admin/pending` | List pending Tier 2 Pages |
| PATCH | `/provider-pages/:id/verify` | Approve a Tier 2 Page |
| PATCH | `/provider-pages/:id/reject` | Reject a Tier 2 Page with a reason |
| POST | `/providers/:id/contact` | Email a verified provider from an approved student account |

Tier 2 submissions require a license/authorization reference, a profile picture, and at least one payout account. Payout account numbers are validated for supported providers.

## Response contracts

`GET /student-profiles/status` returns `{ status, profile }`. `status` is one of `NOT_SUBMITTED`, `PENDING`, `APPROVED`, or `REJECTED`. `profile` is `null` when the student has not submitted a profile; otherwise it includes the submitted profile fields and `rejectionReason` when rejected.

`GET /provider-pages/me` returns the Page fields plus `status` (`DRAFT`, `SUBMITTED`, `VERIFIED`, or `REJECTED`) and `rejectionReason` (the review reason or `null`). Account approval and Page approval are independent.

Listing responses include `id`, `title`, `description`, `price`, `lat`, `lng`, `campus`, `address`, `status`, `ownerId`, `photos`, `createdAt`, and `updatedAt`. Each photo contains `url` and `phash`.

`POST /providers/:id/contact` is email-only for now. An approved student sends `{ "message": "...", "listingId": "optional-listing-id" }`; the provider receives an email and the response is `{ "accepted": true, "delivery": "email" }`. It does not create in-app messages.

## Admin Review

| Method | Path | Description |
|---|---|---|
| GET | `/admin/review-queue` | List all Tier 1 and Tier 2 review submissions |
| GET | `/admin/review-queue/:id` | Get one submission and its submitted data |
| POST | `/admin/review` | Approve or reject a submission; rejection requires `reason` |
| POST | `/admin/onboard` | Manually onboard an agent/landlord |
| PATCH | `/admin/users/:id/verify-identity` | Verify identity |
| GET | `/admin/users` | List all users |
| GET | `/admin/users/:id` | User detail with trust events |
| PATCH | `/admin/listings/:id/flag` | Flag listing for review |
| GET | `/fraud/reports` | List all fraud reports |
| GET | `/fraud/reports/pending` | Pending reports |
| PATCH | `/fraud/reports/:id/resolve` | Resolve fraud report |
| GET | `/fraud/duplicates/pending` | Pending duplicate flags |
| PATCH | `/fraud/duplicates/:id/resolve` | Resolve duplicate flag |
| GET | `/trust/users/:userId/breakdown` | Full trust breakdown |

## Swagger

API documentation: `/api/v1/docs` when `ENABLE_SWAGGER=true`.
