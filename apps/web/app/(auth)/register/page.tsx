"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useAuth } from "@/lib/auth/useAuth";
import { registerSchema, type RegisterFormValues } from "@/lib/validation/schemas";

export default function RegisterPage() {
  const { register: registerUser } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: "STUDENT" },
  });

  const onSubmit = async (data: RegisterFormValues) => {
    try {
      await registerUser(
        data.email,
        data.password,
        data.role,
        data.displayName || undefined,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      setError("root", { message: msg });
    }
  };

  return (
    <div className="animate-fade-slide-up">
      <h1 className="font-display text-display-md text-ink mb-2">Create account</h1>
      <p className="text-muted text-sm mb-8">
        Already have an account?{" "}
        <Link href="/auth/login" className="text-ink underline underline-offset-2 hover:opacity-70 transition-opacity">
          Sign in
        </Link>
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

        <div>
          <label htmlFor="displayName" className="label">Full name</label>
          <input
            id="displayName"
            type="text"
            autoComplete="name"
            className="input"
            placeholder="Jane Doe"
            {...register("displayName")}
          />
          {errors.displayName && (
            <p className="field-error">{errors.displayName.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="role" className="label">I am a</label>
          <select
            id="role"
            className="input cursor-pointer"
            {...register("role")}
          >
            <option value="STUDENT">Student looking for housing</option>
            <option value="AGENT">Agent / Property manager</option>
            <option value="LANDLORD">Landlord</option>
          </select>
          {errors.role && <p className="field-error">{errors.role.message}</p>}
        </div>

        <div>
          <label htmlFor="password" className="label">Password</label>
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

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary w-full justify-center py-3"
        >
          {isSubmitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-8 text-xs text-muted">
        By creating an account you agree to our{" "}
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
