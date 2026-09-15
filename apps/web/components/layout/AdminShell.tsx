"use client";

/**
 * AdminShell — authenticated layout for admin pages.
 * Guards against non-ADMIN roles.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth/useAuth";
import {
  FlagIcon,
  UserCheckIcon,
  LayoutDashboardIcon,
  LogOutIcon,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/admin/review-queue", label: "Review queue",  Icon: FlagIcon },
  { href: "/admin/onboarding",   label: "Onboarding",    Icon: UserCheckIcon },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user)                   { router.replace("/auth/login"); return; }
    if (user.role !== "ADMIN")   {
      if (user.role === "STUDENT") router.replace("/student/dashboard");
      else router.replace("/agent/dashboard");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="skeleton h-8 w-32" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Top navbar */}
      <nav className="navbar" aria-label="Admin navigation">
        <Link href="/admin/review-queue" className="font-display text-xl font-bold text-ink tracking-tight">
          SafeCrib
          <span className="ml-2 text-xs font-body font-medium text-muted border border-[#E5E5E5] px-2 py-0.5">
            Admin
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted font-body hidden sm:block">
            {user.displayName ?? user.email}
          </span>
          <button
            onClick={logout}
            className="btn-ghost text-sm py-1.5 px-3 flex items-center gap-1.5"
          >
            <LogOutIcon size={14} aria-hidden />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </nav>

      <div className="flex flex-1 pt-14">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col w-56 border-r border-[#E5E5E5] py-6 shrink-0">
          <nav className="flex flex-col gap-1 px-3">
            {NAV_ITEMS.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                className={`nav-item ${pathname.startsWith(href) ? "active" : ""}`}
              >
                <Icon size={16} aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 pb-20 md:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile tabs */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-paper border-t border-[#E5E5E5] flex"
        aria-label="Mobile navigation"
      >
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-body transition-colors ${
                active ? "text-ink font-medium" : "text-muted"
              }`}
            >
              <Icon size={20} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
