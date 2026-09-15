import { apiClient } from "./client";

export interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  address: string;
  lat: number;
  lng: number;
  status: "AVAILABLE" | "HELD" | "BOOKED" | "UNAVAILABLE" | "FLAGGED";
  availableFrom: string;
  ownerId: string;
  owner: {
    id: string;
    displayName: string | null;
    trustScore: number | null;
    identityVerified: boolean;
  };
  photos: Array<{ id: string; url: string; phash: string }>;
  _count?: { bookings: number };
  createdAt: string;
  updatedAt: string;
}

export interface ListingSearchParams {
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  availableFrom?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  page?: number;
  pageSize?: number;
}

export interface PaginatedListings {
  data: Listing[];
  total: number;
  page: number;
  pageSize: number;
}

export const listingsApi = {
  search: (params: ListingSearchParams = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "") qs.set(k, String(v));
    });
    const query = qs.toString();
    return apiClient.get<PaginatedListings>(`/listings${query ? `?${query}` : ""}`);
  },

  getById: (id: string) => apiClient.get<Listing>(`/listings/${id}`),

  myListings: () => apiClient.get<Listing[]>("/listings/my"),

  create: (data: {
    title: string;
    description: string;
    price: number;
    address: string;
    lat: number;
    lng: number;
    availableFrom: string;
  }) => apiClient.post<Listing>("/listings", data),

  update: (id: string, data: Partial<{
    title: string;
    description: string;
    price: number;
    address: string;
    availableFrom: string;
  }>) => apiClient.patch<Listing>(`/listings/${id}`, data),

  delete: (id: string) => apiClient.delete<void>(`/listings/${id}`),

  uploadPhoto: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("photo", file);
    return apiClient.postFormData<{ id: string; url: string; phash: string; duplicateWarning?: { matchedListingId: string; similarity: number } }>(
      `/listings/${id}/photos`,
      fd,
    );
  },

  adminFlag: (id: string, reason: string) =>
    apiClient.patch<Listing>(`/admin/listings/${id}/flag`, { reason }),
};
