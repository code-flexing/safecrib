/**
 * client.ts — Centralised fetch wrapper for the SafeCrib API.
 *
 * - Attaches the in-memory access token as a Bearer header on every request.
 * - On 401: attempts ONE silent refresh (httpOnly cookie sent automatically),
 *   updates the in-memory token, and retries the original request.
 * - If the refresh fails, clears the token and redirects to /auth/login.
 * - Never reads localStorage. Never touches document.cookie directly.
 */

import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
} from "@/lib/auth/session";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

// ── Types ──────────────────────────────────────────────────────────────────

export type ApiResponse<T> = {
  data: T;
  message?: string;
};

export type ApiError = {
  message: string;
  statusCode: number;
  errors?: Record<string, string[]>;
};

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

// ── Core request helper ────────────────────────────────────────────────────

let _isRefreshing = false;
let _refreshQueue: Array<(token: string | null) => void> = [];

/**
 * Silently exchange the httpOnly refresh cookie for a new access token.
 * Returns the new access token, or null if the session is gone.
 */
async function silentRefresh(): Promise<string | null> {
  if (_isRefreshing) {
    // Another request already triggered a refresh — queue until it resolves.
    return new Promise((resolve) => {
      _refreshQueue.push(resolve);
    });
  }

  _isRefreshing = true;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include", // sends httpOnly refresh cookie
    });

    if (!response.ok) {
      clearAccessToken();
      _refreshQueue.forEach((cb) => cb(null));
      return null;
    }

    const body = await response.json();
    const newToken: string = body.accessToken ?? body.data?.accessToken;

    if (newToken) {
      setAccessToken(newToken);
      _refreshQueue.forEach((cb) => cb(newToken));
      return newToken;
    }

    clearAccessToken();
    _refreshQueue.forEach((cb) => cb(null));
    return null;
  } catch {
    clearAccessToken();
    _refreshQueue.forEach((cb) => cb(null));
    return null;
  } finally {
    _isRefreshing = false;
    _refreshQueue = [];
  }
}

function buildHeaders(
  token: string | null,
  extra?: HeadersInit,
): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extra as Record<string, string> | undefined),
  };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function parseError(response: Response): Promise<ApiRequestError> {
  try {
    const body: ApiError = await response.json();
    return new ApiRequestError(
      body.message ?? response.statusText,
      response.status,
      body.errors,
    );
  } catch {
    return new ApiRequestError(response.statusText || "Request failed", response.status);
  }
}

// ── Public API client ──────────────────────────────────────────────────────

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  _retry = true,
): Promise<ApiResponse<T>> {
  const token = getAccessToken();

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: buildHeaders(token, options.headers),
    credentials: "include",
  });

  // Silent refresh on 401
  if (response.status === 401 && _retry) {
    const newToken = await silentRefresh();

    if (!newToken) {
      // Session gone — redirect to login in the browser
      if (typeof window !== "undefined") {
        window.location.href = "/auth/login";
      }
      throw new ApiRequestError("Session expired", 401);
    }

    // Retry once with the new token
    return request<T>(endpoint, options, false);
  }

  if (response.status === 204) {
    return { data: undefined as T };
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  return response.json() as Promise<ApiResponse<T>>;
}

// ── Multipart helper (photo upload) ───────────────────────────────────────

async function requestFormData<T>(
  endpoint: string,
  formData: FormData,
  _retry = true,
): Promise<ApiResponse<T>> {
  const token = getAccessToken();

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // Do NOT set Content-Type — browser sets it with the boundary for multipart.

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers,
    body: formData,
    credentials: "include",
  });

  if (response.status === 401 && _retry) {
    const newToken = await silentRefresh();
    if (!newToken) {
      if (typeof window !== "undefined") window.location.href = "/auth/login";
      throw new ApiRequestError("Session expired", 401);
    }
    return requestFormData<T>(endpoint, formData, false);
  }

  if (response.status === 204) return { data: undefined as T };
  if (!response.ok) throw await parseError(response);

  return response.json() as Promise<ApiResponse<T>>;
}

// ── Exported client ────────────────────────────────────────────────────────

export const apiClient = {
  /**
   * Attempt a silent refresh on app boot. Returns true if a valid session
   * was found; false if the user needs to log in.
   */
  async bootstrap(): Promise<boolean> {
    const token = await silentRefresh();
    return token !== null;
  },

  get<T>(endpoint: string, options?: RequestInit) {
    return request<T>(endpoint, { ...options, method: "GET" });
  },

  post<T>(endpoint: string, body?: unknown, options?: RequestInit) {
    return request<T>(endpoint, {
      ...options,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  patch<T>(endpoint: string, body?: unknown, options?: RequestInit) {
    return request<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  put<T>(endpoint: string, body?: unknown, options?: RequestInit) {
    return request<T>(endpoint, {
      ...options,
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  delete<T>(endpoint: string, options?: RequestInit) {
    return request<T>(endpoint, { ...options, method: "DELETE" });
  },

  postFormData<T>(endpoint: string, formData: FormData) {
    return requestFormData<T>(endpoint, formData);
  },
};
