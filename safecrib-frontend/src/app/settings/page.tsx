"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { AccountSettingsPanel } from "@/components/settings/AccountSettingsPanel";
import { SettingsSignOutButton } from "@/components/settings/SettingsSignOutButton";
import { BackHomeLink } from "@/components/ui/BackHomeLink";
import { VerificationOverview } from "@/components/verification/VerificationOverview";
import { apiFetch, cachedCurrentUser, clearSession, isUnauthorizedError, normalizeAccountStatus, subscribeClientCacheUpdates, unwrapData, type AccountStatus } from "@/lib/api";

type User = {
  email?: string;
  role?: string;
  displayName?: unknown;
  studentProfileStatus?: unknown;
};

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AccountStatus>("not_submitted");

  useEffect(() => {
    if (!localStorage.getItem("safecrib_access_token")) {
      router.replace("/login");
      return;
    }

    let active = true;
    const unsubscribeCache = subscribeClientCacheUpdates(({ path, value }) => {
      if (path !== "/api/v1/users/me" && path !== "/api/v1/auth/me") return;
      const currentUser = unwrapData<User | null>(value);
      if (!currentUser) return;
      setUser(currentUser);
      if (["UNVERIFIED", "STUDENT"].includes(String(currentUser.role ?? "").toUpperCase())) {
        setStatus(normalizeAccountStatus(currentUser.studentProfileStatus));
        void apiFetch<unknown>("/api/v1/student-profiles/status")
          .then(unwrapData<unknown>)
          .then(normalizeAccountStatus)
          .then(setStatus)
          .catch(() => undefined);
      }
    });
    void cachedCurrentUser<User>().then(async (currentUser) => {
      if (!active) return;
      setUser(currentUser);
      const role = String(currentUser.role ?? "").toUpperCase();
      setStatus(normalizeAccountStatus(currentUser.studentProfileStatus));
      if (["UNVERIFIED", "STUDENT"].includes(role)) {
        void apiFetch<unknown>("/api/v1/student-profiles/status")
          .then(unwrapData<unknown>)
          .then(normalizeAccountStatus)
          .then((latestStatus) => { if (active) setStatus(latestStatus); })
          .catch(() => undefined);
      }
    }).catch((loadError: unknown) => {
      if (active && isUnauthorizedError(loadError)) {
        clearSession();
        router.replace("/login?reason=session-expired");
      }
    });
    return () => { active = false; unsubscribeCache(); };
  }, [router]);

  const role = String(user?.role ?? "").toUpperCase();
  const studentMode = ["UNVERIFIED", "STUDENT"].includes(role);
  const accountLabel = studentMode ? status.replaceAll("_", " ") : role ? role.replaceAll("_", " ").toLowerCase() : "Loading...";

  return (
    <main className="min-h-screen bg-[#f7f8f5] pb-24 md:pb-8">
      <DashboardNav onCreatePage={() => router.push("/page/new")} pageStatus="none" canManagePage={["AGENT", "LANDLORD"].includes(role)} />
      <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
        <BackHomeLink />

        <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-safecrib-green">Account settings</p>
            <h1 className="mt-3 font-display text-3xl italic text-safecrib-black sm:text-4xl">Your settings</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-black/60">
              Keep your details current so the SafeCrib community knows who they are connecting with.
            </p>
          </div>

          <aside className="rounded-[14px] border border-black/10 bg-white p-5 shadow-[0_12px_30px_rgba(11,12,14,0.04)] sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/45">Account mode</p>
              <span className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] ${status === "rejected" ? "bg-red-50 text-red-700" : status === "pending" ? "bg-amber-50 text-amber-800" : "bg-[#eaf7f1] text-safecrib-green"}`}>
                {accountLabel}
              </span>
            </div>
            <div className="mt-4 space-y-2 break-words border-t border-black/10 pt-4 text-sm text-black/60">
              <p>
                <span className="text-black/40">Email</span>
                <br />
                {user?.email ?? "Loading..."}
              </p>
              <p>{role === "AGENT" ? "Agent account" : role === "LANDLORD" ? "Landlord account" : role === "ADMIN" ? "Administrator account" : "Student account"}</p>
            </div>
          </aside>
        </div>

        <AccountSettingsPanel />
        <VerificationOverview />

        <SettingsSignOutButton />
      </section>
    </main>
  );
}
