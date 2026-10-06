export function getBackendOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_ORIGIN
    || process.env.NEXT_PUBLIC_API_URL
    || process.env.NEXT_PUBLIC_BACKEND_URL;
  const fallback = process.env.NODE_ENV === "development"
    ? "http://localhost:3001"
    : "https://safecrib.onrender.com";

  return (configured || fallback).replace(/\/+$/, "");
}
