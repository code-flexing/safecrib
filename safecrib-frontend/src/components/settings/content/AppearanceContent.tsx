"use client";

import { useEffect, useState } from "react";
import { useTheme, type ThemeMode } from "@/components/theme/ThemeProvider";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { SettingsSection, SettingsSectionDivider } from "@/components/settings/SettingsSection";
import { useToast } from "@/components/ui/Toast";

export function AppearanceContent() {
  const { mode, setMode } = useTheme();
  const [saved, setSaved] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (saved) {
      const timer = window.setTimeout(() => setSaved(false), 3000);
      return () => window.clearTimeout(timer);
    }
  }, [saved]);

  const handleModeChange = (next: ThemeMode) => {
    if (next === mode) return;
    setMode(next);
    setSaved(true);
    showToast("Theme updated.");
  };

  const options = [
    { value: "light", label: "Light" },
    { value: "dim", label: "Dim" },
    { value: "dark", label: "Dark" },
  ];

  return (
    <>
      <SettingsSection title="Theme" description="Choose how SafeCrib looks.">
        <div className="space-y-1.5">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleModeChange(option.value as ThemeMode)}
              className={`w-full rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors
                ${mode === option.value
                  ? "border-safecrib-green bg-safecrib-green/10 text-safecrib-green"
                  : "border-black/15 text-black/60 hover:bg-black/[0.03] hover:text-safecrib-black"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSectionDivider hidden />

      <SettingsSection title="System" description="System-level preferences.">
        <SettingsRow
          label="System theme"
          description={mode === "light" ? "Light" : mode === "dim" ? "Dim" : "Dark"}
        />
      </SettingsSection>
    </>
  );
}
