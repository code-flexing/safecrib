"use client";

/**
 * useAuth.ts — Auth context + hook.
 *
 * On app mount: calls apiClient.bootstrap() which hits /auth/refresh with the
 * httpOnly cookie. If a valid session exists, the access token is hydrated into
 * memory and /auth/me fetches the user. This prevents a login flash for
 * already-authenticated users on hard refresh.
 *
 * Token storage:
 *   - Access token: in-memory only (session.ts)
 *   - Refresh token: httpOnly cookie set by the backend — JS never touches it
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api/client";
import { setAccessToken, clearAccessToken } from "@/lib/auth/session";

// ── Types ──────────────────────────────────────────────────────────────────

export type UserRole = "STUDENT" | "AGENT" | "LANDLORD" | "ADMIN";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  displayName?: string | null;
  emailVerified: boolean;
  identityVerified?: boolean;
  trustScore?: number | null;
}

interface AuthContextValue {
  /** Currently authenticated user, or null if not logged in. */
  user: AuthUser | null;
  /** True while the initial session bootstrap is in progress. */
  loading: boolean;
  /** Sign in with email + password. Throws ApiRequestError on failure. */
  login: (email: string, password: string) => Promise<void>;
  /** Register a new account. Redirects to login with ?registered=true. */
  register: (
    email: string,
    password: string,
    role?: "STUDENT" | "AGENT" | "LANDLORD",
    displayName?: string,
  ) => Promise<void>;
  /** Log out, revoke refresh token, clear state. */
  logout: () => Promise<void>;
  /** Force a token refresh + user re-fetch (used sparingly). */
  refreshUser: () => Promise<void>;
}

// ── Context ────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

// ── Provider ───────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const booted = useRef(false);

  /** Fetch the current user profile (access token must already be in memory). */
  const fetchUser = useCallback(async (): Promise<void> => {
    try {
      const res = await apiClient.get<AuthUser>("/users/me");
      setUser(res.data);
    } catch {
      setUser(null);
      clearAccessToken();
    }
  }, []);

  /** On mount: try silent refresh → fetch user. */
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    (async () => {
      try {
        const hasSession = await apiClient.bootstrap();
        if (hasSession) {
          await fetchUser();
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchUser]);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      const res = await apiClient.post<{ accessToken: string }>(
        "/auth/login",
        { email, password },
      );
      // Backend sets httpOnly refresh cookie in the Set-Cookie header.
      setAccessToken(res.data.accessToken);
      await fetchUser();
      // Route based on role
      const role = user?.role;
      if (role === "ADMIN") router.push("/admin/review-queue");
      else if (role === "AGENT" || role === "LANDLORD") router.push("/agent/dashboard");
      else router.push("/student/dashboard");
    },
    [fetchUser, user, router],
  );

  // We need the user role after fetchUser resolves, so re-read the setter
  const loginWithRedirect = useCallback(
    async (email: string, password: string): Promise<void> => {
      const res = await apiClient.post<{ accessToken: string }>(
        "/auth/login",
        { email, password },
      );
      setAccessToken(res.data.accessToken);

      // Fetch user, then redirect based on role
      try {
        const profileRes = await apiClient.get<AuthUser>("/users/me");
        const freshUser = profileRes.data;
        setUser(freshUser);

        if (freshUser.role === "ADMIN") router.push("/admin/review-queue");
        else if (freshUser.role === "AGENT" || freshUser.role === "LANDLORD")
          router.push("/agent/dashboard");
        else router.push("/student/dashboard");
      } catch {
        setUser(null);
        clearAccessToken();
      }
    },
    [router],
  );

  const register = useCallback(
    async (
      email: string,
      password: string,
      role: "STUDENT" | "AGENT" | "LANDLORD" = "STUDENT",
      displayName?: string,
    ): Promise<void> => {
      await apiClient.post("/auth/register", { email, password, role, displayName });
      router.push("/auth/login?registered=true");
    },
    [router],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiClient.post("/auth/logout");
    } catch {
      // Best-effort logout — clear state regardless
    }
    clearAccessToken();
    setUser(null);
    router.push("/");
  }, [router]);

  const refreshUser = useCallback(async (): Promise<void> => {
    const hasSession = await apiClient.bootstrap();
    if (hasSession) await fetchUser();
    else setUser(null);
  }, [fetchUser]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login: loginWithRedirect,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
