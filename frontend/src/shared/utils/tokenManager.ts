import { env } from '../../config/env';

const AUTH_BASE = `${env.apiUrl.replace(/\/+$/, '')}/auth`;

/**
 * Check whether a JWT is expired (or will expire within `bufferSec` seconds).
 */
export function isTokenExpired(token: string, bufferSec = 30): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload.exp) return true;
    return payload.exp * 1000 < Date.now() + bufferSec * 1000;
  } catch {
    return true;
  }
}

/** In-flight refresh promise so concurrent 401s don't trigger multiple refreshes. */
let refreshPromise: Promise<string | null> | null = null;

/**
 * Attempt to refresh the access token using the stored refresh_token.
 * Returns the new access_token on success, or null on failure.
 * De-duplicates concurrent calls.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = _doRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function _doRefresh(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${AUTH_BASE}/jwt/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      return null;
    }

    const data = await res.json();
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    return data.access_token as string;
  } catch {
    clearTokens();
    return null;
  }
}

export function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

export function redirectToLogin() {
  clearTokens();
  if (window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
}
