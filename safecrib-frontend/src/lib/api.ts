export type AccountStatus = "approved" | "pending" | "rejected" | "not_submitted";
export type PageStatus = "none" | "pending" | "approved" | "rejected";

export class ApiError extends Error {
  status: number;
  method: string;
  path: string;
  responseMessage: string;

  constructor(status: number, message: string, method = "GET", path = "") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.method = method;
    this.path = path;
    this.responseMessage = message;
  }
}

export function isUnauthorizedError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401;
}

export type AuthUser = { email?: string; role?: string; displayName?: unknown };

function tokenSubject(token: string | null) {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const encoded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const claims = JSON.parse(atob(padded)) as Record<string, unknown>;
    return typeof claims.sub === "string" ? claims.sub : null;
  } catch {
    return null;
  }
}

export function setSessionTokens(tokens: { accessToken: string; refreshToken: string }) {
  if (typeof window === "undefined") return;
  const previousToken = localStorage.getItem("safecrib_access_token");
  const previousSubject = tokenSubject(previousToken);
  const nextSubject = tokenSubject(tokens.accessToken);
  if (previousToken !== tokens.accessToken && (!previousSubject || !nextSubject || previousSubject !== nextSubject)) {
    clearClientCache();
    clearResolvedMediaUrlCache();
  }
  localStorage.setItem("safecrib_access_token", tokens.accessToken);
  localStorage.setItem("safecrib_refresh_token", tokens.refreshToken);
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("safecrib_access_token");
  localStorage.removeItem("safecrib_refresh_token");
  clearResolvedMediaUrlCache();
  clearClientCache();
}

function expireSession() {
  clearSession();
  if (typeof window === "undefined") return;
  const loginPath = window.location.pathname.startsWith("/admin") ? "/admin/login" : "/login";
  if (window.location.pathname !== loginPath) window.location.replace(loginPath);
}

export async function refreshSession() {
  const refreshToken = typeof window === "undefined" ? null : localStorage.getItem("safecrib_refresh_token");
  if (!refreshToken) throw new ApiError(401, "Session expired.");
  const response = await requestApi<unknown>("/api/v1/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
  const tokens = extractTokens(response);
  if (!tokens) throw new ApiError(401, "Session refresh failed.");
  localStorage.setItem("safecrib_access_token", tokens.accessToken);
  localStorage.setItem("safecrib_refresh_token", tokens.refreshToken);
}

export async function authenticatedFetch<T>(path: string, init: RequestInit = {}) {
  return apiFetch<T>(path, init);
}

export async function adminFetch<T>(path: string, init: RequestInit = {}) {
  return authenticatedFetch<T>(path, init);
}

export async function verifyAdminSession() {
  const user = unwrapData<AuthUser>(await adminFetch<unknown>("/api/v1/auth/me", { method: "POST" }));
  if (String(user.role ?? "").toUpperCase() !== "ADMIN") throw new ApiError(403, "Administrator access required.");
  return user;
}

export async function logoutSession() {
  const refreshToken = typeof window === "undefined" ? null : localStorage.getItem("safecrib_refresh_token");
  try {
    if (refreshToken) await apiFetch("/api/v1/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) });
  } finally {
    clearSession();
  }
}

export async function getCurrentUser<T>() {
  try {
    return unwrapData<T>(await apiFetch<unknown>("/api/v1/users/me"));
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 404 || error.status === 405)) {
      try {
        return unwrapData<T>(await apiFetch<unknown>("/api/v1/auth/me", { method: "POST" }));
      } catch (fallbackError) {
        if (!(fallbackError instanceof ApiError) || fallbackError.status !== 401) throw fallbackError;
        const refreshToken = typeof window === "undefined" ? null : localStorage.getItem("safecrib_refresh_token");
        if (!refreshToken) throw fallbackError;

        const refreshed = await apiFetch<unknown>("/api/v1/auth/refresh", {
          method: "POST",
          body: JSON.stringify({ refreshToken }),
        });
        const tokens = extractTokens(refreshed);
        if (!tokens) throw fallbackError;
        localStorage.setItem("safecrib_access_token", tokens.accessToken);
        localStorage.setItem("safecrib_refresh_token", tokens.refreshToken);
        return unwrapData<T>(await apiFetch<unknown>("/api/v1/users/me"));
      }
    }
    throw error;
  }
}

const clientCachePrefix = "safecrib_cache:";
const clientCacheTtlMs = 60_000;
const clientCacheUpdatedEvent = "safecrib:cache-updated";

export type ClientCacheUpdate = { path: string; value: unknown };

export function subscribeClientCacheUpdates(listener: (update: ClientCacheUpdate) => void) {
  if (typeof window === "undefined") return () => undefined;
  const handleUpdate = (event: Event) => {
    const detail = (event as CustomEvent<ClientCacheUpdate>).detail;
    if (detail && typeof detail.path === "string") listener(detail);
  };
  const handleStorage = (event: StorageEvent) => {
    if (!event.key?.startsWith(clientCachePrefix) || event.key.endsWith(":updatedAt")) return;
    let value: unknown = null;
    try {
      value = event.newValue === null ? null : JSON.parse(event.newValue) as unknown;
    } catch {
      value = null;
    }
    listener({ path: event.key.slice(clientCachePrefix.length), value });
  };
  window.addEventListener(clientCacheUpdatedEvent, handleUpdate);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(clientCacheUpdatedEvent, handleUpdate);
    window.removeEventListener("storage", handleStorage);
  };
}

function notifyClientCacheUpdated(path: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ClientCacheUpdate>(clientCacheUpdatedEvent, { detail: { path, value } }));
}

function cacheKey(path: string) {
  return `${clientCachePrefix}${path}`;
}

function cacheUpdatedAtKey(path: string) {
  return `${cacheKey(path)}:updatedAt`;
}

function isClientCacheFresh(path: string) {
  if (typeof window === "undefined") return false;
  const updatedAt = Number(localStorage.getItem(cacheUpdatedAtKey(path)));
  return Number.isFinite(updatedAt) && Date.now() - updatedAt < clientCacheTtlMs;
}

function readClientCache<T>(path: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const value = localStorage.getItem(cacheKey(path));
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
}

export function getCachedCurrentUser<T>() {
  return readClientCache<T>("/api/v1/users/me") ?? readClientCache<T>("/api/v1/auth/me");
}

function writeClientCache(path: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(cacheKey(path), JSON.stringify(value));
    localStorage.setItem(cacheUpdatedAtKey(path), String(Date.now()));
    notifyClientCacheUpdated(path, value);
  } catch { /* Storage may be unavailable or full. */ }
}

export function clearClientCache(...paths: string[]) {
  if (typeof window === "undefined") return;
  if (paths.length === 0) {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(clientCachePrefix)) localStorage.removeItem(key);
    }
    return;
  }
  paths.forEach((path) => {
    localStorage.removeItem(cacheKey(path));
    localStorage.removeItem(cacheUpdatedAtKey(path));
  });
}

export function primeCurrentUserCache(user: unknown) {
  writeClientCache("/api/v1/users/me", user);
  writeClientCache("/api/v1/auth/me", user);
}

const persistedVerificationPrefix = "safecrib_verification:";

export function getPersistedVerification<T>(userId?: string) {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const value = localStorage.getItem(`${persistedVerificationPrefix}${encodeURIComponent(userId)}`);
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
}

export function setPersistedVerification(userId: string | undefined, value: unknown) {
  if (typeof window === "undefined" || !userId) return;
  try {
    localStorage.setItem(`${persistedVerificationPrefix}${encodeURIComponent(userId)}`, JSON.stringify(value));
  } catch { /* Storage may be unavailable or full. */ }
}

const pendingUploadPrefix = "safecrib_pending_upload:";

export function clearPendingUploads() {
  if (typeof window === "undefined") return;
  (["AVATAR", "COVER_PHOTO", "PROOF_OF_LICENSE", "PROOF_OF_STUDENTSHIP"] as const).forEach((purpose) => {
    localStorage.removeItem(`${pendingUploadPrefix}${purpose}`);
  });
}

export function getPendingUpload(purpose: UploadPurpose) {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(`${pendingUploadPrefix}${purpose}`);
  if (!stored) return null;
  try {
    const draft = JSON.parse(stored) as { id?: string };
    return draft.id ?? null;
  } catch {
    return stored;
  }
}

export async function cachedApiFetch<T>(path: string, init: RequestInit = {}) {
  const cacheable = !init.method || init.method === "GET";
  const cached = cacheable ? readClientCache<T>(path) : null;
  if (cached !== null && isClientCacheFresh(path)) return cached;
  const request = apiFetch<T>(path, init).then((value) => {
    if (cacheable) writeClientCache(path, value);
    return value;
  });
  if (cached !== null) {
    void request.catch(() => undefined);
    return cached;
  }
  return request;
}

export async function refreshCachedApi<T>(path: string, init: RequestInit = {}) {
  const value = await apiFetch<T>(path, init);
  if (!init.method || init.method === "GET") writeClientCache(path, value);
  return value;
}

export async function cachedCurrentUser<T>() {
  const cached = getCachedCurrentUser<T>();
  if (
    cached !== null &&
    (isClientCacheFresh("/api/v1/users/me") || isClientCacheFresh("/api/v1/auth/me"))
  ) {
    return cached;
  }
  const request = getCurrentUser<T>().then((value) => {
    primeCurrentUserCache(value);
    return value;
  });
  if (cached !== null) {
    void request.catch(() => undefined);
    return cached;
  }
  return request;
}

function extractTokens(value: unknown): { accessToken: string; refreshToken: string } | null {
  if (typeof value !== "object" || value === null) return null;
  const response = value as Record<string, unknown>;
  const nested = typeof response.data === "object" && response.data !== null ? response.data as Record<string, unknown> : null;
  const accessToken = response.accessToken ?? response.access_token ?? nested?.accessToken ?? nested?.access_token;
  const refreshToken = response.refreshToken ?? response.refresh_token ?? nested?.refreshToken ?? nested?.refresh_token;
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") return null;
  return {
    accessToken: accessToken.replace(/^Bearer\s+/i, "").trim(),
    refreshToken: refreshToken.replace(/^Bearer\s+/i, "").trim(),
  };
}

export function displayName(value: unknown, depth = 0): string {
  if (depth > 6) return "";
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const itemName = displayName(item, depth + 1);
      if (itemName) return itemName;
    }
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    for (const key of ["displayName", "display_name", "fullName", "full_name", "name", "username", "user_name", "preferred_username", "nickname"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
      if (typeof candidate === "object" && candidate !== null) {
        const nestedName = displayName(candidate, depth + 1);
        if (nestedName) return nestedName;
      }
    }
    const firstName = [record.firstName, record.first_name, record.givenName, record.given_name, record.first].find((name) => typeof name === "string") as string | undefined;
    const lastName = [record.lastName, record.last_name, record.familyName, record.family_name, record.last, record.surname].find((name) => typeof name === "string") as string | undefined;
    if (firstName?.trim() || lastName?.trim()) return `${firstName?.trim() ?? ""} ${lastName?.trim() ?? ""}`.trim();
    for (const [key, candidate] of Object.entries(record)) {
      if (typeof candidate !== "object" || candidate === null || key === "photos" || key === "images") continue;
      const nestedName = displayName(candidate, depth + 1);
      if (nestedName) return nestedName;
    }
  }
  return "";
}

export function getAuthenticatedDisplayName() {
  if (typeof window === "undefined") return "";
  try {
    const token = localStorage.getItem("safecrib_access_token");
    const payloadSegment = token?.split(".")[1];
    if (!payloadSegment) return "";
    const encoded = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    return displayName(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
  } catch {
    return "";
  }
}

export function unwrapData<T>(value: unknown): T {
  if (typeof value === "object" && value !== null && "data" in value) {
    return (value as { data: T }).data;
  }
  return value as T;
}

let refreshPromise: Promise<void> | null = null;

async function requestApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const token = typeof window === "undefined" ? null : localStorage.getItem("safecrib_access_token");
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response = await fetch(`/api/backend${path}`, { ...init, headers });
  if ((method === "GET" || method === "HEAD") && response.status >= 500 && response.status < 600) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    response = await fetch(`/api/backend${path}`, { ...init, headers });
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const payloadRecord = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : null;
    const responseMessage = payloadRecord?.message;
    const responseError = Array.isArray(responseMessage)
      ? responseMessage.filter((item): item is string => typeof item === "string").join(" ")
      : typeof responseMessage === "string"
        ? responseMessage
        : typeof payloadRecord?.error === "string"
          ? payloadRecord.error
          : `Request failed (${response.status})`;
    const message = `${method} ${path}: ${responseError}`;
    throw new ApiError(response.status, message, method, path);
  }
  return payload as T;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await requestApi<T>(path, init);
  } catch (error) {
    if (!isUnauthorizedError(error) || typeof window === "undefined" || path === "/api/v1/auth/refresh") throw error;
    const refreshToken = localStorage.getItem("safecrib_refresh_token");
    if (!refreshToken) {
      expireSession();
      throw error;
    }

    try {
      refreshPromise ??= refreshSession().finally(() => { refreshPromise = null; });
      await refreshPromise;
      return await requestApi<T>(path, init);
    } catch (refreshError) {
      expireSession();
      throw refreshError;
    }
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function objectFieldPaths(value: unknown, prefix = "", depth = 0): string[] {
  if (depth > 3) return [];
  const paths: string[] = [];
  for (const [key, nested] of Object.entries(recordValue(value))) {
    const path = prefix ? `${prefix}.${key}` : key;
    paths.push(path);
    if (paths.length >= 30) break;
    paths.push(...objectFieldPaths(nested, path, depth + 1).slice(0, 30 - paths.length));
    if (paths.length >= 30) break;
  }
  return paths;
}

export type UploadPurpose = "AVATAR" | "COVER_PHOTO" | "LISTING_PHOTO" | "LISTING_VIDEO" | "PROVIDER_LOGO" | "STUDENT_ID" | "PROOF_OF_STUDENTSHIP" | "PROOF_OF_LICENSE" | "CONTRACT_DOCUMENT";

export type PendingUpload = {
  id: string;
  purpose?: UploadPurpose | string;
  status?: string;
  createdAt?: string;
};

export async function getPendingUploads() {
  const response = unwrapData<unknown>(await apiFetch<unknown>("/api/v1/media/pending"));
  if (Array.isArray(response)) return response as PendingUpload[];
  const record = recordValue(response);
  const items = record.pending ?? record.uploads ?? record.data;
  return Array.isArray(items) ? items as PendingUpload[] : [];
}

export async function cancelPendingUpload(id: string) {
  await apiFetch(`/api/v1/media/pending/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (typeof window !== "undefined") {
    (["AVATAR", "COVER_PHOTO", "PROOF_OF_LICENSE", "PROOF_OF_STUDENTSHIP"] as const).forEach((purpose) => {
      const key = `${pendingUploadPrefix}${purpose}`;
      const stored = localStorage.getItem(key);
      if (stored?.includes(id)) localStorage.removeItem(key);
    });
  }
}

export async function uploadDocument(file: File, purpose: UploadPurpose, entityId?: string) {
  const body = new FormData();
  body.append("file", file);
  body.append("purpose", purpose);
  if (entityId) body.append("entityId", entityId);

  const response = unwrapData<{ media?: { id?: string }; url?: string }>(await apiFetch<unknown>("/api/v1/media/upload", {
    method: "POST",
    body,
  }));
  if (typeof response.media?.id !== "string" || !response.media.id) {
    throw new Error(`The ${purpose.toLowerCase().replaceAll("_", " ")} upload did not return a media reference.`);
  }
  return response.media.id;
}

export type ListingMediaPurpose = "LISTING_PHOTO" | "LISTING_VIDEO";

export type CloudinaryCompletionPayload = {
  asset_id: string;
  public_id: string;
  resource_type: string;
  version: number;
  signature: string;
};

export type MediaUploadProgress = (progress: { stage: "uploading" | "processing"; percent: number }) => void;

export async function completeMediaUpload(mediaId: string, payload: CloudinaryCompletionPayload) {
  const response = unwrapData<unknown>(await apiFetch<unknown>(`/api/v1/media/${encodeURIComponent(mediaId)}/complete`, {
    method: "POST",
    body: JSON.stringify(payload),
  }));
  const responseRecord = recordValue(response);
  const media = recordValue(responseRecord.media ?? responseRecord);
  const status = String(media.status ?? "").toUpperCase();
  if (media.id !== mediaId || status !== "READY") {
    throw new Error("SafeCrib did not confirm the uploaded media as ready.");
  }
  return status;
}

export async function uploadSignedMedia(
  file: File,
  purpose: UploadPurpose,
  entityId?: string,
  onUploadProgress?: MediaUploadProgress,
) {
  let signatureResponse: unknown = await apiFetch<unknown>("/api/v1/media/upload-signature", {
    method: "POST",
    body: JSON.stringify({ purpose, contentType: file.type, sizeBytes: file.size, ...(entityId ? { entityId } : {}) }),
  });
  for (let depth = 0; depth < 3; depth += 1) {
    const wrapper = recordValue(signatureResponse);
    const nested = wrapper.data ?? wrapper.result;
    if (nested === undefined) break;
    signatureResponse = nested;
  }

  const responseRecord = recordValue(signatureResponse);
  const signature = recordValue(responseRecord.uploadSignature ?? responseRecord.upload_signature ?? responseRecord);
  const upload = recordValue(signature.upload ?? signature.cloudinary ?? signature.cloudinaryUpload ?? signature.cloudinary_upload);
  const uploadPayload = recordValue(
    signature.uploadPayload ?? signature.upload_payload ?? signature.payload ?? signature.fields ?? signature.params ??
    upload.uploadPayload ?? upload.upload_payload ?? upload.payload ?? upload.fields ?? upload.params,
  );
  const media = recordValue(signature.media ?? upload.media);
  const cloudName = uploadPayload.cloud_name ?? uploadPayload.cloudName ?? upload.cloud_name ?? upload.cloudName;
  const rawResourceType = media.resourceType ?? media.resource_type ?? signature.resourceType ?? signature.resource_type ?? upload.resourceType ?? upload.resource_type;
  const resourceType = typeof rawResourceType === "string" ? rawResourceType.toLowerCase() : "";
  const derivedUploadUrl = typeof cloudName === "string" && /^[a-zA-Z0-9_-]+$/.test(cloudName) &&
    ["image", "video", "raw", "auto"].includes(resourceType)
    ? `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/upload`
    : undefined;
  const uploadUrl = signature.uploadUrl ?? signature.upload_url ?? signature.url ??
    upload.uploadUrl ?? upload.upload_url ?? upload.url ?? derivedUploadUrl;
  const mediaId = signature.mediaId ?? signature.media_id ?? signature.id ?? media.id ?? media.mediaId ?? media.media_id ?? upload.mediaId ?? upload.media_id;

  if (typeof uploadUrl !== "string" || typeof mediaId !== "string" || Object.keys(uploadPayload).length === 0) {
    const missing = [
      ...(typeof uploadUrl === "string" ? [] : ["uploadUrl"]),
      ...(typeof mediaId === "string" ? [] : ["media.id or mediaId"]),
      ...(Object.keys(uploadPayload).length ? [] : ["uploadPayload"]),
    ];
    const fields = objectFieldPaths(signatureResponse);
    const fieldDetails = fields.length ? ` Available response fields: ${fields.join(", ")}.` : "";
    throw new Error(`The media service response is missing ${missing.join(", ")}.${fieldDetails} Please retry or contact support.`);
  }

  const body = new FormData();
  body.append("file", file);
  Object.entries(uploadPayload).forEach(([key, value]) => {
    if (key !== "uploadUrl" && key !== "url" && value !== null && value !== undefined) {
      body.append(key, String(value));
    }
  });

  const uploadResult = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", uploadUrl);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onUploadProgress?.({ stage: "uploading", percent: Math.min(100, Math.round((event.loaded / event.total) * 100)) });
      }
    });
    request.addEventListener("load", () => {
      let result: unknown;
      try {
        result = request.responseText ? JSON.parse(request.responseText) as unknown : null;
      } catch {
        reject(new Error("Cloudinary returned an unreadable upload response."));
        return;
      }
      if (request.status < 200 || request.status >= 300) {
        const response = recordValue(result);
        const error = recordValue(response.error);
        const message = typeof error.message === "string"
          ? error.message
          : "The file could not be uploaded. Please retry.";
        reject(new ApiError(request.status, message));
        return;
      }
      onUploadProgress?.({ stage: "processing", percent: 100 });
      resolve(recordValue(result));
    });
    request.addEventListener("error", () => reject(new Error("The file upload could not reach Cloudinary. Check your connection and retry.")));
    request.addEventListener("abort", () => reject(new Error("The file upload was canceled.")));
    request.send(body);
  });
  const secureUrl = uploadResult.secure_url;
  const completionValues = {
    asset_id: uploadResult.asset_id,
    public_id: uploadResult.public_id,
    resource_type: uploadResult.resource_type,
    version: uploadResult.version,
    signature: uploadResult.signature,
  };
  const completionPayload = typeof completionValues.asset_id === "string" &&
    typeof completionValues.public_id === "string" &&
    typeof completionValues.resource_type === "string" &&
    typeof completionValues.version === "number" &&
    typeof completionValues.signature === "string"
    ? completionValues as CloudinaryCompletionPayload
    : undefined;
  const signedPublicId = uploadPayload.public_id;
  const multipartPublicId = body.get("public_id");
  const signedResourceType = media.resourceType ?? media.resource_type;
  const multipartPublicIdMatches = typeof signedPublicId === "string" && typeof multipartPublicId === "string" && multipartPublicId === signedPublicId;
  const publicIdMatches = typeof signedPublicId === "string" && signedPublicId === completionValues.public_id;
  const resourceTypeMatches = typeof signedResourceType === "string" && signedResourceType.toLowerCase() === String(completionValues.resource_type ?? "").toLowerCase();
  const identityMismatch = !multipartPublicIdMatches || (typeof signedPublicId === "string" && !publicIdMatches) ||
    (typeof signedResourceType === "string" && !resourceTypeMatches);
  const identityCheckDetails = [
    `multipart public_id ${multipartPublicIdMatches ? "matches signed value" : "is missing or differs from signed value"}`,
    typeof signedPublicId === "string" ? `Cloudinary public_id ${publicIdMatches ? "matches signed value" : "differs from signed value"}` : "signed public_id unavailable",
    typeof signedResourceType === "string" ? `resource_type ${resourceTypeMatches ? "matches" : "differs"}` : "signed resource_type unavailable",
  ].join(", ");
  let status = String(signature.status ?? media.status ?? "PENDING").toUpperCase();
  let completionError: string | undefined;
  if (completionPayload) {
    try {
      status = await completeMediaUpload(mediaId, completionPayload);
    } catch (error) {
      if (
        error instanceof ApiError
        && error.status >= 400
        && error.status < 500
        && error.status !== 408
        && error.status !== 429
      ) {
        const reason = error instanceof Error ? error.message : "SafeCrib rejected the upload completion request.";
        throw new Error(`${reason} Client comparison: ${identityCheckDetails}.`);
      }
      status = "PENDING";
      const reason = error instanceof Error ? error.message : "SafeCrib could not confirm the uploaded media.";
      completionError = `${reason}${identityMismatch ? ` Client comparison: ${identityCheckDetails}.` : ""}`;
    }
  } else if (purpose !== "LISTING_VIDEO") {
    const missingFields = Object.entries(completionValues).filter(([, value]) => value === undefined || value === null || value === "").map(([key]) => key);
    completionError = `Cloudinary response is missing required completion fields: ${missingFields.join(", ") || "field types are invalid"}.`;
  }

  return {
    mediaId,
    status,
    previewUrl: purpose === "AVATAR" && typeof secureUrl === "string" && secureUrl.startsWith("https://") ? secureUrl : undefined,
    completionPayload: status === "READY" ? undefined : completionPayload,
    completionError,
    expectedPublicId: typeof signedPublicId === "string" ? signedPublicId : undefined,
    expectedResourceType: typeof signedResourceType === "string" ? signedResourceType.toLowerCase() : undefined,
  };
}

export async function uploadListingMedia(
  file: File,
  purpose: ListingMediaPurpose,
  listingId: string,
  onUploadProgress?: MediaUploadProgress,
) {
  return uploadSignedMedia(file, purpose, listingId, onUploadProgress);
}

export async function waitForMediaReady(
  mediaId: string,
  options: { completionPayload?: CloudinaryCompletionPayload; videoUpload?: boolean } = {},
) {
  let statusEndpointAvailable = true;
  let completionError: string | undefined;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (
      options.completionPayload
      && (attempt === 0 || attempt % 4 === 0)
    ) {
      try {
        await completeMediaUpload(mediaId, options.completionPayload);
        return;
      } catch (error) {
        const retryable = error instanceof TypeError
          || (error instanceof ApiError
            && (error.status === 408 || error.status === 429 || error.status >= 500));
        if (!retryable) throw error;
        completionError = error instanceof Error ? error.message : "SafeCrib could not confirm the uploaded media.";
      }
    }

    if (statusEndpointAvailable) {
      let response: unknown;
      try {
        response = unwrapData<unknown>(
          await apiFetch<unknown>(`/api/v1/media/${encodeURIComponent(mediaId)}/status`, { cache: "no-store" }),
        );
      } catch (error) {
        const endpointMissing = error instanceof ApiError
          && error.status === 404
          && (error.responseMessage === "Request failed (404)" || error.responseMessage.startsWith("Cannot GET "));
        if (!endpointMissing) throw error;
        statusEndpointAvailable = false;
        console.warn("This media API does not expose per-upload status yet; checking the pending-upload list and media access instead.");
      }

      if (statusEndpointAvailable) {
        const media = recordValue(response);
        const status = String(media.status ?? "").toUpperCase();
        if (status === "READY") return;
        if (status === "FAILED") {
          const reason = typeof media.failureReason === "string" && media.failureReason.trim()
            ? `: ${media.failureReason}`
            : "";
          throw new Error(`The media upload failed${reason}`);
        }
        if (status === "DELETED" || status === "DELETING") {
          throw new Error("The uploaded media is no longer available. Upload it again.");
        }
        if (status !== "PENDING") {
          throw new Error("The media service returned an unrecognized upload status.");
        }
      } else {
        const pending = unwrapData<unknown[]>(
          await apiFetch<unknown>("/api/v1/media/pending", { cache: "no-store" }),
        );
        if (!Array.isArray(pending)) {
          throw new Error("The media service returned an invalid pending-upload list.");
        }
        const isPending = pending.some((item) => recordValue(item).id === mediaId);
        if (!isPending) {
          try {
            await apiFetch<unknown>(`/api/v1/media/${encodeURIComponent(mediaId)}/access`, { cache: "no-store" });
            return;
          } catch (error) {
            if (!(error instanceof ApiError) || error.status !== 404) throw error;
          }
        }
      }
    }
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
  if (!statusEndpointAvailable) {
    throw new Error("Media processing is still pending. The current API lacks an upload-status route, so deploy the updated backend or try again shortly.");
  }
  if (completionError) {
    throw new Error(`The upload is still pending. SafeCrib could not confirm it: ${completionError}`);
  }
  throw new Error(options.videoUpload
    ? "SafeCrib has not yet verified this video with Cloudinary. Your draft is saved; refresh media shortly and do not upload the same file again."
    : "Media processing is taking longer than expected. Your draft is saved; refresh media before trying again.");
}

const resolvedMediaUrlPrefix = "safecrib_media_url:";
const resolvedMediaUrlTtlMs = 30 * 24 * 60 * 60 * 1000;
const resolvedMediaUrlLimit = 200;
const resolvedMediaUrls = new Map<string, { url: string; expiresAt?: number }>();
const mediaUrlRequests = new Map<string, Promise<string | null>>();

export function withMediaCacheBust(url: string, cacheBurst = Date.now()): string {
  if (!url || /^(https?:|data:|blob:)/.test(url) === false) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}safecrib_force_load=${cacheBurst}`;
}

function mediaUrlCacheKey(reference: string, transformation?: string) {
  return `${reference}::${transformation ?? "default"}`;
}

function mediaUrlStorageKey(reference: string, transformation?: string) {
  return `${resolvedMediaUrlPrefix}${encodeURIComponent(reference)}${transformation ? `:${encodeURIComponent(transformation)}` : ":default"}`;
}

export function getCachedMediaUrl(reference: unknown, transformation?: string) {
  if (typeof reference !== "string" || !reference.trim()) return null;
  const mediaReference = reference.trim();
  if (/^(https?:|data:|blob:)/.test(mediaReference)) return mediaReference;
  return readResolvedMediaUrl(mediaReference, transformation);
}

function clearResolvedMediaUrlCache() {
  resolvedMediaUrls.clear();
  mediaUrlRequests.clear();
  if (typeof window === "undefined") return;
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(resolvedMediaUrlPrefix)) localStorage.removeItem(key);
  }
}

function readResolvedMediaUrl(reference: string, transformation?: string) {
  const cacheKey = mediaUrlCacheKey(reference, transformation);
  const inMemory = resolvedMediaUrls.get(cacheKey);
  if (inMemory && (!inMemory.expiresAt || inMemory.expiresAt > Date.now() + 30_000)) return inMemory.url;
  if (inMemory) resolvedMediaUrls.delete(cacheKey);
  if (typeof window === "undefined") return null;
  try {
    const storageKey = mediaUrlStorageKey(reference, transformation);
    const stored = localStorage.getItem(storageKey);
    if (!stored) return null;
    const value = JSON.parse(stored) as { url?: unknown; expiresAt?: unknown; cachedAt?: unknown };
    const expiresAt = typeof value.expiresAt === "number" ? value.expiresAt : undefined;
    const isOld = typeof value.cachedAt !== "number" || Date.now() - value.cachedAt > resolvedMediaUrlTtlMs;
    if (typeof value.url !== "string" || isOld || (expiresAt !== undefined && expiresAt <= Date.now() + 30_000)) {
      localStorage.removeItem(storageKey);
      return null;
    }
    resolvedMediaUrls.set(cacheKey, { url: value.url, expiresAt });
    return value.url;
  } catch {
    return null;
  }
}

export async function resolveMediaUrl(reference: unknown, transformation?: string): Promise<string | null> {
  if (typeof reference !== "string" || !reference.trim()) return null;
  const mediaReference = reference.trim();
  if (/^(https?:|data:|blob:)/.test(mediaReference)) return mediaReference;

  const cachedUrl = readResolvedMediaUrl(mediaReference, transformation);
  if (cachedUrl) return cachedUrl;
  const requestKey = mediaUrlCacheKey(mediaReference, transformation);
  const existingRequest = mediaUrlRequests.get(requestKey);
  if (existingRequest) return existingRequest;

  const accessPath = transformation
    ? `/api/v1/media/${encodeURIComponent(mediaReference)}/access?transformation=${encodeURIComponent(transformation)}`
    : `/api/v1/media/${encodeURIComponent(mediaReference)}/access`;

  const request = apiFetch<unknown>(accessPath, { cache: "no-store" })
    .then((response) => {
      const mediaData = unwrapData<unknown>(response);
      const mediaResponse = typeof mediaData === "object" && mediaData !== null
        ? mediaData as Record<string, unknown>
        : null;
      const url = typeof mediaData === "string"
        ? mediaData
        : mediaResponse && ["url", "accessUrl", "deliveryUrl"]
          .map((key) => mediaResponse[key])
          .find((value): value is string => typeof value === "string");
      if (!url) return null;

      const freshUrl = withMediaCacheBust(url);
      const expiresAtValue = mediaResponse?.expiresAt;
      const expiresAt = typeof expiresAtValue === "number"
        ? expiresAtValue < 1_000_000_000_000 ? expiresAtValue * 1000 : expiresAtValue
        : undefined;
      const cacheEntry = { url: freshUrl, expiresAt };
      resolvedMediaUrls.set(requestKey, cacheEntry);
      if (typeof window !== "undefined") {
        try {
          const storageKey = mediaUrlStorageKey(mediaReference, transformation);
          localStorage.setItem(storageKey, JSON.stringify({ ...cacheEntry, cachedAt: Date.now() }));
          const entries = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
            .filter((key): key is string => Boolean(key?.startsWith(resolvedMediaUrlPrefix)))
            .map((key) => {
              try {
                const entry = JSON.parse(localStorage.getItem(key) ?? "null") as { cachedAt?: unknown } | null;
                return { key, cachedAt: typeof entry?.cachedAt === "number" ? entry.cachedAt : 0 };
              } catch {
                return { key, cachedAt: 0 };
              }
            })
            .sort((a, b) => a.cachedAt - b.cachedAt);
          while (entries.length > resolvedMediaUrlLimit) {
            const oldest = entries.shift();
            if (oldest) localStorage.removeItem(oldest.key);
          }
        } catch { /* Storage may be unavailable or full. */ }
      }
      return freshUrl;
    })
    .catch(() => null)
    .finally(() => {
      if (mediaUrlRequests.get(requestKey) === request) mediaUrlRequests.delete(requestKey);
    });
  mediaUrlRequests.set(requestKey, request);
  return request;
}

export async function resolveAdminMediaUrl(reference: unknown): Promise<{ url: string | null; error: string | null }> {
  const mediaReference = typeof reference === "string"
    ? reference
    : typeof reference === "object" && reference !== null
      ? ["url", "accessUrl", "deliveryUrl", "id", "mediaId"]
        .map((key) => (reference as Record<string, unknown>)[key])
        .find((value): value is string => typeof value === "string" && Boolean(value))
      : undefined;
  if (!mediaReference) {
    return { url: null, error: "No media reference was submitted." };
  }
  if (/^(https?:|data:|blob:)/.test(mediaReference)) return { url: mediaReference, error: null };
  try {
    const response = unwrapData<unknown>(await adminFetch<unknown>(`/api/v1/media/${encodeURIComponent(mediaReference)}/access`));
    if (typeof response === "string") return { url: response, error: null };
    if (typeof response === "object" && response !== null) {
      const mediaResponse = response as Record<string, unknown>;
      for (const key of ["url", "accessUrl", "deliveryUrl"]) {
        if (typeof mediaResponse[key] === "string") {
          return { url: mediaResponse[key] as string, error: null };
        }
      }
    }
    return { url: null, error: "The media service returned no delivery URL." };
  } catch (error) {
    return {
      url: null,
      error: error instanceof Error ? error.message : "Media could not be opened.",
    };
  }
}

export function normalizeAccountStatus(value: unknown): AccountStatus {
  const resolveStatus = (candidate: unknown): string | null => {
    if (typeof candidate === "string") return candidate.trim();
    if (typeof candidate === "object" && candidate !== null) {
      const record = candidate as Record<string, unknown>;
      const direct = [record.status, record.state, record.profileStatus, record.value].find((entry) => typeof entry === "string");
      if (typeof direct === "string") return direct.trim();
      const profile = record.profile;
      if (typeof profile === "object" && profile !== null) {
        const nested = [((profile as Record<string, unknown>).status), ((profile as Record<string, unknown>).state), ((profile as Record<string, unknown>).profileStatus), ((profile as Record<string, unknown>).value)].find((entry) => typeof entry === "string");
        if (typeof nested === "string") return nested.trim();
      }
    }
    return null;
  };

  const rawStatus = resolveStatus(value);
  const status = rawStatus ? rawStatus.toLowerCase().replace(/[_\s-]+/g, "_") : "not_submitted";
  if (["approved", "verified", "active", "accepted"].includes(status)) return "approved";
  if (["pending", "submitted", "review_pending", "under_review", "in_review", "awaiting_review", "waiting_for_review", "submitted_for_review"].includes(status)) return "pending";
  if (["rejected", "declined", "denied", "not_approved", "failed_review"].includes(status)) return "rejected";
  return "not_submitted";
}

export async function fetchPublicListings<T = unknown>(params: Record<string, string | number | boolean> = {}): Promise<T> {
  const searchParams = new URLSearchParams();
  // The backend does not expose a /listings/public endpoint.
  // The standard GET /api/v1/listings endpoint requires authentication and
  // filters by status=VERIFIED by default. When unauthenticated this will
  // return a 401; the home page handles that gracefully by showing an empty feed.
  // Remove the "status" param that the caller passes — the backend already
  // filters to VERIFIED listings in its searchListings handler.
  Object.entries(params).forEach(([key, value]) => {
    if (key !== "status") searchParams.set(key, String(value));
  });
  const path = `/api/v1/listings${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  return apiFetch<T>(path);
}

export function normalizePageStatus(value: unknown): PageStatus {
  const status = typeof value === "string" ? value.toLowerCase() : "none";
  if (["approved", "verified"].includes(status)) return "approved";
  if (["pending", "submitted", "under_review"].includes(status)) return "pending";
  if (status === "rejected") return "rejected";
  return "none";
}