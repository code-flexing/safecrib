"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authApi } from "@/lib/api/auth";

type State = "idle" | "verifying" | "success" | "error" | "missing";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("token");
  const [state, setState] = useState<State>(token ? "verifying" : "missing");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState("missing");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await authApi.verifyEmail(token);
        if (!cancelled) setState("success");
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Verification failed";
          setErrorMsg(msg);
          setState("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === "verifying") {
    return (
      <div className="animate-fade-in">
        <h1 className="font-display text-display-md text-ink mb-4">Verifying…</h1>
        <div className="flex gap-1.5 items-center text-muted text-sm">
          <span className="w-4 h-4 border-2 border-muted border-t-ink rounded-full animate-spin inline-block" />
          Checking your verification link
        </div>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div className="animate-fade-slide-up">
        <h1 className="font-display text-display-md text-ink mb-4">Email verified</h1>
        <p className="text-muted text-sm mb-8">
          Your email address has been confirmed. You can now sign in to SafeCrib.
        </p>
        <Link href="/auth/login?verified=true" className="btn-primary inline-flex">
          Sign in
        </Link>
      </div>
    );
  }

  if (state === "missing") {
    return (
      <div className="animate-fade-slide-up">
        <h1 className="font-display text-display-md text-ink mb-4">Invalid link</h1>
        <p className="text-muted text-sm mb-8">
          This verification link is missing a token. Check your email for the
          original link, or request a new one.
        </p>
        <Link href="/auth/resend-verification" className="btn-secondary inline-flex">
          Resend verification email
        </Link>
      </div>
    );
  }

  // error
  return (
    <div className="animate-fade-slide-up">
      <h1 className="font-display text-display-md text-ink mb-4">Verification failed</h1>
      <div className="banner-error mb-6">{errorMsg ?? "The link may have expired or already been used."}</div>
      <p className="text-muted text-sm mb-8">
        Verification links expire after 24 hours. Request a new one below.
      </p>
      <Link href="/auth/resend-verification" className="btn-secondary inline-flex">
        Resend verification email
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
