"use client";

import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";
import { loginSchema, type LoginFormValues } from "@/lib/validation/schemas";

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams?.get("registered") === "true";
  const verified = searchParams?.get("verified") === "true";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    try {
      await login(data.email, data.password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid credentials";
      setError("root", { message: msg });
    }
  };

  return (
    <div className="animate-fade-slide-up">
      <h1 className="font-display text-display-md text-ink mb-2">Sign in</h1>
      <p className="text-muted text-sm mb-8">
        New to SafeCrib?{" "}
        <Link href="/auth/register" className="text-ink underline underline-offset-2 hover:opacity-70 transition-opacity">
          Create an account
        </Link>
      </p>

      {registered && (
        <div className="banner-success mb-6">
          Account created — check your email to verify before signing in.
        </div>
      )}

      {verified && (
        <div className="banner-success mb-6">
          Email verified. You can now sign in.
        </div>
      )}

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

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="label mb-0">Password</label>
            <Link
              href="/auth/forgot-password"
              className="text-xs text-muted hover:text-ink transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="input"
            placeholder="••••••••"
            {...register("password")}
          />
          {errors.password && <p className="field-error">{errors.password.message}</p>}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary w-full justify-center py-3"
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-8 text-xs text-muted">
        By signing in you agree to our{" "}
        <Link href="/terms" className="text-ink underline underline-offset-2 hover:opacity-70 transition-opacity">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-ink underline underline-offset-2 hover:opacity-70 transition-opacity">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
