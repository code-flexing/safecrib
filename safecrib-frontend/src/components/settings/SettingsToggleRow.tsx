"use client";

import { useId } from "react";
import { Icon } from "@/components/ui/Icon";

export function SettingsToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  loading = false,
  icon,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
}) {
  const id = useId();
  const handleToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled || loading) return;
    onChange(event.target.checked);
  };

  return (
    <div
      className={`flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0 ${
        disabled || loading ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {icon && (
          <Icon name={icon as never} className="mt-0.5 h-5 w-5 text-black/40" />
        )}
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="text-sm font-medium text-safecrib-black cursor-pointer">
            {label}
          </label>
          {description && <p className="mt-1 text-sm text-black/55">{description}</p>}
        </div>
      </div>
      <div className="shrink-0 flex items-center h-6">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={handleToggle}
          disabled={disabled || loading}
          className="h-5 w-5 cursor-pointer rounded border-black/15 text-safecrib-green focus:ring-safecrib-green"
        />
      </div>
    </div>
  );
}
