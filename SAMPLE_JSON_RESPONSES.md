# Sample JSON Responses (after verification.kind added)

## Comment payload (`/api/v1/listings/{id}/comments`)

```json
[
  {
    "id": "comment_1",
    "body": "Is this place close to campus?",
    "parentId": null,
    "createdAt": "2026-10-10T14:30:00.000Z",
    "user": {
      "id": "student_1",
      "displayName": "victory",
      "username": "victory",
      "role": "STUDENT",
      "profilePicture": "https://cdn.safecribs.com/avatars/victory.jpg",
      "identityVerified": true,
      "studentProfile": { "status": "APPROVED", "profilePicture": null },
      "providerPage": null,
      "verification": {
        "kind": "student"
      }
    },
    "mentions": [
      {
        "user": {
          "id": "agent_1",
          "displayName": "Destiny Tch",
          "username": "destiny_tch",
          "role": "AGENT",
          "profilePicture": null,
          "identityVerified": true,
          "studentProfile": null,
          "providerPage": { "verificationState": "VERIFIED" },
          "verification": {
            "kind": "agent"
          }
        }
      }
    ]
  }
]
```

## Feed item / listing (owner in listing response)

> `availability` (`AVAILABLE` | `BOOKED` | `RENTED` | `SOLD`) and `availabilityUpdatedAt`
> are owner-maintained fields on every listing response. The binary `availabilityStatus`
> field is still returned for backward compatibility. Availability is editable via
> `PATCH /api/v1/listings/{id}/availability` (owner only) and through the create/edit form.

```json
{
  "id": "listing_1",
  "title": "Cozy room near campus",
  "price": 50000,
  "status": "VERIFIED",
  "availability": "AVAILABLE",
  "availabilityUpdatedAt": "2026-10-12T09:00:00.000Z",
  "availabilityStatus": "AVAILABLE",
  "owner": {
    "id": "agent_1",
    "displayName": "codeflex",
    "username": "codeflex",
    "profilePicture": null,
    "role": "AGENT",
    "identityVerified": true,
    "verification": {
      "stage": "AGENT_VERIFIED",
      "badge": "BLUE_SHIELD",
      "badgeColor": "blue",
      "riskBlocked": false,
      "kind": "agent"
    },
    "publicVerification": null
  }
}
```

## /me (`/api/v1/users/me`)

```json
{
  "id": "admin_1",
  "email": "admin@safecribs.com",
  "displayName": "SafeCribs Team",
  "username": "safecribs",
  "profilePicture": null,
  "role": "ADMIN",
  "emailVerified": true,
  "identityVerified": true,
  "trustScore": 100,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-10-10T00:00:00.000Z",
  "verification": {
    "isVerified": true,
    "stage": "STAFF",
    "badge": "STAFF_STAR",
    "badgeColor": "admin",
    "riskBlocked": false,
    "eligible": true,
    "kind": "staff"
  },
  "verificationStage": {
    "stage": "PROFILE_VERIFIED",
    "badge": "GREEN_CHECK",
    "badgeColor": "green",
    "eligible": true,
    "riskBlocked": false,
    "nextMilestone": "Complete identity verification",
    "criteria": [...]
  }
}
```
