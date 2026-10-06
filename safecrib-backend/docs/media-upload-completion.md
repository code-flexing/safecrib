# Media Upload Completion: Client and Operations Guide

This guide describes the complete direct-to-Cloudinary workflow, from reserving
a media row to retrieving it or investigating an upload that remains pending.
Every API path below is relative to `/api/v1` unless it is the Cloudinary URL
returned by SafeCrib.

## State and identifiers

The upload-signature response means only that SafeCrib created a `PENDING` row
and signed an upload request. Cloudinary's successful response means the file
bytes were accepted. The row becomes `READY` only after the authenticated
completion endpoint or the verified webhook updates it.

There are three separate identifiers:

| Identifier | Issued by | Meaning |
|---|---|---|
| `media.id` | SafeCrib | Database UUID used in SafeCrib routes, such as `/media/{mediaId}/complete` |
| `public_id` | SafeCrib and returned by Cloudinary | Cloudinary path stored on the media row; webhook lookup key |
| `asset_id` | Cloudinary | Cloudinary's immutable asset identifier, stored after completion |

Never search for a SafeCrib UUID in Cloudinary's `public_id` or assume that
Cloudinary returns it. Keep `media.id` from the signature response and pass that
ID in SafeCrib API routes.

## Required client procedure

Use the same bearer access token for all authenticated SafeCrib requests. Do not
send the file bytes to SafeCrib; they go directly to the upload URL.

### 1. Reserve the media record

For general uploads, including agent photos and license documents:

```http
POST /api/v1/media/upload-signature
Authorization: Bearer <access-token>
Content-Type: application/json
```

```json
{
  "purpose": "PROOF_OF_LICENSE",
  "contentType": "image/jpeg",
  "sizeBytes": 204800
}
```

Supported purposes include `AVATAR`, `COVER_PHOTO`, `PROVIDER_LOGO`,
`PROOF_OF_LICENSE`, `STUDENT_ID`, `PROOF_OF_STUDENTSHIP`, `CONTRACT_DOCUMENT`,
`LISTING_PHOTO`, and `LISTING_VIDEO`. `entityId` is optional and can associate
the upload with its intended listing or entity. Profile-specific signature
routes are also available:

| Method and path | Purpose | Body |
|---|---|---|
| `POST /api/v1/media/profile-picture/upload-signature` | `AVATAR` | `{ "contentType": "image/jpeg", "sizeBytes": 204800 }` |
| `POST /api/v1/media/cover-photo/upload-signature` | `COVER_PHOTO` | `{ "contentType": "image/jpeg", "sizeBytes": 204800 }` |

The successful response is `201` and contains `media.id`, `media.resourceType`,
`media.status: "PENDING"`, `uploadUrl`, and `uploadPayload`. Save
`media.id` and `uploadPayload.public_id`. Do not use the response status as the
upload completion signal.

### 2. Upload bytes to Cloudinary

POST `file` and every field in `uploadPayload` as `multipart/form-data` to the
exact `uploadUrl` returned by SafeCrib. The resource type is embedded in this
URL. Do not send the API secret, and do not substitute a Cloudinary delivery
URL for the upload URL.

Only continue when Cloudinary returns a `2xx` response. Retain these exact fields
from its JSON response for the next step: `asset_id`, `public_id`,
`resource_type`, `version`, and `signature`.

### 3. Complete the original media row

Immediately after Cloudinary's successful response, call:

```http
POST /api/v1/media/{mediaId}/complete
Authorization: Bearer <access-token>
Content-Type: application/json
```

Use `mediaId` from step 1 and Cloudinary's values from step 2:

```json
{
  "asset_id": "abc123def456",
  "public_id": "prod/providers/license/user-id/uuid",
  "resource_type": "image",
  "version": 1234567890,
  "signature": "a1b2c3d4e5f6789012345678901234ab"
}
```

SafeCrib verifies the response signature using the Cloudinary SDK and API
secret, checks that the authenticated caller owns the row, and compares its
stored `public_id` and resource type with Cloudinary's response. It then marks
that same database row `READY`; it does not create another media record or
return a URL.

Expected response (`200 OK`):

```json
{
  "media": {
    "id": "<mediaId>",
    "status": "READY"
  }
}
```

This endpoint is idempotent when the webhook has already marked that same row
ready. A successful `201` from step 1 or Cloudinary's `2xx` alone must never
drive the UI to its ready state.

### 4. Attach or retrieve the media

For listings, attach ready media with the existing domain routes:

| Method and path | Body |
|---|---|
| `POST /api/v1/listings/{listingId}/photos/media` | `{ "mediaId": "<mediaId>" }` |
| `POST /api/v1/listings/{listingId}/video` | `{ "mediaId": "<mediaId>" }` |

For retrieval, call `GET /api/v1/media/{mediaId}/access` with bearer auth. The
response includes `url` and `mediaId`; signed responses also include
`expiresAt`. The server returns temporary signed access for authenticated or
private media and logs access to protected documents.

For license documents, never persist, cache, or return a permanent public URL.
Only request a temporary authenticated access URL when a permitted user needs
to view the document. Do not expose the underlying Cloudinary delivery URL.

## Webhook and special cases

`POST /api/v1/media/webhook` is the public Cloudinary callback. Cloudinary
authenticates this request with `X-Cld-Signature` and `X-Cld-Timestamp`; clients
must not call this endpoint. The API verifies the webhook signature and queues
processing. The worker locates the media row by Cloudinary `public_id` and uses
the same repository `markReady` transition used by direct completion.

Webhook delivery remains a fallback if the client cannot reach completion. A
client may retry completion after an uncertain network result; it is safe to
repeat. `LISTING_VIDEO` is intentionally different: its actual uploaded byte
count must pass webhook validation, so clients must wait for the media status to
become ready before attaching a video. Clients should not call `/complete` for
listing videos; that endpoint intentionally rejects them.

The legacy `POST /api/v1/media/{mediaId}/confirm` endpoint remains for
compatibility. New clients should use `/complete`, which verifies Cloudinary's
response signature and exact upload identity.

## Recovery endpoints

| Method and path | Auth | Use |
|---|---|---|
| `GET /api/v1/media/pending` | Bearer token | List the caller's pending media IDs and statuses after an interrupted flow |
| `DELETE /api/v1/media/pending/{mediaId}` | Bearer token | Cancel an owned pending reservation |
| `GET /api/v1/media/{mediaId}/access` | Bearer token | Request a delivery URL after the record is ready |
| `DELETE /api/v1/media/{mediaId}` | Bearer token (owner/admin) | Schedule an owned asset for deletion |

For recovery, first match each pending record against the client's retained
Cloudinary response. If upload succeeded, retry `/complete` with the original
response fields. If it did not, cancel the pending record or allow stale-upload
cleanup to process it. Never create a replacement record merely because a
completion request timed out; retry against the original `media.id`.

## Response and error handling

| Status | Meaning | Client action |
|---|---|---|
| `200` | The original record is `READY` | Update the UI using `media.id` and `media.status` |
| `400` | Invalid response signature, `public_id` mismatch, `resource_type` mismatch, or invalid request | Do not mark ready; use the response message and backend warning log to identify the failed comparison |
| `401` | Missing or expired bearer token | Refresh or reauthenticate, then retry the same media ID |
| `403` | Caller does not own the record or its state cannot be completed | Do not retry with a different media ID |
| `404` | Media ID does not exist | Reconcile the ID with the signature response |
| `409` | Cloudinary asset identity is already associated with another media row | Stop and investigate; do not create another row |

If Cloudinary itself does not return `2xx`, do not call `/complete`. Keep the
record pending only while retrying the upload with the signed payload; otherwise
cancel it through the recovery route.

## Diagnose a stuck record

Compare the SafeCrib media UUID, stored `public_id`/`asset_id`, Cloudinary upload
response, and webhook event. Do not compare the database UUID to Cloudinary's
`public_id`: the webhook must look up the row using `public_id`.

Run this read-only query against the configured SafeCrib database, substituting
the actual values from the three sources:

```sql
SELECT id, owner_id, public_id, asset_id, resource_type, status,
       created_at, ready_at, failure_reason
FROM media
WHERE id = '<SafeCrib media UUID>'
   OR public_id = '<Cloudinary public_id>'
   OR asset_id = '<Cloudinary asset_id>';
```

Then compare these values:

| Source | Compare |
|---|---|
| Signature response | `media.id`, `uploadPayload.public_id`, `media.resourceType` |
| Cloudinary upload response | `public_id`, `asset_id`, `resource_type`, `version`, `signature` |
| Webhook event | `public_id`, `asset_id`, `resource_type`, `version`, `bytes` |
| Database row | `id`, `public_id`, `asset_id`, `resource_type`, `status`, `ready_at` |

Expected result: exactly one database row has the signature response's `media.id`
and Cloudinary's `public_id`; after completion its status is `READY` and its
`asset_id` matches Cloudinary. If the event's `public_id` differs, the webhook
cannot find the row. If code tries to look up the row by media UUID from the
event, that lookup is incorrect: Cloudinary events identify assets by
`public_id`/`asset_id`, not SafeCrib's database UUID. If the identifiers match
but status is pending, inspect webhook signature acceptance, queue health, and
worker logs; client completion should still resolve the standard photo/document
flow.