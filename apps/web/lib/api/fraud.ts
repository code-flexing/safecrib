import { apiClient } from "./client";

export type FraudReportType =
  | "FAKE_LISTING"
  | "DOUBLE_BOOKING"
  | "SCAM_PAYMENT"
  | "MISREPRESENTATION"
  | "OTHER";

export type FraudReportStatus = "PENDING" | "REVIEWING" | "RESOLVED" | "DISMISSED";

export interface FraudReport {
  id: string;
  reporterId: string;
  targetUserId: string | null;
  targetListingId: string | null;
  type: FraudReportType;
  description: string;
  status: FraudReportStatus;
  resolution: string | null;
  createdAt: string;
  reporter?: { id: string; displayName: string | null; email: string };
  targetListing?: { id: string; title: string } | null;
  targetUser?: { id: string; displayName: string | null; email: string } | null;
}

export interface DuplicateFlag {
  id: string;
  listingIdA: string;
  listingIdB: string;
  matchType: "PHASH" | "TEXT" | "GEO_PRICE";
  similarity: number;
  status: "PENDING" | "CONFIRMED_DUPLICATE" | "FALSE_POSITIVE";
  listingA: { id: string; title: string; photos: Array<{ url: string }> };
  listingB: { id: string; title: string; photos: Array<{ url: string }> };
  createdAt: string;
}

export const fraudApi = {
  submit: (data: {
    targetListingId?: string;
    targetUserId?: string;
    type: FraudReportType;
    description: string;
    evidenceUrls?: string[];
  }) => apiClient.post<FraudReport>("/fraud/reports", data),

  list: () => apiClient.get<FraudReport[]>("/fraud/reports"),

  pending: () => apiClient.get<FraudReport[]>("/fraud/reports/pending"),

  resolve: (
    id: string,
    data: { status: "RESOLVED" | "DISMISSED"; resolution: string },
  ) => apiClient.patch<FraudReport>(`/fraud/reports/${id}/resolve`, data),

  pendingDuplicates: () =>
    apiClient.get<DuplicateFlag[]>("/fraud/duplicates/pending"),

  resolveDuplicate: (
    id: string,
    data: { status: "CONFIRMED_DUPLICATE" | "FALSE_POSITIVE" },
  ) => apiClient.patch<DuplicateFlag>(`/fraud/duplicates/${id}/resolve`, data),
};
