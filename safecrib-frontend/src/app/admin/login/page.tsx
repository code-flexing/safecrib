"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SafeCribLogo } from "@/components/branding/SafeCribLogo";
import { Button } from "@/components/ui/Button";
import { ApiError, clearSession, setSessionTokens, verifyAdminSession } from "@/lib/api";

function tokenFrom(value: unknown, key: "accessToken" | "refreshToken") {
  if (typeof value !== "object" || value === null) return null;
  const response = value as Record<string, unknown>;
  const nested = typeof response.data === "object" && response.data !== null ? response.data as Record<string, unknown> : null;
  const token = response[key] ?? response[key === "accessToken" ? "access_token" : "refresh_token"] ?? nested?.[key] ?? nested?.[key === "accessToken" ? "access_token" : "refresh_token"];
  return typeof token === "string" && token.trim() ? token.replace(/^Bearer\s+/i, "").trim() : null;
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("reason");
    if (reason === "denied") setError("This account does not have administrator access.");
    if (reason === "session-expired") setError("Your admin session expired. Please sign in again.");
    if (!localStorage.getItem("safecrib_access_token")) return;
    void verifyAdminSession().then(() => router.replace("/admin")).catch(() => clearSession());
  }, [router]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password }) });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new ApiError(response.status, "Invalid admin credentials.");
      const accessToken = tokenFrom(payload, "accessToken");
      const refreshToken = tokenFrom(payload, "refreshToken");
      if (!accessToken || !refreshToken) throw new Error("The server returned an invalid token response.");
      setSessionTokens({ accessToken, refreshToken });
      await verifyAdminSession();
      router.replace("/admin");
    } catch (loginError) {
      clearSession();
      setError(loginError instanceof ApiError && loginError.status === 401 ? "Invalid admin credentials." : loginError instanceof ApiError && loginError.status === 403 ? "This account does not have administrator access." : loginError instanceof Error ? loginError.message : "We could not sign you in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(12,115,85,0.08),_transparent_28%),_linear-gradient(180deg,#ffffff_0%,#f5f7f2_100%)] px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-md rounded-[18px] border border-black/10 bg-white p-8 shadow-[0_24px_60px_rgba(11,12,14,0.08)]">
        <div className="flex justify-center"><SafeCribLogo height={32} href={false} /></div>
        <p className="mt-8 text-center text-xs font-semibold uppercase tracking-[0.2em] text-safecrib-green">Restricted access</p>
        <h1 className="mt-3 text-center text-3xl font-medium text-safecrib-black">Admin sign in</h1>
        <p className="mt-3 text-center text-sm leading-6 text-black/60">Use an administrator account created through the secure onboarding endpoint.</p>
        <label className="mt-8 block text-sm font-medium text-safecrib-black">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-[8px] border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none" /></label>
        <label className="mt-5 block text-sm font-medium text-safecrib-black">Password<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-[8px] border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none" /></label>
        {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}
        <Button type="submit" loading={loading} className="mt-8 w-full">Sign in to admin</Button>
      </form>
    </main>
  );
}
