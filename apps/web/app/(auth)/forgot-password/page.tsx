"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { apiClient } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiClient.post("/auth/forgot-password", { email });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
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
          Reset your password
        </h1>
        <p className="text-white/40 text-sm leading-relaxed">
          Enter your email and we&apos;ll send you a reset link.
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

      {submitted ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm"
        >
          If an account with that email exists, a reset link has been sent.
          Check your inbox (and spam folder).
        </motion.div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-white/70 mb-2"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="glass-input w-full px-4 py-2.5 text-base text-white placeholder-white/20"
              placeholder="you@university.edu"
              required
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary justify-center"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}

      <div className="mt-6">
        <Link
          href="/auth/login"
          className="text-sm text-white/60 hover:text-white transition-colors underline"
        >
          Back to sign in
        </Link>
      </div>
    </motion.div>
  );
}
