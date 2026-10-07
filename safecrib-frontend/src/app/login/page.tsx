"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { SafeCribLogo } from "@/components/branding/SafeCribLogo";
import { InstallButton } from "@/components/pwa/InstallButton";
import { Button } from "@/components/ui/Button";
import { BackHomeLink } from "@/components/ui/BackHomeLink";
import { ApiError, clearSession, getCurrentUser, primeCurrentUserCache, refreshCachedApi, setPersistedVerification, setSessionTokens, unwrapData } from "@/lib/api";

const API_URL = "/api/auth/login";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<0 | 1>(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("reason") === "session-expired") {
      setError("Your session expired. Please log in again.");
    }
  }, []);

  const goNext = () => {
    setError("");

    if (step === 0) {
      if (!email.trim()) {
        setError("Email is required.");
        return;
      }

      if (!isValidEmail(email)) {
        setError("Enter a valid email address.");
        return;
      }
    }

    if (step === 1) {
      if (!password) {
        setError("Password is required.");
        return;
      }

      void handleSubmit();
      return;
    }

    setStep(1);
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    setError("");

    if (!password) {
      setError("Password is required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const result: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(response.status === 401 ? "Invalid email or password." : "We could not log you in right now. Please try again.");
        return;
      }

      const tokenValue = (key: string) => {
        if (typeof result !== "object" || result === null) return null;
        const response = result as Record<string, unknown>;
        const nested = typeof response.data === "object" && response.data !== null ? response.data as Record<string, unknown> : null;
        const value = response[key] ?? nested?.[key];
        return typeof value === "string" && value.trim() ? value.trim().replace(/^Bearer\s+/i, "") : null;
      };
      const accessToken = tokenValue("accessToken") ?? tokenValue("access_token");
      const refreshToken = tokenValue("refreshToken") ?? tokenValue("refresh_token");

      if (!accessToken || !refreshToken) {
        setError("Login succeeded, but the server returned an invalid token response.");
        return;
      }

      setSessionTokens({ accessToken, refreshToken });

      try {
        const currentUser = await getCurrentUser<{ id?: string; role?: string; studentProfileStatus?: unknown; verification?: unknown }>();
        primeCurrentUserCache(currentUser);
        const role = String(currentUser?.role ?? "").toUpperCase();
        const providerRole = ["AGENT", "LANDLORD"].includes(role);
        const providerPageRequest = role === "ADMIN"
          ? Promise.resolve(null)
          : refreshCachedApi<unknown>("/api/v1/provider-pages/me")
              .then((response) => unwrapData<{ id?: string; status?: string } | null>(response))
              .catch((pageError: unknown) => {
                if (pageError instanceof ApiError && pageError.status === 404) return null;
                throw pageError;
              });
        const verificationRequest = ["STUDENT", "AGENT", "LANDLORD", "ADMIN"].includes(role)
          ? refreshCachedApi<unknown>("/api/v1/trust/me/verification-stage")
          : Promise.resolve(null);
        const studentStatusRequest = role === "STUDENT"
          ? refreshCachedApi<unknown>("/api/v1/student-profiles/status")
          : Promise.resolve(null);
        if (!providerRole) void refreshCachedApi<unknown>("/api/v1/listings").catch(() => undefined);
        const [providerPage, verificationStage] = await Promise.all([
          providerPageRequest,
          verificationRequest,
          studentStatusRequest,
        ]).then(([page, stage]) => [page, stage] as const);
        if (verificationStage && currentUser.id) setPersistedVerification(currentUser.id, verificationStage);
        if (providerRole && String(providerPage?.status ?? "").toUpperCase() === "VERIFIED") {
          await refreshCachedApi("/api/v1/listings/my");
        }
        router.push(providerRole || Boolean(providerPage && (providerPage.id || providerPage.status)) ? "/page" : "/dashboard");
      } catch (profileError) {
        if (profileError instanceof ApiError && profileError.status === 401) {
          clearSession();
          setError("Your login session was not accepted. Please try again.");
          return;
        }
        setError(profileError instanceof Error
          ? `You’re signed in, but we could not finish loading your account details: ${profileError.message}`
          : "You’re signed in, but we could not finish loading your account details. Please retry.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (step === 1) {
      void handleSubmit();
      return;
    }

    goNext();
  };

  const title = step === 0 ? "What is your email?" : "Enter your password";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(12,115,85,0.12),_transparent_30%),_linear-gradient(180deg,#ffffff_0%,#f3f7f4_100%)] px-4 py-6 sm:py-10">
      <div className="w-full max-w-md rounded-[22px] border border-black/10 bg-white p-5 shadow-[0_24px_60px_rgba(11,12,14,0.08)] sm:p-8">
        <div className="flex justify-center">
          <SafeCribLogo height={32} href={false} />
        </div>

        <div className="mt-6 flex items-center justify-between text-[0.7rem] font-medium uppercase tracking-[0.18em] text-black/45">
          <span>{step === 0 ? "Email" : "Password"}</span>
          <span>{step + 1}/2</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/5">
          <div className="h-full rounded-full bg-safecrib-green transition-all duration-300" style={{ width: `${((step + 1) / 2) * 100}%` }} />
        </div>

        <form onSubmit={handleFormSubmit} className="mt-8" noValidate>
          <h1 className="text-center text-3xl font-medium text-safecrib-black">{title}</h1>

          {step === 0 && (
            <div className="mt-8">
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-safecrib-black">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="student@university.edu"
                className="w-full rounded-[8px] border border-black/15 bg-white px-4 py-3 text-base text-safecrib-black placeholder:text-black/35 focus:border-safecrib-green focus:outline-none"
              />
            </div>
          )}

          {step === 1 && (
            <div className="mt-8">
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-safecrib-black">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  autoFocus
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-[8px] border border-black/15 bg-white px-4 py-3 pr-20 text-base text-safecrib-black placeholder:text-black/35 focus:border-safecrib-green focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-3 text-sm font-medium text-safecrib-green hover:text-[#0a5f47]"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}

          <div className="mt-8 flex items-center justify-between gap-3">
            {step === 0 ? (
              <BackHomeLink href="/" label="Back home" />
            ) : (
              <button type="button" onClick={() => { setError(""); setStep(0); }} className="text-sm font-medium text-black/65 hover:text-safecrib-black">Back</button>
            )}
            <Button type="button" onClick={goNext} loading={isSubmitting}>
              {step === 1 ? "Log in" : "Continue"}
            </Button>
          </div>
        </form>

        <div className="mt-6 rounded-[12px] border border-safecrib-green/15 bg-[#f3faf6] p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-safecrib-black">Use SafeCrib like an app</p>
              <p className="mt-1 text-xs leading-5 text-black/55">Install it for faster access.</p>
            </div>
            <InstallButton />
          </div>
        </div>

        <div className="mt-5 text-center text-sm text-black/60">
          Need an account? <Link href="/signup" className="font-medium text-safecrib-green">Create one</Link>
        </div>
      </div>
    </main>
  );
}
