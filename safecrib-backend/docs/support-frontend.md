# Support Frontend Integration

This document defines the user support line and admin support inbox. Support is
an authenticated in-app conversation system. A user sends an issue from the
main dashboard; admins see it in their dashboard, reply, and resolve it.

## Frontend Routes

| Route | Access | Purpose |
|---|---|---|
| `/support` | Authenticated user | List the user's conversations and start a new issue. |
| `/support/[id]` | Conversation owner | Read messages and send follow-up messages. |
| `/admin/support` | `ADMIN` | Admin inbox with open/resolved filters and refresh/polling. |
| `/admin/support/[id]` | `ADMIN` | Read the full conversation, reply, and resolve it. |

Add a support/help icon to the authenticated user's dashboard. The icon should
open `/support` and show an unread/open count when the API reports open
conversations. Do not show admin support navigation to non-admin users.

## User API

All support endpoints require the user's access token:

```http
Authorization: Bearer <accessToken>
```

### Start a conversation

```http
POST /api/v1/support/conversations
Content-Type: application/json
Authorization: Bearer <accessToken>

{
  "subject": "Document upload issue",
  "message": "I cannot upload my proof of studentship."
}
```

`subject` is optional and limited to 160 characters. `message` is required and
limited to 5,000 characters. The response contains the conversation and its
first message:

```json
{
  "id": "conversation-id",
  "userId": "user-id",
  "status": "OPEN",
  "subject": "Document upload issue",
  "lastMessageAt": "2026-09-23T12:00:00.000Z",
  "messages": [
    {
      "id": "message-id",
      "conversationId": "conversation-id",
      "senderId": "user-id",
      "senderRole": "USER",
      "body": "I cannot upload my proof of studentship.",
      "createdAt": "2026-09-23T12:00:00.000Z"
    }
  ]
}
```

The message is persisted immediately. The backend also queues an email
notification to verified admin accounts. Email delivery is supplementary; the
admin dashboard should read from the API, not wait for the email.

### List conversations

```http
GET /api/v1/support/conversations
Authorization: Bearer <accessToken>
```

### Read one conversation

```http
GET /api/v1/support/conversations/<conversationId>
Authorization: Bearer <accessToken>
```

The API only returns conversations owned by the authenticated user.

### Send a follow-up

```http
POST /api/v1/support/conversations/<conversationId>/messages
Content-Type: application/json
Authorization: Bearer <accessToken>

{
  "message": "I tried again and the upload still fails."
}
```

A resolved conversation cannot receive another user message. Start a new
conversation when the issue is resolved and a new issue occurs.

## Admin API

Every admin endpoint requires an access token for a user whose role is
`ADMIN`.

### List the inbox

```http
GET /api/v1/admin/support/conversations?status=OPEN
Authorization: Bearer <adminAccessToken>
```

The `status` query is optional and accepts `OPEN` or `RESOLVED`. Use `OPEN` for
the default inbox. The response includes the user summary and the latest
message, ordered by `lastMessageAt` descending.

### Read a conversation

```http
GET /api/v1/admin/support/conversations/<conversationId>
Authorization: Bearer <adminAccessToken>
```

The response includes the user, every message, each sender role, and timestamps.
Render `senderRole: "USER"` as the user message and
`senderRole: "ADMIN"` as the admin message.

### Reply to the user

```http
POST /api/v1/admin/support/conversations/<conversationId>/messages
Content-Type: application/json
Authorization: Bearer <adminAccessToken>

{
  "message": "Thanks for reporting this. Please try a PDF smaller than 5 MB."
}
```

The response is the newly created admin message. Refresh the conversation after
sending so the client has the canonical status and timestamp.

### Resolve a conversation

```http
PATCH /api/v1/admin/support/conversations/<conversationId>/resolve
Content-Type: application/json
Authorization: Bearer <adminAccessToken>

{}
```

A resolved conversation becomes read-only for the user. An admin reply reopens
it automatically, so the admin can continue a conversation when the user
responds or more work is needed.

## Near-Real-Time Updates

There is no WebSocket endpoint in the current backend. Implement the support
line with API polling:

- Poll the user conversation or admin inbox every 10 to 15 seconds while the
  support view is open.
- Refresh immediately after sending a message or replying.
- Stop polling when the route is hidden or unmounted.
- Use `lastMessageAt` to avoid unnecessary rerenders.
- Keep the compose text when a request fails.

The message is available to the admin as soon as the `POST` request succeeds;
email notification may arrive later or fail independently.

## UI and Safety Rules

- Show loading, empty, sending, sent, error, and resolved states.
- Disable send while a request is in flight, but do not clear text until success.
- Trim messages before sending and reject empty messages client-side.
- Escape message text when rendering; do not inject it as HTML.
- Never expose another user's conversation through a client-controlled ID.
- Never log message bodies, email addresses, access tokens, or private media URLs.
- Show the conversation owner's name/email only in the admin surface.
- Add keyboard-accessible message composer, focus management, and readable
  timestamps.
- Treat support messages as private operational data, not public comments.

## API Error Handling

| Status | Frontend behavior |
|---|---|
| `400` | Keep the message and show validation details. |
| `401` | Refresh once; if refresh fails, clear session and redirect to login. |
| `403` | Leave the admin surface or show that the account is not authorized. |
| `404` | Show that the conversation is unavailable and refresh the list. |
| `409` | Explain that the conversation is resolved; reload its current state. |
| `429` | Preserve the message and ask the user to retry later. |
| `5xx` | Keep the draft and show a retry action. |
