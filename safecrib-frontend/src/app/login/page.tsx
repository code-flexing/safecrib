"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { SafeCribLogo } from "@/components/branding/SafeCribLogo";
import { InstallButton } from "@/components/pwa/InstallButton";
import { Button } from "@/components/ui/Button";
import { BackHomeLink } from "@/components/ui/BackHomeLink";
import { ApiError, clearSession, getCurrentUser, primeCurrentUserCache, refreshCachedApi, setSessionTokens, unwrapData } from "@/lib/api";
import { logBackendRequest } from "@/lib/backend-origin";

const API_URL = "/api/auth/login";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function getRoleFromAccessToken(accessToken: string) {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;

    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))) as { role?: unknown };
    return typeof decoded.role === "string" ? decoded.role.toUpperCase() : null;
  } catch {
    return null;
  }
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
      logBackendRequest("POST", "/api/v1/auth/login");
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

      const tokenRole = getRoleFromAccessToken(accessToken);
      const initialDestination = tokenRole && ["AGENT", "LANDLORD"].includes(tokenRole) ? "/page" : "/dashboard";
      router.replace(initialDestination);

      // Profile hydration and legacy provider-page detection must not hold up navigation.
      void (async () => {
        try {
          const currentUser = await getCurrentUser<{ id?: string; role?: string; studentProfileStatus?: unknown; verification?: unknown }>();
          primeCurrentUserCache(currentUser);
          const role = String(currentUser?.role ?? tokenRole ?? "").toUpperCase();
          const providerRole = ["AGENT", "LANDLORD"].includes(role);
          const providerPage = !providerRole && role !== "ADMIN"
            ? await refreshCachedApi<unknown>("/api/v1/provider-pages/me")
                .then((response) => unwrapData<{ id?: string; status?: string } | null>(response))
                .catch((pageError: unknown) => {
                  if (pageError instanceof ApiError && pageError.status === 404) return null;
                  throw pageError;
                })
            : null;
          const resolvedDestination = providerRole || Boolean(providerPage && (providerPage.id || providerPage.status))
            ? "/page"
            : "/dashboard";

          if (resolvedDestination !== initialDestination && window.location.pathname === initialDestination) {
            router.replace(resolvedDestination);
          }
        } catch (profileError) {
          if (profileError instanceof ApiError && profileError.status === 401) {
            clearSession();
            router.replace("/login?reason=session-expired");
          }
        }
      })();
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
    <main className="relative min-h-[100dvh] overflow-hidden px-4 py-6 sm:py-10 flex items-center">
      <Image
        src="/images/safecrib-robot.webp"
        alt=""
        aria-hidden="true"
        fill
        priority
        sizes="100vw"
        className="object-cover object-right-top"
        style={{ animation: "float 8s ease-in-out infinite" }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#050a08]/95 via-[#050a08]/70 to-transparent" aria-hidden="true" />
      <div className="absolute top-4 left-4 z-10">
        <SafeCribLogo height={24} inverse />
      </div>
      <div className="relative z-10 mx-auto max-w-6xl w-full flex justify-start">
        <div className="glass-card glass glass-dark-surface w-full max-w-md p-5 sm:p-8">
          <div className="flex justify-center lg:hidden">
            <SafeCribLogo height={24} inverse />
          </div>

          <div className="mt-6 flex items-center justify-between text-[0.7rem] font-medium uppercase tracking-[0.18em] text-white/70">
            <span>{step === 0 ? "Email" : "Password"}</span>
            <span>{step + 1}/2</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-safecrib-green transition-all duration-300" style={{ width: `${((step + 1) / 2) * 100}%` }} />
          </div>

          <form onSubmit={handleFormSubmit} className="mt-8" noValidate>
            <h1 className="text-center text-3xl font-medium text-white">{title}</h1>

            {step === 0 && (
              <div className="mt-8">
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-white">Email address</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="student@university.edu"
                  className="w-full rounded-[12px] border border-white/20 bg-white/10 px-4 py-3 text-base text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-safecrib-green/60 backdrop-blur-sm"
                />
              </div>
            )}

            {step === 1 && (
              <div className="mt-8">
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-white">Password</label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    autoFocus
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-[12px] border border-white/20 bg-white/10 px-4 py-3 pr-20 text-base text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-safecrib-green/60 backdrop-blur-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-3 text-sm font-medium text-white hover:text-white/90"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            )}

            {error && <p className="mt-4 text-sm text-red-400" role="alert">{error}</p>}

            <div className="mt-8 flex items-center justify-between gap-3">
              {step === 0 ? (
                <BackHomeLink href="/" label="← Back" />
              ) : (
                <button type="button" onClick={() => { setError(""); setStep(0); }} className="text-sm font-medium text-white/75 hover:text-white">← Back</button>
              )}
              <Button type="button" onClick={goNext} loading={isSubmitting} className="glass-pill glass-green">
                {step === 1 ? "Log in" : "Continue"}
              </Button>
            </div>
          </form>

          <div className="mt-6 rounded-[12px] glass p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">Use SafeCrib like an app</p>
                <p className="mt-1 text-xs leading-5 text-white/70">Install it for faster access.</p>
              </div>
              <InstallButton />
            </div>
          </div>

          <div className="mt-5 text-center text-sm text-white/70">
            Need an account? <Link href="/signup" className="font-medium text-white">Create one</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
