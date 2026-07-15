/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { apiClient } from '../../../layouts/services/api';
import { endpoints } from '../../../layouts/services/endpoints';
import type { LoginCredentials, RegisterData, TokenPairResponse } from '../types';

/**
 * Authentication service
 */
export const authService = {
  async login(credentials: LoginCredentials): Promise<TokenPairResponse> {
    // Backend /auth/jwt/login expects form-encoded username + password
    return apiClient.postForm(endpoints.auth.login, {
      username: credentials.email,
      password: credentials.password,
    });
  },

  async register(data: RegisterData): Promise<{ id: string; email: string }> {
    return apiClient.postUnauth(endpoints.auth.register, {
      email: data.email,
      password: data.password,
    });
  },

  async logout(): Promise<void> {
    return apiClient.post(endpoints.auth.logout, {});
  },

  async entraIdExchange(idToken: string): Promise<TokenPairResponse> {
    return apiClient.postUnauth(endpoints.auth.entraIdExchange, { id_token: idToken });
  },
};
