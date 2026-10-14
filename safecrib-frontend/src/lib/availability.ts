"use client";
import type { IconName } from "@/components/ui/Icon";

export type AvailabilityStatus = "AVAILABLE" | "BOOKED" | "RENTED" | "SOLD";

export const AVAILABLE_STATUSES: readonly AvailabilityStatus[] = ["AVAILABLE", "BOOKED", "RENTED", "SOLD"];

export const DEFAULT_AVAILABILITY: AvailabilityStatus = "AVAILABLE";

export const availabilityLabel: Record<AvailabilityStatus, string> = {
  AVAILABLE: "Available",
  BOOKED: "Booked",
  RENTED: "Rented",
  SOLD: "Sold",
};

export const availabilityIcon: Record<AvailabilityStatus, IconName> = {
  AVAILABLE: "check-circle",
  BOOKED: "calendar-plus",
  RENTED: "home",
  SOLD: "shield",
};

export const availabilityBadge: Record<AvailabilityStatus, string> = {
  AVAILABLE: "bg-safecrib-green text-white",
  BOOKED: "bg-amber-100 text-amber-800",
  RENTED: "bg-blue-100 text-blue-800",
  SOLD: "bg-black/10 text-black/65",
};

export const availabilitySubtle: Record<AvailabilityStatus, string> = {
  AVAILABLE: "bg-safecrib-green/10 text-safecrib-green",
  BOOKED: "bg-amber-100 text-amber-800",
  RENTED: "bg-blue-100 text-blue-800",
  SOLD: "bg-black/10 text-black/65",
};

export const availabilityShortDescription: Record<AvailabilityStatus, string> = {
  AVAILABLE: "This home is open and ready for you to secure.",
  BOOKED: "This home has an active booking. Choose another home or message the provider.",
  RENTED: "This home is currently rented. It may become available again later.",
  SOLD: "This home has been sold and is no longer available.",
};

export function isAvailability(value: unknown): value is AvailabilityStatus {
  return typeof value === "string" && (AVAILABLE_STATUSES as readonly string[]).includes(value);
}

export function normalizeAvailability(value: unknown): AvailabilityStatus {
  return isAvailability(value) ? value : DEFAULT_AVAILABILITY;
}

export function canSecure(availability?: AvailabilityStatus | string | null): boolean {
  return availability === "AVAILABLE";
}
