"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiClient } from "@/lib/api-client";
import { useRouter } from "next/navigation";

export type UserRole = "STUDENT" | "AGENT" | "LANDLORD" | "ADMIN";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  displayName?: string | null;
  emailVerified: boolean;
  trustScore?: number | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const setAuthCookie = (token: string | null) => {
    if (typeof document !== "undefined") {
      document.cookie = token
        ? `safecrib_access_token=${token}; path=/; max-age=900`
        : "safecrib_access_token=; path=/; max-age=0";
    }
  };

  const fetchCurrentUser = async () => {
    try {
      const res = await apiClient.get<AuthUser>("/auth/me");
      setUser(res.data);
      setAuthCookie(localStorage.getItem("safecrib_access_token") ?? null);
    } catch {
      setUser(null);
      setAuthCookie(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshAccessToken = async (): Promise<boolean> => {
    const ok = await apiClient.refreshToken();
    if (ok) {
      await fetchCurrentUser();
      return true;
    }
    return false;
  };

  const login = async (email: string, password: string) => {
    const res = await apiClient.post<{ accessToken: string; refreshToken: string }>(
      "/auth/login",
      { email, password },
    );
    localStorage.setItem("safecrib_access_token", res.data.accessToken);
    localStorage.setItem("safecrib_refresh_token", res.data.refreshToken);
    setAuthCookie(res.data.accessToken);
    await fetchCurrentUser();
    router.push("/dashboard");
  };

  const register = async (email: string, password: string, displayName?: string) => {
    await apiClient.post("/auth/register", { email, password, displayName });
    router.push("/auth/login?registered=true");
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem("safecrib_refresh_token");
    if (refreshToken) {
      try {
        await apiClient.post("/auth/logout", { refreshToken });
      } catch {}
    }
    localStorage.removeItem("safecrib_access_token");
    localStorage.removeItem("safecrib_refresh_token");
    setAuthCookie(null);
    setUser(null);
    router.push("/");
  };

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refreshAccessToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}
