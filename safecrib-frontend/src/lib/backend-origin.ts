export function getBackendOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_ORIGIN
    || process.env.NEXT_PUBLIC_API_URL
    || process.env.NEXT_PUBLIC_BACKEND_URL;
  const fallback = process.env.NODE_ENV === "development"
    ? "http://localhost:3001"
    : "https://safecrib-zthw.onrender.com"
    // : "https://safecrib-zthw.onrender.com";

  return (configured || fallback).replace(/\/+$/, "");
}

export function logBackendRequest(method: string, path: string): void {
  if (typeof window === "undefined") return;

  const target = new URL(path, `${getBackendOrigin()}/`);
  // Query strings are intentionally omitted to keep tokens and sensitive values out of logs.
  console.info(`[SafeCrib API] ${method.toUpperCase()} ${target.origin}${target.pathname}`);
}
