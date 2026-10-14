"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import {
  apiFetch,
  clearClientCache,
  getCachedApi,
  seedListingDetailCache,
  unwrapData,
  ApiError,
} from "@/lib/api";
import {
  type AvailabilityStatus,
  AVAILABLE_STATUSES,
  availabilityIcon,
  availabilityLabel,
  availabilityShortDescription,
} from "@/lib/availability";

export function AvailabilityQuickChange({
  open,
  onClose,
  listingId,
  current,
  onChanged,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  listingId: string;
  current: AvailabilityStatus;
  onChanged?: (next: AvailabilityStatus) => void;
  onError?: (message: string) => void;
}) {
  const [value, setValue] = useState<AvailabilityStatus>(current);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setValue(current);
  }, [open, current]);

  const save = async () => {
    if (value === current) { onClose(); return; }
    setSubmitting(true);
    try {
      const response = await apiFetch<Record<string, unknown>>(
        `/api/v1/listings/${encodeURIComponent(listingId)}/availability`,
        { method: "PATCH", body: JSON.stringify({ availability: value }) },
      );
      const updated = unwrapData<Record<string, unknown>>(response);
      const cached = getCachedApi<Record<string, unknown>>(`/api/v1/listings/${encodeURIComponent(listingId)}`);
      seedListingDetailCache(cached ? { ...cached, ...updated } : updated);
      clearClientCache("/api/v1/listings");
      onChanged?.(value);
      onClose();
    } catch (error) {
      onError?.(error instanceof ApiError ? error.message : "We could not update availability. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} titleId="availability-change-title">
      <h2 id="availability-change-title" className="text-xl font-medium text-safecrib-black">Change availability</h2>
      <p className="mt-3 text-sm leading-6 text-black/60">
        {availabilityShortDescription[current]} Pick the status that matches the home right now.
      </p>
      <fieldset className="mt-4 space-y-2" role="radiogroup" aria-label="Availability status">
        {AVAILABLE_STATUSES.map((status) => {
          const selected = value === status;
          return (
            <label
              key={status}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm font-medium cursor-pointer transition ${selected ? "border-safecrib-green bg-safecrib-green/5 text-safecrib-black" : "border-black/10 text-black/65 hover:bg-black/[0.03]"}`}
            >
              <input
                type="radio"
                name="availability"
                className="h-4 w-4 accent-safecrib-green"
                checked={selected}
                onChange={() => setValue(status)}
                aria-label={availabilityLabel[status]}
              />
              <Icon name={availabilityIcon[status]} className="h-4 w-4" />
              <span>{availabilityLabel[status]}</span>
            </label>
          );
        })}
      </fieldset>
      <div className="mt-6 flex gap-3">
        <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button type="button" loading={submitting} disabled={submitting || value === current} onClick={() => void save()}>Save</Button>
      </div>
    </Modal>
  );
}
