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
  /** Finin-only: true once this connection's AI Mapping results have already
   * been saved to SourceInformationSchemaMapped. Persisted server-side so it
   * survives page reloads. */
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
  /**
   * The actual item_name this pipeline is stored under in the backend's
   * config_uploads table. This can differ from `name` because deployed
   * pipelines are persisted under a connection-prefixed name
   * (`{connection_name}_{base_name}`, see pipeline.py upload_pipelines).
   * Always prefer this over `name` when calling updateRunStatus, or the
   * PATCH /upload-status lookup will 404 ("Upload record not found").
   */
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
  /** True only while the initial per-project bootstrap fetch (connections,
   * medallion config, metadata, credentials) is in flight — distinct from
   * `loading`, which individual button actions also toggle. Lets screens
   * show a loading placeholder instead of a false "nothing here" state on
   * first mount / page reload, before that fetch has resolved. */
  connectionsLoading: boolean;
  error: string | null;
  // ITL state — keyed by connection id so each source is fully independent
  itlConfigDownloaded: Record<string, boolean>;
  itlConfigUploaded: Record<string, boolean>;
  itlPipelineFiles: Record<string, PipelineItem[]>;
  itlNotebookRunStatus: Record<string, string | null>;
}