import { getBackendOrigin } from "@/lib/backend-origin";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const apiOrigin = getBackendOrigin();

  const response = await fetch(`${apiOrigin}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();

  return new Response(text, {
    status: response.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
