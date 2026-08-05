/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SetupStep {
  id: number;
  title: string;
  path: string;
  description: string;
  status: 'not-started' | 'in-progress' | 'completed';
}

export interface WorkspaceData {
  workspaceId: string;
  userObjectId: string;
  workspaceName?: string;
  capacityAssigned?: boolean;
}

export interface SourceConnection {
  id: string;
  name: string;
  databaseType: string;
  server: string;
  databaseName: string;
  username: string;
  password: string;
  status: 'active' | 'inactive' | 'creating' | 'failed';
  statusError?: string;
  fabricConnectionId?: string;
  aiMappingSaved?: boolean;
}

export interface MedallionLayer {
  key: 'bronze' | 'silver' | 'gold';
  name: string;
  label: string;
  validated: boolean;
  description: string;
}

export interface MetadataSetup {
  warehouseName: string;
  metadataCreated: boolean;
  logCreated: boolean;
  warehouseId: string | null;
}

export interface ConfigTask {
  id: string;
  name: string;
  status: 'not-started' | 'running' | 'completed';
}

export interface Pipeline {
  id: string;
  name: string;
  fabricItemId: string;
  status: 'not-started' | 'running' | 'completed' | 'failed';
  jobId?: string;
}

export interface NotebookItem {
  filename: string;
  name: string;
  sizeBytes: number;
  uploadStatus: 'pending' | 'uploading' | 'success' | 'failed';
  error?: string;
  fabricItemId?: string;
}

export interface PipelineItem {
  filename: string;
  name: string;
  sizeBytes: number;
  uploadStatus: 'pending' | 'uploading' | 'success' | 'failed';
  error?: string;
  fabricItemId?: string;
  runStatus?: 'not-started' | 'running' | 'completed' | 'failed';
  jobId?: string;
  uploadItemName?: string;
}

export interface FabricCredentials {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  capacityId: string;
  userObjectId: string;
}

export interface SetupState {
  currentStep: number;
  workspace: WorkspaceData;
  credentials: FabricCredentials;
  connections: SourceConnection[];
  medallionLayers: MedallionLayer[];
  metadataSetup: MetadataSetup;
  notebooks: Record<string, NotebookItem[]>;
  pipelineFiles: Record<string, PipelineItem[]>;
  configLoading: Record<string, boolean>;
  selectedConnection: string | null;
  configTasks: ConfigTask[];
  pipelines: Pipeline[];
  credentialsSaved: boolean;
  loading: boolean;
  connectionsLoading: boolean;
  error: string | null;
  itlConfigDownloaded: Record<string, boolean>;
  itlConfigUploaded: Record<string, boolean>;
  itlPipelineFiles: Record<string, PipelineItem[]>;
  itlNotebookRunStatus: Record<string, string | null>;
  itlStatusChecked: Record<string, boolean>;
}