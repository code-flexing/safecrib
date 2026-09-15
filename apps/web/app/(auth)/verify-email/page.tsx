"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { apiClient } from "@/lib/api-client";

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleVerify = async () => {
    if (!token) {
      setError("Missing verification token");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiClient.post("/auth/verify-email", { token });
      setSuccess(true);
      setTimeout(() => router.push("/auth/login"), 3000);
    } catch (err: any) {
      setError(err.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-md text-center"
    >
      <div className="mb-8">
        <div className="relative w-20 h-20 mx-auto mb-6">
          <div className="absolute inset-0 rounded-2xl bg-white/10 blur-2xl" />
          <div className="relative w-20 h-20 rounded-2xl bg-white/[0.06] border border-white/10 backdrop-blur-xl flex items-center justify-center overflow-hidden shadow-[0_1px_0_0_rgba(255,255,255,0.1)_inset]">
            <img
              src="/logo.png"
              alt="SafeCrib"
              className="object-contain w-16 h-16"
              priority
            />
          </div>
        </div>

        <h1 className="text-2xl font-semibold text-white tracking-tight mb-2">
          Verify your email
        </h1>
        <p className="text-white/40 text-sm leading-relaxed">
          We sent a verification link to your email. Click below to verify your
          account.
        </p>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
        >
          {error}
        </motion.div>
      )}

      {success ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm"
        >
          Email verified! Redirecting to login…
        </motion.div>
      ) : (
        <button
          onClick={handleVerify}
          disabled={loading || !token}
          className="btn-primary justify-center mx-auto"
        >
          {loading ? "Verifying…" : "Verify email"}
        </button>
      )}

      <div className="mt-6 text-center">
        <Link
          href="/auth/resend-verification"
          className="text-sm text-white/60 hover:text-white transition-colors underline"
        >
          Didn&apos;t receive the email? Resend
        </Link>
      </div>
    </motion.div>
  );
}
