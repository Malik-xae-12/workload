/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Route definitions for the application
 */
export const routes = {
  home: '/',
  dashboard: '/dashboard',
  auth: {
    login: '/login',
    register: '/register',
    logout: '/logout',
  },
} as const;
