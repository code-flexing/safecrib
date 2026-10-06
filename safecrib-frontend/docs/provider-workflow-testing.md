# Provider Workflow: Direct Testing

This runbook covers the agent/landlord frontend and its API handoff. The deployed API is documented at [SafeCrib OpenAPI](https://safecrib.onrender.com/api/v1/docs#/). Requests below target that service directly; the application forwards the same `/api/v1/...` paths through its backend proxy.

## Before testing

Use a non-production test account and a separate admin test account. Do not paste access tokens, private proof URLs, or real payout details into issues or screenshots. Keep these values in your local shell:

```sh
export API_BASE="https://safecrib.onrender.com/api/v1"
export ACCESS_TOKEN="<test-user-access-token>"
export ADMIN_TOKEN="<test-admin-access-token>"
```

Registering an account does not select a role. Sign in, then treat `GET /users/me` as the canonical account role and `GET /provider-pages/me` as the source of provider Page state. Call `GET /student-profiles/status` for `STUDENT` roles; do not call student-only status routes for active providers.

**Authorization diagnostic:** `Requires one of: STUDENT, AGENT, LANDLORD, ADMIN` is a real `403` authorization failure, not a visual-only warning. The frontend skips `/student-profiles/status` for `UNVERIFIED` accounts and treats their student profile as not submitted. If the error still appears, inspect the browser Network panel to identify the request: if it is `GET /provider-pages/me` or `POST /provider-pages`, the backend role guard must allow `UNVERIFIED` for the documented provider setup flow. Do not bypass a denied endpoint in the client.

```sh
curl -sS "$API_BASE/users/me" -H "Authorization: Bearer $ACCESS_TOKEN"
curl -i -sS "$API_BASE/provider-pages/me" -H "Authorization: Bearer $ACCESS_TOKEN"
```

Provider setup reads identity from the documented `POST /auth/me` endpoint directly, avoiding the deployed `GET /users/me` 403 seen for this account. Other app paths that use `GET /users/me` fall back to `/auth/me` on `403`. A `401` from the identity endpoint means the session is not accepted and the user must sign in again; do not infer or locally assign a role.

A missing Page may be returned as `null` or `404`, depending on the deployed backend behavior. Both mean setup is needed; refresh state after create, submit, or review rather than setting a role in browser storage.

## Provider Page

### Direct API sequence

1. Register with `POST /auth/register` using `{ "email": "...", "password": "...", "displayName": "..." }`, then sign in through `POST /auth/login`. Signup must not contain a role.
2. Upload proof using the signed-media flow. Call `POST /media/upload-signature` with `purpose: "PROOF_OF_LICENSE"`, the file MIME type, and byte size. Upload the file to the returned Cloudinary URL using every field in `uploadPayload`; wait for the media service to report `READY`. Use the resulting media ID as `proofOfLicense`, not a public delivery URL. Use the signed `AVATAR` flow for the profile image as well.
3. Create the Page using the contract body below. For a current `STUDENT`, include `switchAccountToProvider: true` only after explicit confirmation from that account holder. The frontend displays a confirmation before sending it.
4. Submit with `POST /provider-pages/me/submit`. Expect `SUBMITTED`; repeated submissions should not be treated as a second approval or as verified access.
5. Review the Page using a separate admin account. Admin-only endpoints must never be called by provider-facing UI.
6. Refresh `/users/me` and `/provider-pages/me`. Only a `VERIFIED` Page unlocks provider listing creation. A pending/rejected Page must not change the frontend's active mode or permissions.

Example request matching the supplied frontend workflow contract (replace media IDs and test data):

```sh
curl -i -X POST "$API_BASE/provider-pages" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Test Homes Abuja",
    "providerType": "AGENT",
    "proofOfLicense": "<ready-private-license-media-id>",
    "profilePicture": "<ready-avatar-media-id>",
    "payoutAccounts": [{
      "provider": "Test Bank",
      "accountName": "Test Homes Abuja",
      "accountNumber": "0123456789"
    }],
    "switchAccountToProvider": true
  }'
```

Omit `switchAccountToProvider` for non-student accounts. Do not send `businessRegNumber`; the API owns the generated SafeCrib reference.

### Live OpenAPI discrepancy to resolve

The supplied workflow contract defines `payoutAccounts` as an array of 1–10 entries, and the frontend sends an array. The live `CreateProviderPageDto` and `UpdateProviderPageDto` currently describe one `PayoutAccount` object instead. Confirm and align the backend DTO/OpenAPI before treating a `400`/`422` for the array as a frontend regression. The live schema also does not list `providerType` as required even though the workflow requires it. Do not silently remove provider type or multi-account support in the UI to accommodate an incomplete schema.

## Listing workflow

A verified provider can create a draft. This request should return a listing ID and a `DRAFT` state:

```sh
curl -i -X POST "$API_BASE/listings" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test room near campus",
    "description": "Test listing for workflow validation",
    "price": 50000,
    "discountAmount": 5000,
    "lat": 9.0765,
    "lng": 7.3986,
    "campus": "University of Abuja",
    "address": "123 Campus Road, Abuja",
    "locationReference": "9.0765,7.3986"
  }'
```

Use the returned ID as `LISTING_ID`. Upload each photo/video using `POST /media/upload-signature` with its corresponding listing purpose and `entityId: LISTING_ID`. Upload to the returned Cloudinary target, wait for `READY` (video readiness comes from the webhook), then attach with `POST /listings/$LISTING_ID/photos/media` or `POST /listings/$LISTING_ID/video` and `{ "mediaId": "..." }`. Only the listing response confirms attachment. The browser form enforces JPEG/PNG/WebP up to 15 MB, MP4/MOV/AVI/WebM up to 100 MB, five photos, and one video.

Submission requires an address or Maps reference and at least one attached photo or video:

```sh
curl -i -X POST "$API_BASE/listings/$LISTING_ID/submit" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Expect `SUBMITTED`, then verify the UI continues to show pending review until a subsequent API response reports `VERIFIED` or `REJECTED`. Do not use the listing DELETE route as an unpublish control.

## Browser acceptance pass

1. Sign in as a fresh `UNVERIFIED` account. Confirm the app does not label it as a verified student/provider and it cannot create a listing.
2. Sign in as a `STUDENT`, start provider setup, and cancel the conversion dialog. Confirm no Page create/update request is sent. Confirm again and inspect the request payload for `switchAccountToProvider: true`; confirm role remains API-controlled while Page status is pending.
3. In provider setup, check that proof uploads store media IDs, not public license URLs. Failed uploads keep the form values and show an actionable error.
4. On `DRAFT`/`REJECTED`, verify Page edit/resubmit is available. On `SUBMITTED`/`UNDER_REVIEW`, verify edit and repeated-submit actions are unavailable. On `VERIFIED`, verify home creation becomes available.
5. Create a listing draft, reload it, and verify the returned ID and fields persist. Attach photos/video; check uploaded-but-unattached is not counted as attached. Verify limits, retry feedback, map preview, and review-before-submit.
6. Submit with no media or no address/reference and confirm the client blocks submission; repeat through the API and confirm the server rejects it. After successful submit, check that the UI remains pending until refreshed server state changes.
7. Sign in as a verified provider and open a public listing. Booking should be available without a student profile. Student-profile status and bookmark endpoints must not be called for the provider role.
8. Open a listing as a student and confirm its map uses returned coordinates, its attached video uses the private `/media/:id/access` URL, and a report can be sent with a 10–2,000 character description. Confirmation must say the report is under review, not that the listing was removed.
9. In the browser Network panel, verify no provider UI calls `/listings/admin/pending-review`, `/listings/:id/verify`, `/listings/:id/reject`, `/fraud/duplicates/*`, `/fraud/reports/pending`, or `/fraud/reports/:id/resolve`.

## Authorization spot checks

- No token: protected requests return `401`.
- Non-verified provider creating a listing: `403`.
- Verified provider creating a listing: success with `DRAFT`.
- Provider attempting an admin review endpoint: `403`.
- Student-to-provider Page creation without consent: `409` or the documented account-mode conflict; after explicit consent, retry with `switchAccountToProvider: true`.
- Duplicate or over-limit media attachment: `409`; refresh the listing before retrying.
- Fraud report: `POST /fraud/reports` with `targetListingId`, one of `FAKE_LISTING`, `MISREPRESENTED`, `DOUBLE_BOOKING`, `SCAM_AGENT`, `OTHER`, and a 10–2,000 character description. A report starts pending; only admin resolution changes listing status.

Admin review testing requires the separate admin token and linked admin membership. Provider accounts must not receive admin controls even if a client modifies local browser state.
