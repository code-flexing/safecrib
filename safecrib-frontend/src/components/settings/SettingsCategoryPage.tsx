"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { getSettingsCategory } from "@/lib/settings-config";
import { SettingsCategoryIcon } from "@/components/settings/SettingsCategoryIcon";
import { Icon } from "@/components/ui/Icon";

export function SettingsCategoryPage({
  category,
  children,
}: {
  category: ReturnType<typeof getSettingsCategory>;
  children: ReactNode;
}) {
  const router = useRouter();

  const handleBack = () => {
    router.back();
  };

  return (
    <main className="min-h-screen bg-[#f7f8f5]">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
        <div className="mb-6 flex items-center gap-4">
          <button
            type="button"
            onClick={handleBack}
            className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 text-black/50 hover:border-black/20 hover:bg-black/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-safecrib-green"
            aria-label="Go back"
          >
            <Icon name="back" className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => router.push("/settings")}
            className="text-sm font-semibold text-safecrib-green hover:underline"
          >
            Settings
          </button>
        </div>

        {category && (
          <header className="mb-8">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/[0.04]">
                <SettingsCategoryIcon category={category} />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-safecrib-green">
                  Account settings
                </p>
                <h1 className="mt-1 text-2xl font-bold text-safecrib-black sm:text-3xl">
                  {category.label}
                </h1>
              </div>
            </div>
            {category.description && (
              <p className="mt-2 text-sm text-black/55">{category.description}</p>
            )}
          </header>
        )}

        <div className="rounded-[14px] border border-black/10 bg-white shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
          <div className="p-5 sm:p-7">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
