import { getBackendOrigin } from "@/lib/backend-origin";

async function forward(request: Request, path: string[]) {
  const apiOrigin = getBackendOrigin();

  // path is ["api", "v1", "media", "<id>", "access"] — join with "/" to get
  // "api/v1/media/<id>/access" then construct the full URL against the origin.
  // Using `new URL(relative, base)` requires the relative part to NOT start with
  // a scheme, so we join the segments and let URL resolve it.
  const relativePath = path.join("/");
  const target = new URL(`${apiOrigin}/${relativePath}`);
  target.search = new URL(request.url).search;

  const incoming = request.headers;
  const headers = new Headers();

  // Forward auth header (Bearer token from localStorage-based auth)
  const authorization = incoming.get("authorization");
  if (authorization) headers.set("authorization", authorization);

  // Forward cookies so server-side session cookies work for future auth flows
  const cookie = incoming.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  // Forward content type for mutation requests
  const contentType = incoming.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const response = await fetch(target.toString(), {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    duplex: "half",
  } as RequestInit);

  // Relay all response headers the client needs (Set-Cookie, Content-Type, etc.)
  const responseHeaders = new Headers();
  const relayHeaders = ["content-type", "set-cookie", "cache-control", "etag", "last-modified"];
  for (const header of relayHeaders) {
    const value = response.headers.get(header);
    if (value) responseHeaders.set(header, value);
  }

  const responseBody = response.status === 204 ? null : await response.text();
  return new Response(responseBody, {
    status: response.status,
    headers: responseHeaders,
  });
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await context.params).path);
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await context.params).path);
}

export async function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await context.params).path);
}

export async function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await context.params).path);
}

export async function PUT(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await context.params).path);
}
