/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Environment configuration
 * Add your environment variables here
 */
export const env = {
  apiUrl: import.meta.env.VITE_API_URL || '',
  isProd: import.meta.env.PROD,
  isDev: import.meta.env.DEV,
} as const;
