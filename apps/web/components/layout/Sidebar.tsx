"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";

const navItems = [
  { href: "/dashboard/listings", label: "Listings", icon: "🏠" },
  { href: "/dashboard/bookings", label: "Bookings", icon: "📅" },
  { href: "/dashboard/trust", label: "Trust Score", icon: "🛡️" },
  { href: "/dashboard/fraud", label: "Report Fraud", icon: "🚩" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout, loading } = useAuth();

  return (
    <aside className="glass-sidebar fixed left-3 top-3 bottom-3 w-56 z-50 flex flex-col rounded-2xl">
      <div className="p-4 pb-2">
        <Link href="/dashboard/listings" className="flex items-center gap-2.5 px-2 py-1.5 group">
          <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-white/80 text-sm font-bold tracking-tight group-hover:bg-white/[0.1] transition-all duration-200">
            🏠
          </div>
          <span className="text-white font-semibold text-sm tracking-tight">SafeCrib</span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}>
              <div className={`nav-item ${isActive ? "active" : ""}`}>
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 pt-2">
        <div className="px-2 py-2">
          <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        </div>
        {user && (
          <div className="px-3 py-2">
            <p className="text-white/40 text-xs truncate">{user.email}</p>
            <p className="text-white/30 text-xs mt-0.5">{user.role}</p>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full mx-2"
          onClick={() => logout()}
          disabled={loading}
        >
          Sign out
        </Button>
      </div>
    </aside>
  );
}
