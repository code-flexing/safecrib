import type { ReactNode } from "react";
import Link from "next/link";
import { PublicNavbar } from "@/components/layout/PublicNavbar";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <PublicNavbar />
      <main className="flex-1 pt-14">{children}</main>
      <footer className="border-t border-[#E5E5E5] py-10">
        <div className="content-max flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <span className="font-display font-bold text-lg text-ink">SafeCrib</span>
            <p className="text-xs text-muted mt-1 font-body">
              The trust layer for student housing.
            </p>
          </div>
          <nav className="flex flex-wrap gap-6 text-xs text-muted font-body">
            <Link href="/listings" className="hover:text-ink transition-colors">Browse listings</Link>
            <Link href="/auth/register" className="hover:text-ink transition-colors">Sign up</Link>
            <Link href="/auth/login" className="hover:text-ink transition-colors">Sign in</Link>
            <Link href="/terms" className="hover:text-ink transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
