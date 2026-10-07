"use client";
import { useEffect, useState } from "react";
import { getAvatarAccent, toAccentCss } from "@/lib/avatarAccent";
import { useTheme } from "@/components/theme/ThemeProvider";

export function useAvatarAccent(
  userId: string,
  avatarUrl?: string | null,
  version?: string | null
) {
  const [accent, setAccent] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();
  const mode = resolvedTheme === "light" ? "light" : "dark";

  useEffect(() => {
    let cancelled = false;
    setAccent(null);
    if (!avatarUrl) return;
    getAvatarAccent(userId, version ?? avatarUrl, avatarUrl).then((hsl) => {
      if (!cancelled) setAccent(hsl ? toAccentCss(hsl, mode) : null);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, avatarUrl, version, mode]);

  return accent;
}