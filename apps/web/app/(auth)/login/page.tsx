"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registered = router?.searchParams?.get?.("registered") === "true";
  const [showSuccess, setShowSuccess] = useState(!!registered || false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-md"
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
          Welcome to SafeCrib
        </h1>
        <p className="text-white/40 text-sm leading-relaxed">
          Find trusted student housing. No scams, no double-bookings, no surprises.
        </p>
      </div>

      {showSuccess && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm"
        >
          Account created. Please check your email to verify before logging in.
        </motion.div>
      )}

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
        >
          {error}
        </motion.div>
      )}

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

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-white/70 mb-2"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="glass-input w-full px-4 py-2.5 text-base text-white placeholder-white/20"
            placeholder="••••••••"
            required
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full btn-primary justify-center"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link
          href="/auth/forgot-password"
          className="text-white/60 hover:text-white transition-colors"
        >
          Forgot password?
        </Link>
        <Link
          href="/auth/register"
          className="text-white/60 hover:text-white transition-colors"
        >
          Don&apos;t have an account? Sign up
        </Link>
      </div>

      <p className="mt-8 text-white/25 text-xs text-center">
        By signing in, you agree to our{" "}
        <Link href="/terms" className="underline text-white/60 hover:text-white">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline text-white/60 hover:text-white">
          Privacy Policy
        </Link>
        .
      </p>
    </motion.div>
  );
}
