/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Workspace {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
}

export interface DashboardStats {
  totalWorkspaces: number;
  activeWorkspaces: number;
  pendingWorkspaces: number;
}
