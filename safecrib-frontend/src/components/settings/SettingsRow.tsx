"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

export function SettingsRow({
  label,
  description,
  children,
  icon,
}: {
  label: string;
  description?: string;
  children?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {icon && <Icon name={icon as never} className="mt-0.5 h-5 w-5 text-black/40" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-safecrib-black">{label}</p>
          {description && <p className="mt-1 text-sm text-black/55">{description}</p>}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
