/**
 * session.ts — In-memory access token management.
 *
 * Access token lives only in memory (never localStorage) so an injected script
 * cannot steal it. On hard refresh the token is gone; a silent /auth/refresh call
 * (httpOnly cookie sent automatically) re-hydrates it before any page renders.
 *
 * The refresh token is a server-set httpOnly cookie — JS never touches it.
 */

let _accessToken: string | null = null;

/** Store a fresh access token (called after login or a successful refresh). */
export function setAccessToken(token: string): void {
  _accessToken = token;
}

/** Read the current in-memory access token. */
export function getAccessToken(): string | null {
  return _accessToken;
}

/** Clear the in-memory token (called on logout or unrecoverable 401). */
export function clearAccessToken(): void {
  _accessToken = null;
}

/** Whether the user appears to have a live session (token in memory). */
export function hasAccessToken(): boolean {
  return _accessToken !== null;
}
