# Verification Badges and Account Settings: Frontend Implementation and Testing

The signed-in customer settings page at `/profile` and the admin-only settings page at `/admin/settings` share account name and password controls. The customer page also renders verification tracking from the authenticated trust API. Admin routes remain protected by the admin layout and membership check. The browser never derives a badge from role or trust score. The live API docs are at [SafeCrib OpenAPI](https://safecrib.onrender.com/api/v1/docs#/).

## Implemented UI

- `VerificationBadge` maps `PROFILE_VERIFIED` to a green check, `AGENT_VERIFIED` to a blue shield, and `TRUST_CROWN` to a gold crown.
- Basic badge eligibility requires identity verification and an admin-approved student profile or verified provider Page. The trust API returns this as `eligible`; ineligible accounts see verification progress without a badge.
- Compact icon badges render as a 20px circle to keep profile and dashboard headers unobtrusive.
- The crown is always rendered gold. A response with `riskBlocked: true` is capped at the green baseline regardless of the returned advanced stage; a review warning is shown.
- `/profile` includes verification stage, badge, trust score, identity state, provider Page state, risk state, next milestone, API update time, and expandable criteria.
- Missing or unrecognized stage data produces an unavailable/error state, not a locally inferred badge.
- The panel loads `/auth/me` first and only calls trust routes for `STUDENT`, `AGENT`, `LANDLORD`, or `ADMIN`. Other roles, including `UNVERIFIED`, see a neutral eligibility message rather than a trust API authorization error.
- Only authenticated `/me` endpoints are used for the current user's trust state. The admin trust breakdown and cross-user stage endpoints are not called by this UI.
- Shared account settings allow editing `displayName` and changing a password; email and role are read-only. The profile update request intentionally sends only `displayName`, even though the live `UpdateUserDto` also documents a `role` property.
- Admins receive the same name/password controls on a separate route inside the admin-only layout. The page does not expose changes to admin role or membership.

## API contract

| Method and route | Use | Frontend behavior |
|---|---|---|
| `GET /trust/me/verification-stage` | Persisted current badge, risk state, criteria, milestone, timestamp | Required source for the rendered badge |
| `GET /trust/me` | Current trust score | Displayed as an informational score only |
| `POST /auth/me` | Authenticated current identity | Source for identity verification status when supplied |
| `GET /provider-pages/me` | Current provider Page state | Displays provider verification state; `404` is shown as not set up |
| `PATCH /users/me` | Update current account profile | Sends `{ "displayName": "..." }` only |
| `POST /users/me/change-password` | Change current account password | Requires current and new password; new password is at least eight characters |
| `GET /trust/users/:userId/verification-stage` | Other user's staged badge | Not used by the current-account settings UI |
| `GET /trust/users/:userId/breakdown` | Detailed trust breakdown | Admin-only; not used by provider/student UI |

The live OpenAPI lists the trust routes but does not publish a response schema for them. The UI accepts the response fields in the product contract: `stage`, `badge`, `badgeColor`, `eligible`, `riskBlocked`, `nextMilestone`, `criteria`, and `generatedAt`. It reads score from `trustScore` or `score` in `/trust/me`, and identity from `identityVerified` or the `identity` criterion. Missing optional fields are displayed as unavailable.

Example stage response:

```json
{
  "userId": "user_456",
  "role": "AGENT",
  "stage": "TRUST_CROWN",
  "badge": "GOLD_CROWN",
  "badgeColor": "gold",
  "riskBlocked": false,
  "nextMilestone": null,
  "criteria": [
    { "key": "identity", "label": "Identity verified", "met": true, "required": true },
    { "key": "provider", "label": "Provider verification", "met": true, "required": false },
    { "key": "trust", "label": "Trust score threshold", "met": true, "required": false }
  ],
  "generatedAt": "2026-09-27T00:00:00.000Z"
}
```

## Direct API checks

Use a test account and keep tokens out of screenshots and source files:

```sh
export API_BASE="https://safecrib.onrender.com/api/v1"
export ACCESS_TOKEN="<test-user-access-token>"

curl -i -sS "$API_BASE/trust/me/verification-stage" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

curl -i -sS "$API_BASE/trust/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

curl -i -sS -X POST "$API_BASE/auth/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

curl -i -sS "$API_BASE/provider-pages/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

curl -i -sS -X PATCH "$API_BASE/users/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Updated Test Name"}'

curl -i -sS -X POST "$API_BASE/users/me/change-password" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"<current-test-password>","newPassword":"<new-test-password>"}'
```

Confirm the stage result is one of the three documented values, `riskBlocked` is boolean, and criteria are an array. If the API is unavailable or returns an unknown stage, the frontend must not display an invented success badge.

## Browser checks

1. Sign in as `UNVERIFIED` and open `/profile`. Confirm only `/auth/me` is requested by the verification panel and a neutral “not available yet” state is shown; no trust endpoint should return the role-list 403.
2. Sign in as `STUDENT`, `AGENT`, `LANDLORD`, or `ADMIN` and open `/profile`. Confirm the role is loaded first, then the panel requests trust stage, trust score, and provider Page data, and the badge agrees with the stage response.
3. Test one response for each stage: green check, blue shield, gold crown. Verify the crown remains gold at mobile and desktop widths.
4. Return `riskBlocked: true` with an advanced stage in a test/staging response. Confirm only the green baseline is shown with a review warning.
5. Omit optional fields such as trust score, identity state, provider state, criteria, or `generatedAt`. Confirm these fields show their unavailable fallback without changing the badge stage.
6. Return `404` or malformed stage data from the stage endpoint. Confirm the page shows an unavailable/error message and does not infer a badge from account role or score.
7. On `/profile`, update the display name and change the password with valid test credentials. Confirm email/role are not editable and a wrong current password shows an API error.
8. Sign in as an administrator and open `/admin/settings`. Confirm the admin-only navigation exposes Settings and the shared form updates only that signed-in account. Confirm non-admins are redirected by the admin layout.
9. Verify no provider UI calls `/trust/users/:userId/breakdown`, fraud queues, or admin review endpoints.

## Backend-owned behavior

Trust computation, the `>= 85` crown threshold, confirmed/recent fraud blocking, review-flag decisions, persisted stage updates, and recognition email delivery belong to the backend. The frontend only renders the returned state. Recognition emails should be emitted on backend stage transitions, not on page visits; the current API docs expose no email-trigger route for the frontend.
