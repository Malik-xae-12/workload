/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReactNode } from 'react';

/**
 * Global TypeScript types and interfaces
 */

export interface NavLink {
  name: string;
  href?: string;
}

export interface Feature {
  title: string;
  description: string;
  icon: ReactNode;
  bgColor: string;
  iconColor: string;
}

export interface Step {
  id: number;
  title: string;
  icon: ReactNode;
}

export interface MedallionLayer {
  name: string;
  color: string;
  status?: string;
}
