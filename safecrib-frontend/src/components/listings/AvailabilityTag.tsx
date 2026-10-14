"use client";

import { Icon } from "@/components/ui/Icon";
import type { AvailabilityStatus } from "@/lib/availability";
import { availabilityBadge, availabilityIcon, availabilityLabel, normalizeAvailability } from "@/lib/availability";

type Props = {
  availability?: AvailabilityStatus | string | null;
  label?: boolean;
  onClick?: () => void;
  className?: string;
};

export function AvailabilityTag({ availability, label = true, onClick, className = "" }: Props) {
  const status = normalizeAvailability(availability);
  const interactive = typeof onClick === "function" ? "cursor-pointer opacity-100 hover:opacity-80 transition-opacity" : "cursor-default";
  return (
    <span
      aria-label={`Availability: ${availabilityLabel[status]}`}
      onClick={onClick}
      className={`inline-flex items-center gap-0.5 rounded-full font-semibold ${availabilityBadge[status]} px-2 py-0.5 text-[10px] leading-none ${interactive} ${className}`}
    >
      <Icon name={availabilityIcon[status]} className="h-3 w-3" />
      {label ? <span>{availabilityLabel[status]}</span> : null}
    </span>
  );
}
