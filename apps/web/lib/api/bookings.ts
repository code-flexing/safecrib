import { apiClient } from "./client";

export type BookingStatus =
  | "HELD"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "DISPUTED";

export interface Booking {
  id: string;
  listingId: string;
  studentId: string;
  status: BookingStatus;
  depositAmount: number;
  holdExpiresAt: string | null;
  moveInDate: string | null;
  listing: {
    id: string;
    title: string;
    address: string;
    price: number;
    photos: Array<{ url: string }>;
    owner: { id: string; displayName: string | null; trustScore: number | null };
  };
  createdAt: string;
  updatedAt: string;
}

export const bookingsApi = {
  create: (listingId: string, moveInDate: string) =>
    apiClient.post<Booking>("/bookings", { listingId, moveInDate }),

  list: () => apiClient.get<Booking[]>("/bookings"),

  getById: (id: string) => apiClient.get<Booking>(`/bookings/${id}`),

  confirm: (id: string) =>
    apiClient.patch<Booking>(`/bookings/${id}/confirm`),

  cancel: (id: string) =>
    apiClient.patch<Booking>(`/bookings/${id}/cancel`),

  complete: (id: string) =>
    apiClient.patch<Booking>(`/bookings/${id}/complete`),

  dispute: (id: string, reason: string) =>
    apiClient.patch<Booking>(`/bookings/${id}/dispute`, { reason }),
};
