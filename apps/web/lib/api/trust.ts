import { apiClient } from "./client";

export interface TrustScore {
  userId: string;
  score: number;
  completedBookings: number;
  unresolvedDisputes: number;
  identityVerified: boolean;
  emailVerified: boolean;
  memberSince: string;
}

export interface TrustBreakdownEvent {
  id: string;
  eventType: string;
  weight: number;
  occurredAt: string;
  payload?: Record<string, unknown>;
}

export interface TrustBreakdown {
  score: TrustScore;
  events: TrustBreakdownEvent[];
}

export const trustApi = {
  getScore: (userId: string) =>
    apiClient.get<TrustScore>(`/trust/users/${userId}`),

  getBreakdown: (userId: string) =>
    apiClient.get<TrustBreakdown>(`/trust/users/${userId}/breakdown`),

  myScore: () => apiClient.get<TrustScore>("/trust/me"),
};
