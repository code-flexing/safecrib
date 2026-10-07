"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { KeyboardEvent } from "react";
import { Icon } from "@/components/ui/Icon";

export type TabKey = "posts" | "replies" | "media" | "reposts";

const ALL_TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "posts", label: "Posts", icon: "message-circle" },
  { key: "replies", label: "Replies", icon: "share-2" },
  { key: "media", label: "Media", icon: "image" },
  { key: "reposts", label: "Reposts", icon: "thumbs-up" },
];

export function useActiveTab(available: TabKey[]): TabKey {
  const sp = useSearchParams();
  const t = sp.get("tab") as TabKey | null;
  return t && available.includes(t) ? t : (available[0] as TabKey);
}

export function ProfileTabs({
  available,
  labelOverride,
  accentColor,
}: {
  available: TabKey[];
  labelOverride?: Partial<Record<TabKey, string>>;
  accentColor?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const active = useActiveTab(available);
  const tabs = ALL_TABS.filter((t) => available.includes(t.key));

  const select = (key: TabKey) => {
    const next = new URLSearchParams(sp.toString());
    next.set("tab", key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const onKeyDown = (e: KeyboardEvent, idx: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const dir = e.key === "ArrowRight" ? 1 : -1;
    select(tabs[(idx + dir + tabs.length) % tabs.length]!.key);
  };

  const activeShadow = accentColor
    ? `0 0 16px ${accentColor}33`
    : "0 0 16px rgba(12,115,85,0.3)";

  return (
    <div
      role="tablist"
      aria-label="Profile sections"
      className="no-scrollbar mt-4 flex gap-2 overflow-x-auto px-4 pb-3"
    >
      {tabs.map((t, idx) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => select(t.key)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? `bg-safecrib-green text-white shadow-[${activeShadow}]`
                : "bg-black/[0.02] text-safecrib-black hover:bg-black/[0.06]"
            }`}
          >
            <Icon name={t.icon} className="h-4 w-4" />
            {labelOverride?.[t.key] ?? t.label}
          </button>
        );
      })}
    </div>
  );
}