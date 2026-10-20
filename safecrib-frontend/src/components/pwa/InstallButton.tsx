"use client";

import { Button } from "@/components/ui/Button";
import { usePWAInstall } from "@/hooks/usePWAInstall";

export function InstallButton({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const { isInstalled, requestInstall } = usePWAInstall();

  if (isInstalled) return null;

  return (
    <Button variant="secondary" onClick={requestInstall} className={`glass-pill glass min-w-[9.5rem] whitespace-nowrap px-4 py-3 text-sm ${tone === "light" ? "text-safecrib-black" : "text-white"} hover:brightness-105`}>
      Install SafeCrib
    </Button>
  );
}
