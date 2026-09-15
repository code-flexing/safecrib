"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/useAuth";

/**
 * PublicNavbar — minimal editorial nav for public-facing pages.
 * Fixed at the top, hairline border, no backdrop blur (matches flat editorial direction).
 */
export function PublicNavbar() {
  const { user, loading } = useAuth();

  const dashboardHref =
    user?.role === "ADMIN"
      ? "/admin/review-queue"
      : user?.role === "AGENT" || user?.role === "LANDLORD"
      ? "/agent/dashboard"
      : "/student/dashboard";

  return (
    <nav className="navbar" aria-label="Main navigation">
      {/* Brand */}
      <Link href="/" className="font-display text-xl font-bold text-ink tracking-tight">
        SafeCrib
      </Link>

      {/* Centre links */}
      <div className="hidden md:flex items-center gap-8">
        <Link href="/listings" className="nav-link">Browse</Link>
      </div>

      {/* Right CTAs */}
      <div className="flex items-center gap-3">
        {loading ? (
          <div className="skeleton h-8 w-24" />
        ) : user ? (
          <Link href={dashboardHref} className="btn-primary text-sm py-2 px-4">
            Dashboard
          </Link>
        ) : (
          <>
            <Link href="/auth/login" className="btn-ghost text-sm py-2 px-3">
              Sign in
            </Link>
            <Link href="/auth/register" className="btn-primary text-sm py-2 px-4">
              Get started
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
