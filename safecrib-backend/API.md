# SafeCrib Platform API

All endpoints are under `/api/v1/`.

## Authentication

Requires JWT Bearer token (obtained from `/auth/login`).

## Student Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Register with email + password |
| POST | `/auth/verify-email` | Verify email with token |
| POST | `/auth/login` | Login, get tokens |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/forgot-password` | Send reset email |
| POST | `/auth/reset-password` | Reset password |
| POST | `/auth/logout` | Revoke refresh token |
| GET | `/users/me` | Get profile |
| PATCH | `/users/me` | Update profile |
| POST | `/users/me/change-password` | Change password |
| GET | `/users/me/trust` | Your trust score |
| GET | `/listings` | Search listings |
| GET | `/listings/:id` | Listing details |
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

## Agent/Landlord Endpoints

All student endpoints plus:

| Method | Path | Description |
|---|---|---|
| POST | `/listings` | Create a listing |
| PATCH | `/listings/:id` | Update listing |
| DELETE | `/listings/:id` | Delete listing |
| POST | `/listings/:id/photos` | Upload photo (pHash check) |
| GET | `/listings/my` | Get your listings |

## Admin Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/admin/onboard` | Manually onboard agent/landlord |
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

API documentation: `/api/v1/docs` (when `ENABLE_SWAGGER=true`)
