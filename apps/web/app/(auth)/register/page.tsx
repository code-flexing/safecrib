"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import Image from "next/image";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"STUDENT" | "AGENT" | "LANDLORD">("STUDENT");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (password.length < 8) {
        setError("Password must be at least 8 characters");
        return;
      }
      await register(email, password, displayName || undefined);
    } catch (err: any) {
      setError(err.message || "Registration failed");
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
            <Image
              src="/logo.png"
              alt="SafeCrib"
              width={64}
              height={64}
              className="object-contain"
              priority
            />
          </div>
        </div>

        <h1 className="text-2xl font-semibold text-white tracking-tight mb-2">
          Create your SafeCrib account
        </h1>
        <p className="text-white/40 text-sm leading-relaxed">
          Join thousands of students finding trusted housing.
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
            htmlFor="displayName"
            className="block text-sm font-medium text-white/70 mb-2"
          >
            Full name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="glass-input w-full px-4 py-2.5 text-base text-white placeholder-white/20"
            placeholder="Jane Doe"
            disabled={loading}
          />
        </div>

        <div>
          <label
            htmlFor="role"
            className="block text-sm font-medium text-white/70 mb-2"
          >
            I am a
          </label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="glass-input w-full px-4 py-2.5 text-base text-white bg-transparent cursor-pointer"
            disabled={loading}
          >
            <option value="STUDENT">Student looking for housing</option>
            <option value="AGENT">Agent / Property manager</option>
            <option value="LANDLORD">Landlord</option>
          </select>
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
            placeholder="At least 8 characters"
            required
            minLength={8}
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full btn-primary justify-center"
        >
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <div className="mt-6 text-center text-sm">
        <span className="text-white/25">
          Already have an account?{" "}
        </span>
        <Link
          href="/auth/login"
          className="text-white/60 hover:text-white transition-colors underline"
        >
          Sign in
        </Link>
      </div>

      <p className="mt-8 text-white/25 text-xs text-center">
        By creating an account, you agree to our{" "}
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
