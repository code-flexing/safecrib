"use client";

import Sidebar from "@/components/layout/Sidebar";
import { RequireAuth } from "@/components/auth/RequireAuth";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RequireAuth>
      <div className="min-h-screen flex">
        <Sidebar />
        <main className="flex-1 ml-[calc(224px+12px)] p-6 min-h-screen">
          <div className="max-w-5xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </RequireAuth>
  );
}
