import { getBackendOrigin } from "@/lib/backend-origin";

async function forward(request: Request, path: string[]) {
  const apiOrigin = getBackendOrigin();
  const target = new URL(path.join("/"), `${apiOrigin}/`);
  target.search = new URL(request.url).search;

  const headers = new Headers();
  const authorization = request.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const response = await fetch(target.toString(), {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    duplex: "half",
  } as RequestInit);

  const responseBody = response.status === 204 ? null : await response.text();
  return new Response(responseBody, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8" },
  });
}
///
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