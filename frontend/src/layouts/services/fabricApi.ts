/**
 * Fabric Accelerator API service
 * Calls the backend /fabric endpoints
 *
 * Most endpoints are scoped to a project:
 *   /fabric/projects/{projectId}/provision-workspace
 *   /fabric/projects/{projectId}/medallion
 * Source connections are global per user:
 *   /fabric/source-connections
 */

import { env } from '../../config/env';
import {
  isTokenExpired,
  refreshAccessToken,
  redirectToLogin,
} from '../../shared/utils/tokenManager';

const BASE = `${env.apiUrl.replace(/\/+$/, '')}/fabric`;

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  // Pre-check: refresh proactively if token is about to expire
  const currentToken = localStorage.getItem('access_token');
  if (!currentToken || isTokenExpired(currentToken)) {
    const newToken = await refreshAccessToken();
    if (!newToken) {
      redirectToLogin();
      throw new Error('Session expired. Please log in again.');
    }
  }

  const doFetch = () =>
    fetch(`${BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...options.headers,
      },
    });

  let res = await doFetch();

  // Retry once on 401 after refreshing the token
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) {
      redirectToLogin();
      throw new Error('Session expired. Please log in again.');
    }
    res = await doFetch();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

async function requestBlob(endpoint: string): Promise<Blob> {
  const currentToken = localStorage.getItem('access_token');
  if (!currentToken || isTokenExpired(currentToken)) {
    const newToken = await refreshAccessToken();
    if (!newToken) {
      redirectToLogin();
      throw new Error('Session expired. Please log in again.');
    }
  }

  let res = await fetch(`${BASE}${endpoint}`, {
    headers: { ...authHeaders() },
  });

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) {
      redirectToLogin();
      throw new Error('Session expired. Please log in again.');
    }
    res = await fetch(`${BASE}${endpoint}`, { headers: { ...authHeaders() } });
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${res.status})`);
  }
  return res.blob();
}

async function requestFormData<T>(endpoint: string, formData: FormData): Promise<T> {
  const currentToken = localStorage.getItem('access_token');
  if (!currentToken || isTokenExpired(currentToken)) {
    const newToken = await refreshAccessToken();
    if (!newToken) {
      redirectToLogin();
      throw new Error('Session expired. Please log in again.');
    }
  }

  const doFetch = () =>
    fetch(`${BASE}${endpoint}`, {
      method: 'POST',
      headers: { ...authHeaders() },
      body: formData,
    });

  let res = await doFetch();

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) {
      redirectToLogin();
      throw new Error('Session expired. Please log in again.');
    }
    res = await doFetch();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

// ── Projects ────────────────────────────────────────────────────────

export interface ProjectPayload {
  name: string;
  description?: string;
  app_type?: 'fabric' | 'finin';
}

export interface ProjectResponse {
  id: string;
  name: string;
  description: string | null;
  user_id: string;
  status: string;
  workspace_id: string | null;
  workspace_name: string | null;
  capacity_assigned: boolean;
  app_type: 'fabric' | 'finin';
  created_at: string | null;
}

export function listProjects(appType: 'fabric' | 'finin' = 'fabric') {
  return request<ProjectResponse[]>(`/projects?app_type=${appType}`);
}

export function getProject(projectId: string) {
  return request<ProjectResponse>(`/projects/${projectId}`);
}

export function createProject(data: ProjectPayload) {
  return request<ProjectResponse>('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteProject(projectId: string) {
  return request<{ status: string }>(`/projects/${projectId}`, {
    method: 'DELETE',
  });
}

// ── Workspace Provisioning ──────────────────────────────────────────

export interface WorkspaceProvisionPayload {
  workspace_name: string;
  user_fabric_token?: string;
}

export interface WorkspaceProvisionResponse {
  workspace_id: string;
  workspace_name: string;
  sp_object_id: string;
  capacity_assigned: boolean;
  status: string;
}

export function provisionWorkspace(projectId: string, data: WorkspaceProvisionPayload) {
  return request<WorkspaceProvisionResponse>(`/projects/${projectId}/provision-workspace`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── Fabric Credentials ──────────────────────────────────────────────

export interface FabricCredentialPayload {
  client_id: string;
  client_secret: string;
  tenant_id: string;
  capacity_id: string;
  user_object_id?: string;
}

export interface FabricCredentialResponse {
  id: string;
  client_id: string;
  tenant_id: string;
  capacity_id: string;
  user_object_id: string | null;
  workspace_id: string | null;
  project_id: string;
}

export function saveFabricCredentials(projectId: string, data: FabricCredentialPayload) {
  return request<FabricCredentialResponse>(`/projects/${projectId}/credentials`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getFabricCredentials(projectId: string) {
  return request<FabricCredentialResponse>(`/projects/${projectId}/credentials`);
}

// ── Gateways ────────────────────────────────────────────────────────

export interface GatewayInfo {
  id: string;
  name: string;
  type: string;
}

export function listGateways(projectId: string) {
  return request<GatewayInfo[]>(`/projects/${projectId}/gateways`);
}

// ── Source Connections (global per user) ─────────────────────────────

export interface SourceConnectionPayload {
  conn_name: string;
  db_type: string;
  server: string;
  database?: string;
  username?: string;
  password?: string;
  is_on_prem?: boolean;
  gateway_name?: string;
  auth_type?: string;
  tenant_id?: string;
  client_id?: string;
  client_secret?: string;
  /** Optional: when provided, the backend links the new connection to this
   * project in the same request, instead of a separate follow-up call. */
  project_id?: string;
  connection_index?: number;
}

export interface SourceConnectionResponse {
  id: string;
  conn_name: string;
  db_type: string;
  server: string;
  database: string | null;
  is_on_prem: boolean;
  gateway_name: string | null;
  fabric_connection_id: string | null;
  ai_mapping_saved?: boolean;
  status?: string;
  status_error?: string | null;
  user_id: string;
}

export function createSourceConnection(data: SourceConnectionPayload) {
  return request<SourceConnectionResponse>('/source-connections', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function listSourceConnections() {
  return request<SourceConnectionResponse[]>('/source-connections');
}

// ── Project ↔ Source Connection links ───────────────────────────────

export interface LinkSourceConnectionPayload {
  source_connection_id: string;
  connection_index: number;
}

export interface ProjectSourceConnectionResponse {
  id: string;
  project_id: string;
  source_connection_id: string;
  connection_index: number;
  source_connection: SourceConnectionResponse | null;
}

export function linkSourceConnection(projectId: string, data: LinkSourceConnectionPayload) {
  return request<ProjectSourceConnectionResponse>(`/projects/${projectId}/source-connections`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function listProjectConnections(projectId: string) {
  return request<ProjectSourceConnectionResponse[]>(`/projects/${projectId}/source-connections`);
}

export function unlinkSourceConnection(projectId: string, linkId: string) {
  return request<{ status: string }>(`/projects/${projectId}/source-connections/${linkId}`, {
    method: 'DELETE',
  });
}

// ── Medallion (per project) ─────────────────────────────────────────

export interface MedallionPayload {
  bronze_is_lakehouse: boolean;
  silver_is_lakehouse: boolean;
  gold_is_lakehouse: boolean;
  schema_enabled: boolean;
  bronze_name: string;
  silver_name: string;
  gold_name: string;
}

export interface MedallionResponse {
  id: string;
  bronze_is_lakehouse: boolean;
  silver_is_lakehouse: boolean;
  gold_is_lakehouse: boolean;
  schema_enabled: boolean;
  bronze_name: string;
  silver_name: string;
  gold_name: string;
  bronze_item_id: string | null;
  silver_item_id: string | null;
  gold_item_id: string | null;
  project_id: string;
}

export function createMedallion(projectId: string, data: MedallionPayload) {
  return request<MedallionResponse>(`/projects/${projectId}/medallion`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function listMedallionConfigs(projectId: string) {
  return request<MedallionResponse[]>(`/projects/${projectId}/medallion`);
}

// ── Metadata / Log (per project) ────────────────────────────────────

export interface MetadataActionPayload {
  action: 'create_metadata' | 'create_log';
}

export interface MetadataActionResponse {
  status: string;
  message: string;
  warehouse_id?: string;
  details?: string[];
}

export function runMetadataAction(projectId: string, data: MetadataActionPayload) {
  return request<MetadataActionResponse>(`/projects/${projectId}/metadata`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface MetadataConfigResponse {
  id: string;
  warehouse_id: string | null;
  warehouse_name: string;
  metadata_created: boolean;
  log_created: boolean;
  project_id: string;
}

export function getMetadataConfig(projectId: string) {
  return request<MetadataConfigResponse>(`/projects/${projectId}/metadata-config`);
}

// ── Notebooks (per project) ─────────────────────────────────────────

export interface NotebookInfo {
  filename: string;
  name: string;
  size_bytes: number;
}

export interface NotebookUploadPayload {
  connection_name: string;
  connection_index: number;
  db_type?: string;
  filenames?: string[];
  app_mode?: 'fabric' | 'finin';
}

export interface NotebookUploadResult {
  name: string;
  status: 'success' | 'failed';
  id?: string;
  error?: string;
}

export interface NotebookUploadResponse {
  status: string;
  results: NotebookUploadResult[];
}

export function listNotebooks(dbType?: string) {
  const params = dbType ? `?db_type=${encodeURIComponent(dbType)}` : '';
  return request<NotebookInfo[]>(`/notebooks${params}`);
}

export function uploadNotebooks(projectId: string, data: NotebookUploadPayload) {
  return request<NotebookUploadResponse>(`/projects/${projectId}/notebooks/upload`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── Pipelines (per project) ─────────────────────────────────────────

export interface PipelineInfo {
  filename: string;
  name: string;
  size_bytes: number;
}

export interface PipelineUploadPayload {
  connection_name: string;
  connection_index: number;
  db_type?: string;
  filenames?: string[];
  app_mode?: 'fabric' | 'finin';
}

export interface PipelineUploadResult {
  name: string;
  status: 'success' | 'failed';
  id?: string;
  filename?: string;
  error?: string;
}

export interface PipelineUploadResponse {
  status: string;
  results: PipelineUploadResult[];
}

export function listPipelines(dbType?: string) {
  const params = dbType ? `?db_type=${encodeURIComponent(dbType)}` : '';
  return request<PipelineInfo[]>(`/pipelines${params}`);
}

export function uploadPipelines(projectId: string, data: PipelineUploadPayload) {
  return request<PipelineUploadResponse>(`/projects/${projectId}/pipelines/upload`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function uploadBlobConfig(projectId: string) {
  return request<{ status: string; message: string }>(`/projects/${projectId}/blob-config/upload`, {
    method: 'POST',
  });
}

// ── Upload Status ───────────────────────────────────────────────────

export interface ConfigUploadStatus {
  id: string;
  project_id: string;
  source_connection_id: string | null;
  item_type: 'notebook' | 'pipeline';
  item_name: string;
  status: 'success' | 'failed';
  fabric_item_id: string | null;
  run_status: string | null;
  job_id: string | null;
}

export function getUploadStatus(projectId: string, sourceConnectionId?: string) {
  const qs = sourceConnectionId ? `?source_connection_id=${encodeURIComponent(sourceConnectionId)}` : '';
  return request<ConfigUploadStatus[]>(`/projects/${projectId}/upload-status${qs}`);
}

export function updateRunStatus(
  projectId: string,
  data: { item_name: string; item_type?: string; run_status: string; job_id?: string }
) {
  return request<ConfigUploadStatus>(`/projects/${projectId}/upload-status`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ── Pipeline Run / Status ───────────────────────────────────────────

export interface WorkspacePipeline {
  id: string;
  name: string;
}

export interface PipelineRunPayload {
  parameters?: Record<string, string>;
  job_type?: string;
}

export interface PipelineRunResponse {
  job_id: string;
  pipeline_id: string;
  status: string;
}

export interface PipelineJobStatusResponse {
  job_id: string;
  status: string; // completed, failed, error, cancelled, in_progress
  error?: string;
}

export function listWorkspacePipelines(projectId: string) {
  return request<WorkspacePipeline[]>(`/projects/${projectId}/workspace-pipelines`);
}

export function runFabricPipeline(projectId: string, pipelineItemId: string, data?: PipelineRunPayload) {
  return request<PipelineRunResponse>(`/projects/${projectId}/pipelines/${pipelineItemId}/run`, {
    method: 'POST',
    body: JSON.stringify(data || {}),
  });
}

export function getPipelineJobStatus(projectId: string, pipelineItemId: string, jobId: string) {
  return request<PipelineJobStatusResponse>(`/projects/${projectId}/pipelines/${pipelineItemId}/jobs/${jobId}`);
}

// Latest job instance for an item, regardless of who triggered it — used
// to poll child pipelines invoked internally by a parent/master pipeline
// (we never capture our own job_id for those).
export function getLatestItemJobStatus(projectId: string, pipelineItemId: string) {
  return request<{ status: string; job_id?: string; error?: string }>(
    `/projects/${projectId}/pipelines/${pipelineItemId}/latest-status`
  );
}

// ── Pipeline Status Sync (on page refresh) ──────────────────────────

export function syncPipelineStatus(projectId: string) {
  return request<{ updated: number; pipelines: Array<{ item_name: string; new_status: string }> }>(
    `/projects/${projectId}/sync-pipeline-status`,
    { method: 'POST' }
  );
}

// ── ITL Config (Download / Upload Excel) ────────────────────────────

export function downloadItlConfig(projectId: string, connectionName: string) {
  return requestBlob(`/projects/${projectId}/itl-config/download?connection_name=${encodeURIComponent(connectionName)}`);
}

export function getItlConfigStatus(projectId: string, connectionName: string) {
  return request<{
    downloaded: boolean;
    uploaded: boolean;
    onelake_path: string | null;
    notebook_run_status: string | null;
    notebook_job_id: string | null;
    deployed_pipelines: {
      name: string;
      status: string;
      fabric_item_id: string | null;
      run_status?: string | null;
      job_id?: string | null;
    }[];
  }>(
    `/projects/${projectId}/itl-config/status?connection_name=${encodeURIComponent(connectionName)}`
  );
}

export function uploadItlConfig(projectId: string, connectionName: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return requestFormData<{ status: string; rows_parsed: number; message: string }>(
    `/projects/${projectId}/itl-config/upload?connection_name=${encodeURIComponent(connectionName)}`,
    formData
  );
}

export function uploadItlPipelines(projectId: string, data: PipelineUploadPayload) {
  return request<PipelineUploadResponse>(`/projects/${projectId}/pipelines/upload-itl`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── ITL Notebook Run ──────────────────────────────

export interface NotebookRunRequest {
  notebook_name?: string;
  parameters?: Record<string, unknown>;
}

export interface NotebookRunResponse {
  job_id: string;
  notebook_id: string;
  status: string;
}

export interface NotebookJobStatusResponse {
  job_id: string;
  status: string;
  error?: string;
}

export function runItlNotebook(projectId: string, notebookName?: string) {
  return request<NotebookRunResponse>(`/projects/${projectId}/itl-notebook/run`, {
    method: 'POST',
    body: JSON.stringify({ notebook_name: notebookName || '01_NB_IncrementalConfigCreation' }),
  });
}

export function getItlNotebookStatus(
  projectId: string,
  notebookName: string,
  jobId: string
) {
  return request<NotebookJobStatusResponse>(
    `/projects/${projectId}/itl-notebook/${encodeURIComponent(notebookName)}/jobs/${jobId}`
  );
}

export interface DeployGoldStoredProceduresResponse {
  batches_executed: number;
  procedures_deployed: number;
  database: string;
}

export function deployGoldStoredProcedures(projectId: string) {
  return request<DeployGoldStoredProceduresResponse>(
    `/projects/${projectId}/gold/deploy-stored-procedures`,
    { method: 'POST' }
  );
}