/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Application settings and constants
 */
export const settings = {
  app: {
    name: 'Fabric Accelerator',
    description: 'Automated workspace setup, credential handling, and medallion architecture deployment',
    version: '1.0.0',
  },
  features: {
    enableAuth: true,
    enableDashboard: true,
  },
} as const;
