/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { env } from '../../config';
import {
  isTokenExpired,
  refreshAccessToken,
  redirectToLogin,
} from '../../shared/utils/tokenManager';

/**
 * Base API client configuration
 * Customize this based on your API needs (axios, fetch, etc.)
 */

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /**
   * Ensure we have a valid (non-expired) access token before making a request.
   * If the current token is expired, attempt a refresh first.
   */
  private async ensureValidToken(): Promise<void> {
    const token = localStorage.getItem('access_token');
    if (!token || isTokenExpired(token)) {
      const newToken = await refreshAccessToken();
      if (!newToken) {
        redirectToLogin();
        throw new Error('Session expired. Please log in again.');
      }
    }
  }

  /**
   * Handle a fetch response — on 401, try refreshing the token and retry once.
   */
  private async handleResponse<T>(
    response: Response,
    retryFn: () => Promise<Response>,
  ): Promise<T> {
    if (response.status === 401) {
      const newToken = await refreshAccessToken();
      if (!newToken) {
        redirectToLogin();
        throw new Error('Session expired. Please log in again.');
      }
      const retryResp = await retryFn();
      if (!retryResp.ok) {
        const body = await retryResp.json().catch(() => ({}));
        throw new Error(body.detail || retryResp.statusText);
      }
      return retryResp.json();
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail || response.statusText);
    }
    return response.json();
  }

  async get<T>(endpoint: string): Promise<T> {
    await this.ensureValidToken();
    const doFetch = () =>
      fetch(`${this.baseUrl}${endpoint}`, {
        headers: { ...this.getAuthHeaders() },
      });
    const response = await doFetch();
    return this.handleResponse<T>(response, doFetch);
  }

  async post<T>(endpoint: string, data: unknown): Promise<T> {
    await this.ensureValidToken();
    const doFetch = () =>
      fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify(data),
      });
    const response = await doFetch();
    return this.handleResponse<T>(response, doFetch);
  }

  /**
   * POST without token validation — used for auth endpoints (login, register, token exchange).
   */
  async postUnauth<T>(endpoint: string, data: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail || response.statusText);
    }
    return response.json();
  }

  async postForm<T>(endpoint: string, data: Record<string, string>): Promise<T> {
    const doFetch = () =>
      fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(data).toString(),
      });
    const response = await doFetch();
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail || response.statusText);
    }
    return response.json();
  }
}

export const apiClient = new ApiClient(env.apiUrl);
