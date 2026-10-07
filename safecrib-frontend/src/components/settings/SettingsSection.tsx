"use client";

import type { ReactNode } from "react";

export function SettingsSection({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`py-6 first:pt-0 ${className}`}>
      <h3 className="text-sm font-semibold text-safecrib-black">{title}</h3>
      {description && <p className="mt-1 text-sm text-black/55">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function SettingsSectionDivider({ hidden = false }: { hidden?: boolean }) {
  if (hidden) return null;
  return <div className="h-px bg-black/10" />;
}
