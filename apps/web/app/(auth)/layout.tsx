import type { ReactNode } from "react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Minimal header */}
      <header className="border-b border-[#E5E5E5]">
        <div className="content-max flex items-center h-14">
          <Link href="/" className="font-display text-xl font-bold text-ink tracking-tight">
            SafeCrib
          </Link>
        </div>
      </header>

      {/* Centered form area */}
      <main className="flex-1 flex items-start justify-center pt-16 pb-16 px-4">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="border-t border-[#E5E5E5] py-4">
        <div className="content-max flex items-center gap-6 text-xs text-muted">
          <span>© 2026 SafeCrib</span>
          <Link href="/terms" className="hover:text-ink transition-colors">Terms</Link>
          <Link href="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
        </div>
      </footer>
    </div>
  );
}
