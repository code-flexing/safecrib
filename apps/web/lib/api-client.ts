export type ApiResponse<T> = {
  data: T;
  message?: string;
};

export type ApiError = {
  message: string;
  statusCode: number;
  errors?: Record<string, string[]>;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async refreshAccessToken(): Promise<string | null> {
    // TODO: point at real refresh endpoint
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return null;

    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) return null;

      const data = await response.json();
      if (data.accessToken) {
        localStorage.setItem("safecrib_access_token", data.accessToken);
        if (data.refreshToken) {
          localStorage.setItem("safecrib_refresh_token", data.refreshToken);
        }
        return data.accessToken;
      }
      return null;
    } catch {
      return null;
    }
  }

  private getAccessToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("safecrib_access_token");
  }

  private getRefreshToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("safecrib_refresh_token");
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    let accessToken = this.getAccessToken();

    const makeRequest = async (token: string | null): Promise<Response> => {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      };

      return fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        credentials: "include",
      });
    };

    let response = await makeRequest(accessToken);

    if (response.status === 401 && accessToken) {
      const newToken = await this.refreshAccessToken();
      if (newToken) {
        response = await makeRequest(newToken);
      }
    }

    if (!response.ok) {
      let error: ApiError;
      try {
        error = await response.json();
      } catch {
        error = { message: response.statusText || "Request failed", statusCode: response.status };
      }
      throw new Error(error.message || "An unexpected error occurred");
    }

    if (response.status === 204) {
      return { data: undefined as T };
    }

    return response.json();
  }

  async refreshToken(): Promise<boolean> {
    const ok = await this.refreshAccessToken();
    return ok !== null;
  }

  get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "GET" });
  }

  post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  postFormData<T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> {
    const accessToken = this.getAccessToken();

    const headers: HeadersInit = {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    };

    return fetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers,
      body: formData,
      credentials: "include",
    }).then(async (response) => {
      if (response.status === 401 && accessToken) {
        const newToken = await this.refreshAccessToken();
        if (newToken) {
          return fetch(`${this.baseUrl}${endpoint}`, {
            method: "POST",
            headers: {
              ...(newToken ? { Authorization: `Bearer ${newToken}` } : {}),
            },
            body: formData,
            credentials: "include",
          });
        }
      }

      if (!response.ok) {
        let error: ApiError;
        try {
          error = await response.json();
        } catch {
          error = { message: response.statusText || "Request failed", statusCode: response.status };
        }
        throw new Error(error.message || "An unexpected error occurred");
      }

      if (response.status === 204) {
        return { data: undefined as T };
      }

      return response.json();
    });
  }

  put<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

export const avatarApi = {
  getCurrent: () => apiClient.get<{ avatarUrl: string }>('/avatars/me'),
  uploadFile: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.postFormData<{ avatarUrl: string }>('/avatars/upload', formData);
  },
  uploadFromUrl: (imageUrl: string) => apiClient.post<{ avatarUrl: string }>('/avatars/from-url', { imageUrl }),
  delete: () => apiClient.delete<{ message: string }>('/avatars/me'),
  getHistory: () => apiClient.get<Array<{ id: string; avatarUrl: string; provider: string; createdAt: string }>>('/avatars/history'),
};
