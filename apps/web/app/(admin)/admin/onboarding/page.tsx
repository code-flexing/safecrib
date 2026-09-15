"use client";

/**
 * /admin/onboarding — Manual agent/landlord onboarding and identity verification.
 *
 * Two actions:
 *   1. Manually onboard a user as AGENT or LANDLORD (POST /admin/onboard).
 *   2. Mark a user's identity as verified (PATCH /admin/users/:id/verify-identity).
 *
 * This is the MVP bootstrap path — before the self-serve identity verification
 * flow exists, admins do this manually from this screen.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { UserCheckIcon, ShieldCheckIcon } from "lucide-react";
import { apiClient } from "@/lib/api/client";

// ── Page ───────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  return (
    <div className="px-6 py-8 max-w-xl">
      <h1 className="font-display text-display-md text-ink mb-2">Onboarding</h1>
      <p className="text-sm text-muted font-body mb-10">
        Manually onboard agents and landlords, and verify user identities.
        These actions are admin-only and are logged as trust events.
      </p>

      <section className="mb-12">
        <h2 className="font-display text-lg font-bold text-ink mb-5">
          Onboard agent / landlord
        </h2>
        <OnboardForm />
      </section>

      <hr className="hairline mb-12" />

      <section>
        <h2 className="font-display text-lg font-bold text-ink mb-5">
          Verify identity
        </h2>
        <VerifyIdentityForm />
      </section>
    </div>
  );
}

// ── Onboard form ───────────────────────────────────────────────────────────

function OnboardForm() {
  const [email, setEmail]   = useState("");
  const [role,  setRole]    = useState<"AGENT" | "LANDLORD">("AGENT");
  const [success, setSuccess] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post("/admin/onboard", { email, role }),
    onSuccess: () => {
      setSuccess(`User ${email} has been onboarded as ${role.toLowerCase()}.`);
      setEmail("");
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message ?? "Failed to onboard user.");
      setSuccess(null);
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        if (!email.trim()) { setError("Email is required."); return; }
        mutation.mutate();
      }}
      noValidate
      className="space-y-5"
    >
      {success && <div className="banner-success">{success}</div>}
      {error   && <div className="banner-error">{error}</div>}

      <div>
        <label className="label" htmlFor="onboard-email">Email address</label>
        <input
          id="onboard-email"
          type="email"
          className="input"
          placeholder="agent@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>

      <div>
        <label className="label">Role</label>
        <div className="flex gap-3">
          {(["AGENT", "LANDLORD"] as const).map((r) => (
            <label
              key={r}
              className={`flex items-center gap-2 px-4 py-2.5 border cursor-pointer transition-colors ${
                role === r ? "border-ink bg-[#F8F8F8]" : "border-[#E5E5E5]"
              }`}
            >
              <input
                type="radio"
                name="onboard-role"
                value={r}
                checked={role === r}
                onChange={() => setRole(r)}
                className="shrink-0"
              />
              <span className="text-sm text-ink font-body capitalize">
                {r.toLowerCase()}
              </span>
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={mutation.isPending}
        className="btn-primary flex items-center gap-2"
      >
        <UserCheckIcon size={15} aria-hidden />
        {mutation.isPending ? "Onboarding…" : "Onboard user"}
      </button>
    </form>
  );
}

// ── Verify identity form ───────────────────────────────────────────────────

function VerifyIdentityForm() {
  const [userId, setUserId]   = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/admin/users/${userId}/verify-identity`),
    onSuccess: () => {
      setSuccess(`User ${userId} identity verified. Trust events updated.`);
      setUserId("");
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message ?? "Failed to verify identity.");
      setSuccess(null);
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        if (!userId.trim()) { setError("User ID is required."); return; }
        mutation.mutate();
      }}
      noValidate
      className="space-y-5"
    >
      {success && <div className="banner-success">{success}</div>}
      {error   && <div className="banner-error">{error}</div>}

      <div>
        <label className="label" htmlFor="verify-user-id">User ID</label>
        <input
          id="verify-user-id"
          type="text"
          className="input font-mono text-sm"
          placeholder="abc123..."
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <p className="text-xs text-muted mt-1 font-body">
          Paste the user&apos;s ID from the database or their profile URL.
        </p>
      </div>

      <div className="banner-warning text-sm">
        <span className="font-medium">This is irreversible.</span>{" "}
        Verifying a user&apos;s identity increases their trust score and shows a filled
        verification badge on their listings. Make sure you&apos;ve reviewed their ID documents first.
      </div>

      <button
        type="submit"
        disabled={mutation.isPending}
        className="btn-primary flex items-center gap-2"
      >
        <ShieldCheckIcon size={15} aria-hidden />
        {mutation.isPending ? "Verifying…" : "Mark identity as verified"}
      </button>
    </form>
  );
}
