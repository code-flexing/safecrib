"use client";

import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { authApi } from "@/lib/api/auth";
import {
  resetPasswordSchema,
  type ResetPasswordFormValues,
} from "@/lib/validation/schemas";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token");
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
  });

  if (!token) {
    return (
      <div className="animate-fade-slide-up">
        <h1 className="font-display text-display-md text-ink mb-4">Invalid link</h1>
        <p className="text-muted text-sm mb-8">
          This reset link is missing a token. Please use the link from your
          email, or request a new one.
        </p>
        <Link href="/auth/forgot-password" className="btn-secondary inline-flex">
          Request new link
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="animate-fade-slide-up">
        <h1 className="font-display text-display-md text-ink mb-4">Password updated</h1>
        <p className="text-muted text-sm mb-8">
          Your password has been changed. Sign in with your new password.
        </p>
        <Link href="/auth/login" className="btn-primary inline-flex">
          Sign in
        </Link>
      </div>
    );
  }

  const onSubmit = async (data: ResetPasswordFormValues) => {
    try {
      await authApi.resetPassword(token, data.password);
      setSuccess(true);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Reset failed. The link may have expired.";
      setError("root", { message: msg });
    }
  };

  return (
    <div className="animate-fade-slide-up">
      <h1 className="font-display text-display-md text-ink mb-2">New password</h1>
      <p className="text-muted text-sm mb-8">
        Choose a strong password — at least 8 characters.
      </p>

      {errors.root && (
        <div className="banner-error mb-6">{errors.root.message}</div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <div>
          <label htmlFor="password" className="label">New password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className="input"
            placeholder="At least 8 characters"
            {...register("password")}
          />
          {errors.password && (
            <p className="field-error">{errors.password.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="confirmPassword" className="label">Confirm password</label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            className="input"
            placeholder="Repeat your new password"
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="field-error">{errors.confirmPassword.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary w-full justify-center py-3"
        >
          {isSubmitting ? "Saving…" : "Set new password"}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}
