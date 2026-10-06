"use client";

import { usePathname } from "next/navigation";

export default function AppLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const shouldPadDesktopSidebar = [
    "/dashboard",
    "/connect",
    "/notifications",
    "/settings",
    "/support",
    "/profile",
    "/page",
  ].some((route) => pathname === route || pathname.startsWith(`${route}/`));

  return <div className={shouldPadDesktopSidebar ? "md:pl-72" : ""}>{children}</div>;
}
