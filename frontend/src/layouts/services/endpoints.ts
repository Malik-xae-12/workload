/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * API endpoint definitions
 */
export const endpoints = {
  auth: {
    login: '/auth/jwt/login',
    logout: '/auth/jwt/logout',
    register: '/auth/register',
    refresh: '/auth/jwt/refresh',
    entraIdExchange: '/auth/entra-id/exchange',
  },
  workspace: {
    list: '/workspaces',
    create: '/workspaces',
    get: (id: string) => `/workspaces/${id}`,
  },
} as const;
