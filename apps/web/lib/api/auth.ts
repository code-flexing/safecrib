import { apiClient } from "./client";
import type { AuthUser } from "@/lib/auth/useAuth";

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<{ accessToken: string }>("/auth/login", { email, password }),

  register: (data: {
    email: string;
    password: string;
    role: "STUDENT" | "AGENT" | "LANDLORD";
    displayName?: string;
  }) => apiClient.post<void>("/auth/register", data),

  logout: () => apiClient.post<void>("/auth/logout"),

  verifyEmail: (token: string) =>
    apiClient.post<void>("/auth/verify-email", { token }),

  resendVerification: (email: string) =>
    apiClient.post<void>("/auth/resend-verification", { email }),

  forgotPassword: (email: string) =>
    apiClient.post<void>("/auth/forgot-password", { email }),

  resetPassword: (token: string, newPassword: string) =>
    apiClient.post<void>("/auth/reset-password", { token, newPassword }),

  me: () => apiClient.get<AuthUser>("/users/me"),
};
