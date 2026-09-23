# Admin Frontend Guidelines

This document is the implementation contract for the SafeCrib admin frontend.
The frontend is a separate admin surface for authorized `ADMIN` users. It is
not an agent or landlord portal.

## Product Boundaries

There are three different workflows:

| Workflow | User | Purpose |
|---|---|---|
| Admin account management | `ADMIN` | Log in, create other admins, review users, and moderate platform activity. |
| Student verification | Student applicant | Submit a student profile for admin approval. |
| Provider Page verification | Agent or landlord | Create a provider Page, then submit it for review before using provider features such as listings/lodges. |

`POST /api/v1/admin/onboard` is **not** a Page creation or review endpoint. It
is an exceptional admin-only operation that creates an already-verified agent
or landlord account. The normal agent/landlord flow uses `/provider-pages`, not
`/admin/onboard`.

## Frontend Routes

| Route | Required session | Behavior |
|---|---|---|
| `/admin/login` | None | Admin login form. Do not show signup or agent/landlord registration links. |
| `/admin` | `ADMIN` | Pending review queue, filters, refresh, and responsive navigation shell. |
| `/admin/reviews/[id]` | `ADMIN` | Full submitted profile, media references, and approve/reject actions. |
| `/admin/admins/new` | `ADMIN` | Optional admin-management screen. Do not expose the bootstrap endpoint as a normal public signup. |

The admin session guard must run before rendering any protected route or making
protected data requests:

1. No session: redirect to `/admin/login`.
2. Session exists: call `POST /api/v1/auth/me`.
3. `role !== "ADMIN"`: clear the session and show an access-denied state or
   redirect to the normal application.
4. `role === "ADMIN"`: render the admin shell.

Do not rely on a role stored only in local storage. The backend role check is
the security boundary; the frontend guard is for routing and user experience.

## Authentication

There is no separate backend `/admin/login` endpoint. The admin login page uses
the shared auth endpoint:

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "..."
}
```

The response is:

```json
{
  "accessToken": "...",
  "refreshToken": "..."
}
```

The response does not include the user role. Verify the account immediately:

```http
POST /api/v1/auth/me
Authorization: Bearer <accessToken>
```


The expected response for an admin is:

```json
{
  "id": "user-id",
  "email": "admin@example.com",
  "role": "ADMIN"
}
```

Attach the access token to every admin request:

```http
Authorization: Bearer <accessToken>
```

### Refresh and logout

When an admin request returns `401`, call `POST /api/v1/auth/refresh` once with
the stored refresh token. Replace both tokens and retry the original request
once. If refresh fails, clear the session and redirect to `/admin/login`.

Logout uses the shared endpoint:

```http
POST /api/v1/auth/logout
Content-Type: application/json

{
  "refreshToken": "<stored refresh token>"
}
```

Clear local session state even if the logout request fails. Never include access
or refresh tokens in logs, URLs, analytics events, or error messages.

## Admin Account Creation

The first admin is created through the public bootstrap endpoint. This endpoint
is intentionally unauthenticated for initial setup, so deploy it behind a
temporary deployment restriction, private network, secret gateway, or disable
it after the first admin is created. It must not be presented as a public
signup page.

```http
POST /api/v1/admin/create
Content-Type: application/json

{
  "email": "reviewer@safecrib.com",
  "password": "AdminSecure123!",
  "displayName": "SafeCrib Reviewer"
}
```

Rules:

- The backend always assigns `role: "ADMIN"`.
- The backend creates the account as email-verified and identity-verified.
- Never send a `role` field from the frontend; it is not accepted by the DTO.
- `409` means the email already exists.
- The response never includes the password.
- After the first admin is created, do not leave this endpoint openly reachable.
- Admin review endpoints remain protected and require an `ADMIN` bearer token.


## Canonical Review API

Use these three endpoints for the unified admin review interface. They cover
both student profiles and agent/landlord provider Pages.

| Method | Endpoint | Use |
|---|---|---|
| `GET` | `/api/v1/admin/review-queue?status=PENDING` | Load the pending queue. |
| `GET` | `/api/v1/admin/review-queue/:id` | Load one complete submission. |
| `POST` | `/api/v1/admin/review` | Approve or reject one submission. |

All three require an admin bearer token.

### Queue request

```http
GET /api/v1/admin/review-queue?status=PENDING
Authorization: Bearer <admin access token>
```

Supported filters:

- `status`: `PENDING`, `APPROVED`, or `REJECTED`.
- `tier`: `STUDENT` or `LANDLORD`.

For the main queue, use `status=PENDING`. Use `entityType` to decide the UI
category. Do not use `tier=LANDLORD` to decide whether the provider is an agent
or landlord: both provider types currently use that compatibility tier.

### Queue record

```ts
type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type EntityType = 'student_profile' | 'provider_page';
type ReviewType = 'SIGNUP' | 'CREATE_PAGE';

type ReviewSubmission = {
  id: string;
  email: string;
  tier: 'STUDENT' | 'LANDLORD';
  reviewType: ReviewType;
  status: ReviewStatus;
  entityType: EntityType;
  entityId: string | null;
  submittedData: Record<string, unknown>;
  reviewNotes: string | null;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  submittedAt: string;
  createdAt: string;
};
```

Display rules:

- `student_profile`: label as **Student account**.
- `provider_page`: label as **Agent account** or **Landlord account** based on
  `submittedData.providerType`.
- `PENDING`: show approve and reject actions.
- `APPROVED` or `REJECTED`: show read-only status and decision details.
- Sort pending records by the API response order; do not reorder them in a way
  that hides the oldest submission.

## Review Detail

Open a queue record at `/admin/reviews/[id]` and request:

```http
GET /api/v1/admin/review-queue/<submissionId>
Authorization: Bearer <admin access token>
```

Render the fields from `submittedData` based on `entityType`.

### Student submission

Show the display name, email, school, course, level, date of birth, gender,
phone number, emergency contact, social links, proof of studentship, and
profile picture.

### Provider Page submission

Show the display name, `providerType`, proof of license, payout account
references, business name, registration number, business address, contact
numbers, social links, and profile picture.

Provider type is the important distinction:

```ts
const providerLabel = submittedData.providerType === 'LANDLORD'
  ? 'Landlord account'
  : 'Agent account';
```

Do not call `/admin/onboard` from this page. It creates a separate manually
verified provider account and does not review the queue submission.

## Media and Documents

Submitted profile pictures and documents may be URLs, media IDs, or stored
references inside `submittedData`. They are not guaranteed to be inline image
data.

Frontend behavior:

1. If a value is a safe, usable URL, render it as an image preview or document
   link.
2. If it is a media ID, request `GET /api/v1/media/:id/access` with the admin
   bearer token and use the returned delivery URL.
3. Show a loading state while resolving the URL and an unavailable state when
   the media is missing or not ready.
4. Do not expose private document URLs outside the admin surface.
5. Do not send document URLs, identity data, or payout account data to
   analytics or client-side logs.

## Approve and Reject

Approve:

```http
POST /api/v1/admin/review
Authorization: Bearer <admin access token>
Content-Type: application/json

{
  "submissionId": "<submissionId>",
  "status": "APPROVED"
}
```

Reject:

```http
POST /api/v1/admin/review
Authorization: Bearer <admin access token>
Content-Type: application/json

{
  "submissionId": "<submissionId>",
  "status": "REJECTED",
  "reason": "The submitted license reference could not be verified."
}
```

Reject rules:

- Open a confirmation dialog before submitting.
- Require a trimmed, non-empty reason.
- Limit the input to 2,000 characters.
- Keep the reason visible to the admin before confirmation.
- Disable both actions while the request is pending.
- After success, update the detail status and remove the item from the pending
  queue or refresh the queue.

Never allow a second review action after a successful decision.

## Provider Page Submission

The agent/landlord frontend uses this flow, not `/admin/onboard`:

```http
POST /api/v1/provider-pages
Authorization: Bearer <agent or landlord access token>
Content-Type: application/json
```

The body contains the Page fields, including `providerType: "AGENT"` or
`providerType: "LANDLORD"`. After saving the Page:

```http
POST /api/v1/provider-pages/me/submit
Authorization: Bearer <agent or landlord access token>
```

The response includes `reviewQueueId`. That ID is the ID used by the admin
queue and `/admin/review` endpoint.

The provider cannot use provider features that require verification until the
Page is approved. Rejected Pages can be corrected and resubmitted through the
provider Page flow.

## Admin Operations

The admin shell may expose these existing admin-only operations in navigation
or separate screens:

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/v1/admin/users` | List users. |
| `GET` | `/api/v1/admin/users/:id` | View user details and trust events. |
| `PATCH` | `/api/v1/admin/users/:id/verify-identity` | Verify a user identity. |
| `PATCH` | `/api/v1/admin/listings/:id/flag` | Flag a listing. |
| `GET` | `/api/v1/provider-pages/admin/pending` | Provider-only pending list, if a separate provider screen is required. |
| `PATCH` | `/api/v1/provider-pages/:id/verify` | Direct provider Page approval. |
| `PATCH` | `/api/v1/provider-pages/:id/reject` | Direct provider Page rejection. |

For the unified admin review product, prefer `/admin/review-queue` and
`/admin/review`. Do not build two competing queue states unless the product
specifically requires a provider-only moderation screen.

## Error Handling

| Status | Required frontend behavior |
|---|---|
| `400` | Keep the form open and show the validation message. |
| `401` | Refresh once; if refresh fails, clear session and redirect to login. |
| `403` | Treat as an invalid admin session and leave the admin surface. |
| `404` | Show that the record is unavailable and refresh the queue. |
| `409` | Another admin changed the record or the email exists; refresh the relevant data and show the server message. |
| `429` | Preserve form input and show a retry-later state. |
| `5xx` | Show a non-destructive error with a retry action; do not discard review input. |

## UI Requirements

- Use a responsive navigation shell with queue, admin accounts, and logout.
- Show loading, empty, error, and refreshing states on the queue.
- Keep action buttons stable while media and data load.
- Make the rejection reason a proper multiline field with a visible character
  limit.
- Use a confirmation step for approval and rejection.
- Make status, provider type, and submission date easy to scan.
- Preserve unsent rejection text if a request fails.
- Use accessible labels, keyboard navigation, focus management for dialogs, and
  visible error messages.
- Avoid rendering sensitive values in browser titles, URLs, telemetry, or
  console output.