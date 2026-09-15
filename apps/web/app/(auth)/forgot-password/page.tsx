"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { authApi } from "@/lib/api/auth";
import {
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
} from "@/lib/validation/schemas";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormValues) => {
    try {
      await authApi.forgotPassword(data.email);
      setSubmittedEmail(data.email);
      setSent(true);
    } catch (err: unknown) {
      // Don't reveal whether the email exists — generic message
      const msg =
        err instanceof Error ? err.message : "Something went wrong. Try again.";
      setError("root", { message: msg });
    }
  };

  if (sent) {
    return (
      <div className="animate-fade-slide-up">
        <h1 className="font-display text-display-md text-ink mb-4">Check your inbox</h1>
        <p className="text-sm text-muted mb-8">
          If <span className="text-ink font-medium">{submittedEmail}</span> is
          registered, a password reset link has been sent. It expires in 1 hour.
        </p>
        <p className="text-sm text-muted">
          Didn&apos;t receive it?{" "}
          <button
            onClick={() => setSent(false)}
            className="text-ink underline underline-offset-2 hover:opacity-70 transition-opacity"
          >
            Try again
          </button>{" "}
          or check your spam folder.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-slide-up">
      <h1 className="font-display text-display-md text-ink mb-2">Reset password</h1>
      <p className="text-muted text-sm mb-8">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      {errors.root && (
        <div className="banner-error mb-6">{errors.root.message}</div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="input"
            placeholder="you@university.edu"
            {...register("email")}
          />
          {errors.email && <p className="field-error">{errors.email.message}</p>}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary w-full justify-center py-3"
        >
          {isSubmitting ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-6 text-sm">
        <Link
          href="/auth/login"
          className="text-muted hover:text-ink transition-colors"
        >
          ← Back to sign in
        </Link>
      </p>
    </div>
  );
}
