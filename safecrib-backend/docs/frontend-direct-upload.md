# Frontend — Simple Media Direct Upload

This document describes the **simple direct-upload flow** for sending a photo or
file from the client to the backend. In this flow the backend uploads the file
to Cloudinary server-side (authenticated with the API secret) and returns the
resulting URL. **No upload presets, no signed-client payload, and no
`upload_preset` field are required.**

## When to use this flow

Use this for every media upload unless you have a specific need for the
signed `upload-signature` flow (chunked/video uploads). It covers:

- Profile avatar (`AVATAR`)
- Profile cover photo (`COVER_PHOTO`)
- Listing photos (`LISTING_PHOTO`)
- Provider logo (`PROVIDER_LOGO`)
- Verification documents (`STUDENT_ID`, `PROOF_OF_STUDENTSHIP`, `PROOF_OF_LICENSE`)
- Contract documents (`CONTRACT_DOCUMENT`)

## Endpoint

```http
POST /api/v1/media/upload
Content-Type: multipart/form-data
Authorization: Bearer <accessToken>
```

### Form fields

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | file (multipart) | yes | The file to upload. |
| `purpose` | string (`MediaPurpose`) | yes | What the asset is for — see the table below. |
| `entityId` | string | no | Entity this media belongs to. Defaults to the current user id (use this for `LISTING_PHOTO` so the asset is namespaced under the listing). |

#### `purpose` enum values

```
AVATAR | COVER_PHOTO | LISTING_PHOTO | LISTING_VIDEO |
PROVIDER_LOGO | STUDENT_ID | PROOF_OF_STUDENTSHIP |
PROOF_OF_LICENSE | CONTRACT_DOCUMENT
```

### Response (201)

```json
{
  "media": {
    "id": "3fa85f64-...",
    "ownerId": "user_abc",
    "purpose": "AVATAR",
    "resourceType": "IMAGE",
    "deliveryType": "UPLOAD",
    "publicId": "prod/users/avatar/user_abc/01J9X4V...",
    "assetId": "a1b2c3d4e5f6789012345678901234ab",
    "format": "png",
    "bytes": 204800,
    "width": 200,
    "height": 200,
    "durationSec": null,
    "status": "READY",
    "createdAt": "2026-09-23T12:00:00.000Z",
    "readyAt": "2026-09-23T12:00:01.000Z"
  },
  "url": "https://res.cloudinary.com/u1dad45h/image/upload/prod/users/avatar/user_abc/01J9X4V....png"
}
```

- `media.id` — the internal media id. Use it to reference the asset (display, delete).
- `url` — the public Cloudinary CDN URL. Store / render this directly.

## Implementation steps

### 1. Attach the access token

Every request needs the authenticated user's access token:

```http
Authorization: Bearer <accessToken>
```

### 2. Build the multipart form

```js
const formData = new FormData();
formData.append('file', file);            // the File object from <input type="file">
formData.append('purpose', 'AVATAR');      // choose from the purpose enum above
// For listing photos, namespace the asset under the listing:
// formData.append('entityId', listingId);
```

### 3. POST to the endpoint

```js
const res = await fetch('/api/v1/media/upload', {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}` },
  body: formData,
});

if (!res.ok) {
  const { message } = await res.json().catch(() => ({}));
  throw new Error(message ?? `Upload failed (${res.status})`);
}

const { media, url } = await res.json();
// url is a ready-to-use Cloudinary CDN link
```

> Do **not** set `Content-Type` manually on the `fetch` call — when the body is a
> `FormData` instance the browser sets the `multipart/form-data` boundary
> automatically.

### 4. Use the returned URL

Render or store `url`. For private/authenticated purposes (`STUDENT_ID`,
`PROOF_OF_STUDENTSHIP`, `PROOF_OF_LICENSE`) the returned `url` is a public
delivery URL only for `UPLOAD`-delivery assets; use
`GET /api/v1/media/:id/access` to obtain a short-lived signed URL for viewing
those documents.

### 5. Deleting an asset

```http
DELETE /api/v1/media/:id
Authorization: Bearer <accessToken>
```

Returns `204` on success. The asset is soft-deleted then purged from Cloudinary
asynchronously.

## Size / type limits

The backend enforces these per `purpose` (requests over the limit or with a
disallowed type are rejected with `400`):

| Purpose | Allowed MIME types | Max size |
|---|---|---|
| `AVATAR` | jpeg, png, webp, gif | 5 MB |
| `COVER_PHOTO` | jpeg, png, webp | 10 MB |
| `LISTING_PHOTO` | jpeg, png, webp | 15 MB |
| `LISTING_VIDEO` | mp4, mov, avi, webm | 500 MB |
| `PROVIDER_LOGO` | jpeg, png, webp, svg | 5 MB |
| `STUDENT_ID` | jpeg, png, webp, pdf | 10 MB |
| `PROOF_OF_STUDENTSHIP` | jpeg, png, webp, pdf | 10 MB |
| `PROOF_OF_LICENSE` | jpeg, png, webp, pdf | 10 MB |
| `CONTRACT_DOCUMENT` | pdf | 25 MB |

## Important notes

- The file bytes travel straight to the backend, which streams them to
  Cloudinary using the server's API secret. Never embed the Cloudinary API
  secret in frontend code.
- No `upload_preset` is sent or needed for this flow.
- The endpoint is rate limited (20 requests/min per user). Retry with
  exponential backoff on `429`.
- After a successful upload the `media.status` is `READY` immediately — there is
  no webhook round-trip to wait on.
