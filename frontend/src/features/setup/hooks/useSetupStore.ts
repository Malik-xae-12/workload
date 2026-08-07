/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { SetupState, SourceConnection, ConfigTask, Pipeline, NotebookItem, PipelineItem } from '../types';

import {
  getProject,
  provisionWorkspace,
  createSourceConnection,
  createMedallion,
  runMetadataAction,
  listNotebooks,
  uploadNotebooks,
  listPipelines,
  uploadPipelines,
  linkSourceConnection,
  listProjectConnections,
  listMedallionConfigs,
  getMetadataConfig,
  getUploadStatus,
  updateRunStatus,
  getLatestItemJobStatus,
  listWorkspacePipelines,
  runFabricPipeline,
  getPipelineJobStatus,
  syncPipelineStatus,
  downloadItlConfig,
  uploadItlConfig,
  getItlConfigStatus,
  uploadItlPipelines,
  runItlNotebook as runItlNotebookApi,
  getItlNotebookStatus,
  startDeployGoldStoredProcedures as startDeployGoldStoredProceduresApi,
  getDeployGoldStoredProceduresStatus as getDeployGoldStoredProceduresStatusApi,
  deployMasterExecutor as deployMasterExecutorApi,
  startExecuteMasterSp as startExecuteMasterSpApi,
  getExecuteMasterSpStatus as getExecuteMasterSpStatusApi,
  uploadSemanticModelExcel as uploadSemanticModelExcelApi,
  getSemanticModelStatus as getSemanticModelStatusApi,
  startBuildSemanticModel as startBuildSemanticModelApi,
  getBuildSemanticModelStatus as getBuildSemanticModelStatusApi,
  saveFabricCredentials,
  getFabricCredentials,
} from '../../../layouts/services/fabricApi';

const initialState: SetupState = {
  currentStep: 0,
  workspace: {
    workspaceId: '',
    userObjectId: '',
  },
  credentials: {
    clientId: '',
    clientSecret: '',
    tenantId: '',
    capacityId: '',
    userObjectId: '',
  },
  connections: [],
  medallionLayers: [
    {
      key: 'bronze',
      name: 'LH_Bronze',
      label: 'Bronze Layer',
      validated: false,
      description: 'Raw data ingestion from source systems',
    },
    {
      key: 'silver',
      name: 'LH_Silver',
      label: 'Silver Layer',
      validated: false,
      description: 'Enriched and validated business logic',
    },
    {
      key: 'gold',
      name: 'WH_Gold',
      label: 'Gold Layer',
      validated: false,
      description: 'Report-ready aggregated gold standard',
    },
  ],
  selectedConnection: null,
  metadataSetup: {
    warehouseName: 'WH_MetaData',
    metadataCreated: false,
    logCreated: false,
    warehouseId: null,
  },
  notebooks: {},
  pipelineFiles: {},
  configTasks: [
    { id: '1', name: 'Notebook Setup', status: 'not-started' },
    { id: '2', name: 'Pipeline Setup', status: 'not-started' },
  ],
  pipelines: [],
  credentialsSaved: false,
  loading: false,
  connectionsLoading: false,
  configLoading: {},
  error: null,
  itlConfigDownloaded: {},
  itlConfigUploaded: {},
  itlPipelineFiles: {},
  itlNotebookRunStatus: {},
  itlStatusChecked: {},
};;

// Persist wizard progress (current step + selected connection) per project so a
// browser refresh returns the user to where they left off instead of step 0.
const PROGRESS_STORAGE_PREFIX = 'fabric_setup_progress_';

const loadPersistedProgress = (projectId: string | null): { currentStep: number; selectedConnection: string | null } => {
  if (!projectId) return { currentStep: 0, selectedConnection: null };
  try {
    const raw = localStorage.getItem(`${PROGRESS_STORAGE_PREFIX}${projectId}`);
    if (!raw) return { currentStep: 0, selectedConnection: null };
    const parsed = JSON.parse(raw);
    return {
      currentStep: typeof parsed.currentStep === 'number' ? parsed.currentStep : 0,
      selectedConnection: typeof parsed.selectedConnection === 'string' ? parsed.selectedConnection : null,
    };
  } catch {
    return { currentStep: 0, selectedConnection: null };
  }
};

export const useSetupStore = (projectId: string | null) => {
  const [state, setState] = useState<SetupState>(() => {
    const persisted = loadPersistedProgress(projectId);
    return { ...initialState, currentStep: persisted.currentStep, selectedConnection: persisted.selectedConnection };
  });

  // Keep a ref to the latest state so async callbacks never see stale closures
  const stateRef = useRef(state);
  stateRef.current = state;

  // Every field below is scoped to a single project (workspace id, medallion
  // config, connections, notebook/pipeline deploy+run status, etc). Without
  // *some* handling here, switching to a different project — including
  // switching between Fabric Accelerator and Finin Accelerator, which keep
  // independent sessions — left the *previous* project's data sitting in
  // state, so the new project silently inherited stale workspace IDs and
  // "already deployed" statuses that didn't belong to it.
  //
  // A hard reset to initialState fixes that but creates a worse bug: if you
  // switch away mid-deploy (e.g. Fabric -> Finin -> back to Fabric) the
  // "uploading" status is wiped, so the UI flashes back to "Not Created"
  // with the Create button re-enabled until the backend refetch lands and
  // it jumps straight to "Created" — looking exactly like the click never
  // registered. Instead we snapshot each project's state as we leave it and
  // restore that snapshot instantly on return, so an in-progress or
  // just-finished deploy is still visible the moment you switch back. The
  // backend refetch below still runs and reconciles anything that changed
  // while you were away (e.g. a deploy that finished in the background).
  const projectStateCache = useRef<Record<string, SetupState>>({});
  const prevProjectIdRef = useRef<string | null>(projectId);
  useEffect(() => {
    if (prevProjectIdRef.current !== projectId) {
      if (prevProjectIdRef.current) {
        projectStateCache.current[prevProjectIdRef.current] = stateRef.current;
      }
      prevProjectIdRef.current = projectId;

      const cached = projectId ? projectStateCache.current[projectId] : undefined;
      if (cached) {
        // Durable data (connections, notebook/pipeline statuses, medallion
        // config, etc.) is restored as-is. Transient "a request is in
        // flight right now" flags are NOT restored from the snapshot —
        // if you left mid-request, that request's own promise resolves
        // into whatever project is on screen when it finishes, not this
        // cached one, so this cached copy's flag would otherwise be
        // permanently stuck "true" and disable its buttons forever.
        setState({
          ...cached,
          loading: false,
          error: null,
          configLoading: {},
        });
      } else {
        const persisted = loadPersistedProgress(projectId);
        setState(() => ({
          ...initialState,
          // currentStep/selectedConnection are restored from localStorage (or
          // the per-accelerator session in SetupPage) — don't fight that by
          // forcing them back to defaults here.
          currentStep: persisted.currentStep,
          selectedConnection: persisted.selectedConnection,
        }));
      }
    }
  }, [projectId]);

  // Request guards to avoid applying stale responses when switching connections quickly
  const notebooksRequestIdRef = useRef(0);
  const pipelinesRequestIdRef = useRef(0);
  // Epoch increments on every connection switch — polling loops check this to abort stale runs
  const connectionEpochRef = useRef(0);

  // Every async action below captures `projectId` at call time (correctly,
  // since useCallback recreates them whenever projectId changes) but was
  // applying its *result* via the shared `setState` unconditionally. If you
  // switch to a different project (or accelerator) before that result comes
  // back, `setState` was still live and would write the response into
  // whichever project happens to be on screen when it resolves — not the
  // project that actually started the request. The project that started it
  // then never gets the update at all, so its cached snapshot stays frozen
  // on "uploading"/"loading" until you trigger a fresh fetch, which is
  // exactly the "shows Not Created, then suddenly Created" symptom.
  //
  // applyForProject fixes this by checking whether the requesting project is
  // still the one on screen: if so, it updates live state as before; if not,
  // it patches that project's cached snapshot directly, so the correct
  // result is sitting there waiting the moment you switch back to it.
  const liveProjectIdRef = useRef(projectId);
  liveProjectIdRef.current = projectId;
  const applyForProject = useCallback(
    (forProjectId: string | null, updater: (prev: SetupState) => SetupState) => {
      if (forProjectId === liveProjectIdRef.current) {
        setState(updater);
      } else if (forProjectId) {
        const base = projectStateCache.current[forProjectId] ?? {
          ...initialState,
          ...loadPersistedProgress(forProjectId),
        };
        projectStateCache.current[forProjectId] = updater(base);
      }
    },
    [],
  );


  // Persist step + selected connection on every change so a page refresh (or
  // remount) can restore exactly where the user left off for this project.
  useEffect(() => {
    if (!projectId) return;
    try {
      localStorage.setItem(
        `${PROGRESS_STORAGE_PREFIX}${projectId}`,
        JSON.stringify({ currentStep: state.currentStep, selectedConnection: state.selectedConnection }),
      );
    } catch {
      /* localStorage unavailable/full — non-fatal, just skip persistence */
    }
  }, [projectId, state.currentStep, state.selectedConnection]);

  const setCurrentStep = (step: number) => {
    setState((prev) => ({ ...prev, currentStep: step }));
  };

  const updateWorkspace = (workspace: Partial<SetupState['workspace']>) => {
    setState((prev) => ({
      ...prev,
      workspace: { ...prev.workspace, ...workspace },
    }));
  };

  const normalizeUploadName = (value: string) =>
    value
      .toLowerCase()
      .replace(/\.json$/, '')
      .replace(/[\s_-]+/g, '');

  /**
   * Pick the best matching config_uploads row for a local file name out of
   * every candidate key that could refer to it (exact name, connection-
   * prefixed name, etc). A stale row from an earlier failed/renamed upload
   * attempt (fabric_item_id null, status 'failed') can share the DB with the
   * real, successfully-deployed row for the same pipeline/notebook — e.g. an
   * early attempt saved as the bare name "01_PL_SQL_ConfigCreation" before
   * connection-prefixing, and the real deploy later saved as
   * "MyConn_01_PL_SQL_ConfigCreation". Both match this file, but only one
   * was ever actually deployed. Always prefer whichever candidate actually
   * has a fabric_item_id (i.e. is real) instead of picking the exact/bare
   * match unconditionally — that used to pick the dead row and show
   * "Failed"/stuck "Running" for an item that actually deployed and ran fine.
   */
  const pickBestUploadKey = (
    saved: Record<string, { status: string; fabric_item_id: string | null }>,
    targetName: string,
    isMatch: (key: string) => boolean,
  ): string | undefined => {
    const candidateKeys = Object.keys(saved).filter((key) => key === targetName || isMatch(key));
    if (candidateKeys.length === 0) return undefined;
    return candidateKeys.find((k) => saved[k].fabric_item_id) ?? candidateKeys[0];
  };

  const isUploadMatch = (
    uploadedName: string,
    targetName: string,
    targetFilename?: string,
    connectionName?: string,
  ) => {
    if (uploadedName === targetName) return true;
    if (targetFilename && uploadedName === targetFilename) return true;
    if (uploadedName.endsWith(`_${targetName}`)) return true;

    const normalizedUpload = normalizeUploadName(uploadedName);
    const normalizedTarget = normalizeUploadName(targetName);
    if (normalizedUpload.endsWith(normalizedTarget)) return true;

    if (targetFilename) {
      const normalizedFilename = normalizeUploadName(targetFilename);
      if (normalizedUpload.endsWith(normalizedFilename)) return true;
    }

    if (connectionName) {
      const normalizedWithPrefix = normalizeUploadName(`${connectionName}_${targetName}`);
      if (normalizedUpload.endsWith(normalizedWithPrefix)) return true;
    }

    return false;
  };

  const addConnection = (connection: SourceConnection) => {
    setState((prev) => ({
      ...prev,
      connections: [...prev.connections, connection],
    }));
  };

  /**
   * Fetch all saved project state from the backend (credentials, connections, medallion).
   */
  const fetchCredentialsFromBackend = useCallback(async () => {
    if (!projectId) return;

    // Dedicated flag for this bootstrap fetch, separate from the generic
    // `loading` used by individual button actions (upload, run, etc.) —
    // this function previously set neither, so on a page reload there was
    // no signal at all that connections/artifacts were still being fetched.
    // Screens gated on `connections.length === 0` (or `rows.length === 0`)
    // showed their genuinely-empty state immediately instead of a loading
    // placeholder, even though the real data was just about to arrive.
    applyForProject(projectId, (prev) => ({ ...prev, connectionsLoading: true }));

    // Fetch all project state in parallel instead of sequentially. Uses
    // getProject (a single row by id) rather than listing every project —
    // previously this listed *all* projects in *both* accelerators just to
    // find the one whose id we already have, which is slower and means a
    // Fabric Accelerator fetch was needlessly touching Finin's project list
    // (and vice versa).
    const [projectResult, linksResult, configsResult, metadataResult, credResult] = await Promise.allSettled([
      getProject(projectId),
      listProjectConnections(projectId),
      listMedallionConfigs(projectId),
      getMetadataConfig(projectId),
      getFabricCredentials(projectId),
    ]);

    // 0. Fabric credentials
    if (credResult.status === 'fulfilled') {
      const cred = credResult.value;
      applyForProject(projectId, (prev) => ({
        ...prev,
        credentialsSaved: true,
        credentials: {
          clientId: cred.client_id,
          clientSecret: '', // Don't expose secret back to UI
          tenantId: cred.tenant_id,
          capacityId: cred.capacity_id,
          userObjectId: cred.user_object_id || '',
        },
      }));
    }

    // 1. Project workspace info
    if (projectResult.status === 'fulfilled') {
      const project = projectResult.value;
      if (project?.workspace_id) {
        applyForProject(projectId, (prev) => ({
          ...prev,
          credentialsSaved: true,
          workspace: {
            workspaceId: project.workspace_id || '',
            userObjectId: '',
            workspaceName: project.workspace_name || '',
            capacityAssigned: project.capacity_assigned,
          },
        }));
      } else {
        applyForProject(projectId, (prev) => ({ ...prev, credentialsSaved: false }));
      }
    } else {
      applyForProject(projectId, (prev) => ({ ...prev, credentialsSaved: false }));
    }

    // 2. Source connections
    if (linksResult.status === 'fulfilled') {
      const conns: SourceConnection[] = linksResult.value
        .filter((l) => l.source_connection)
        .map((l) => {
          const sc = l.source_connection!;
          return {
            id: sc.id,
            name: sc.conn_name,
            databaseType: sc.db_type,
            server: sc.server,
            databaseName: sc.database || '',
            username: '',
            password: '',
            status: (sc.status as SourceConnection['status']) || 'active',
            statusError: sc.status_error || undefined,
            fabricConnectionId: sc.fabric_connection_id || undefined,
            aiMappingSaved: !!sc.ai_mapping_saved,
          };
        });
      applyForProject(projectId, (prev) => ({ ...prev, connections: conns }));
    }

    // 3. Medallion config
    if (configsResult.status === 'fulfilled' && configsResult.value.length > 0) {
      const mc = configsResult.value[0];
      applyForProject(projectId, (prev) => ({
        ...prev,
        medallionLayers: prev.medallionLayers.map((layer) => {
          if (layer.key === 'bronze') return { ...layer, name: mc.bronze_name || layer.name, validated: !!mc.bronze_item_id };
          if (layer.key === 'silver') return { ...layer, name: mc.silver_name || layer.name, validated: !!mc.silver_item_id };
          if (layer.key === 'gold') return { ...layer, name: mc.gold_name || layer.name, validated: !!mc.gold_item_id };
          return layer;
        }),
      }));
    }

    // 4. Metadata config
    if (metadataResult.status === 'fulfilled') {
      const mc = metadataResult.value;
      applyForProject(projectId, (prev) => ({
        ...prev,
        metadataSetup: {
          ...prev.metadataSetup,
          warehouseName: mc.warehouse_name || prev.metadataSetup.warehouseName,
          warehouseId: mc.warehouse_id || null,
          metadataCreated: mc.metadata_created,
          logCreated: mc.log_created,
        },
      }));
    }

    applyForProject(projectId, (prev) => ({ ...prev, connectionsLoading: false }));
  }, [projectId, applyForProject]);

  const updateCredentials = (field: string, value: string) => {
    setState((prev) => ({
      ...prev,
      credentials: { ...prev.credentials, [field]: value },
    }));
  };

  /**
   * Save Fabric credentials for this project. Validates on the server before persisting.
   */
  const saveCredentialsToBackend = useCallback(async () => {
    if (!projectId) return false;
    const { credentials } = stateRef.current;
    if (!credentials.clientId || !credentials.clientSecret || !credentials.tenantId || !credentials.capacityId) {
      setState((prev) => ({ ...prev, error: 'Please fill in all required credential fields' }));
      return false;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      await saveFabricCredentials(projectId, {
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        tenant_id: credentials.tenantId,
        capacity_id: credentials.capacityId,
        user_object_id: credentials.userObjectId || undefined,
      });
      applyForProject(projectId, (prev) => ({ ...prev, loading: false, credentialsSaved: true }));
      return true;
    } catch (e: any) {
      applyForProject(projectId, (prev) => ({ ...prev, loading: false, error: e.message }));
      return false;
    }
  }, [projectId, applyForProject]);

  /**
   * Provision a new Fabric workspace: creates workspace, adds SP as Admin, saves credentials.
   */
  const provisionWorkspaceToBackend = useCallback(async (workspaceName: string, userFabricToken?: string) => {
    if (!projectId) return false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const result = await provisionWorkspace(projectId, {
        workspace_name: workspaceName,
        user_fabric_token: userFabricToken,
      });
      applyForProject(projectId, (prev) => ({
        ...prev,
        loading: false,
        credentialsSaved: true,
        workspace: {
          workspaceId: result.workspace_id,
          userObjectId: result.sp_object_id || '',
          workspaceName: result.workspace_name,
          capacityAssigned: result.capacity_assigned,
        },
      }));
      return true;
    } catch (e: any) {
      applyForProject(projectId, (prev) => ({ ...prev, loading: false, error: e.message }));
      return false;
    }
  }, [projectId, applyForProject]);

  /**
   * Create a source connection in Fabric via the backend (global),
   * then link it to the current project.
   */
  const addConnectionToBackend = useCallback(
    async (conn: { name: string; databaseType: string; server: string; databaseName: string; username: string; password: string; is_on_prem?: boolean; gateway_name?: string; auth_type?: string; tenant_id?: string; client_id?: string; client_secret?: string }) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const connIndex = state.connections.length + 1;
        const result = await createSourceConnection({
          conn_name: conn.name,
          db_type: conn.databaseType,
          server: conn.server,
          database: conn.databaseName,
          username: conn.username,
          password: conn.password,
          is_on_prem: conn.is_on_prem,
          gateway_name: conn.gateway_name,
          auth_type: conn.auth_type,
          tenant_id: conn.tenant_id,
          client_id: conn.client_id,
          client_secret: conn.client_secret,
          // Auto-link atomically on the backend — see schema.py comment. If a
          // reload happens mid-request, the connection either doesn't exist
          // yet or is fully created AND linked; there's no in-between state
          // where it's created in Fabric but invisible in the project.
          project_id: projectId ?? undefined,
          connection_index: connIndex,
        });

        // Fallback for older backends that don't auto-link: if we have a
        // projectId but the response doesn't already reflect a link (this is
        // harmless/idempotent — link creation is keyed on the pair).
        if (projectId) {
          try {
            await linkSourceConnection(projectId, {
              source_connection_id: result.id,
              connection_index: connIndex,
            });
          } catch {
            /* already linked by the atomic path above — ignore */
          }
        }

        const newConn: SourceConnection = {
          id: result.id,
          name: result.conn_name,
          databaseType: result.db_type,
          server: result.server,
          databaseName: result.database || '',
          username: conn.username,
          password: '',
          status: 'active',
          fabricConnectionId: result.fabric_connection_id || undefined,
        };
        applyForProject(projectId, (prev) => ({
          ...prev,
          loading: false,
          connections: [...prev.connections, newConn],
        }));
        return true;
      } catch (e: any) {
        applyForProject(projectId, (prev) => ({ ...prev, loading: false, error: e.message }));
        return false;
      }
    },
    [projectId, state.connections.length, applyForProject],
  );

  /**
   * Create medallion architecture in Fabric via the backend.
   */
  const createMedallionInBackend = useCallback(async () => {
    if (!projectId) return false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const bronze = state.medallionLayers.find((l) => l.key === 'bronze')!;
      const silver = state.medallionLayers.find((l) => l.key === 'silver')!;
      const gold = state.medallionLayers.find((l) => l.key === 'gold')!;

      const result = await createMedallion(projectId, {
        bronze_is_lakehouse: true,
        silver_is_lakehouse: true,
        gold_is_lakehouse: false,
        schema_enabled: true,
        bronze_name: bronze.name,
        silver_name: silver.name,
        gold_name: gold.name,
      });

      // Mark layers as validated with the Fabric item IDs
      applyForProject(projectId, (prev) => ({
        ...prev,
        loading: false,
        medallionLayers: prev.medallionLayers.map((layer) => {
          if (layer.key === 'bronze') return { ...layer, validated: !!result.bronze_item_id };
          if (layer.key === 'silver') return { ...layer, validated: !!result.silver_item_id };
          if (layer.key === 'gold') return { ...layer, validated: !!result.gold_item_id };
          return layer;
        }),
      }));
      return true;
    } catch (e: any) {
      applyForProject(projectId, (prev) => ({ ...prev, loading: false, error: e.message }));
      return false;
    }
  }, [projectId, state.medallionLayers, applyForProject]);

  const clearError = () => setState((prev) => ({ ...prev, error: null }));

  const updateWarehouseName = (name: string) => {
    setState((prev) => ({
      ...prev,
      metadataSetup: { ...prev.metadataSetup, warehouseName: name },
    }));
  };

  /**
   * Create metadata warehouse in Fabric via the backend.
   */
  const createMetadataInBackend = useCallback(async () => {
    if (!projectId) return false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const result = await runMetadataAction(projectId, { action: 'create_metadata' });
      applyForProject(projectId, (prev) => ({
        ...prev,
        loading: false,
        metadataSetup: {
          ...prev.metadataSetup,
          metadataCreated: true,
          warehouseId: result.warehouse_id || null,
        },
      }));
      return true;
    } catch (e: any) {
      applyForProject(projectId, (prev) => ({ ...prev, loading: false, error: e.message }));
      return false;
    }
  }, [projectId, applyForProject]);

  /**
   * Create log objects (schema, tables, procedures) in the metadata warehouse.
   */
  const createLogInBackend = useCallback(async () => {
    if (!projectId) return false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      await runMetadataAction(projectId, { action: 'create_log' });
      applyForProject(projectId, (prev) => ({
        ...prev,
        loading: false,
        metadataSetup: { ...prev.metadataSetup, logCreated: true },
      }));
      return true;
    } catch (e: any) {
      applyForProject(projectId, (prev) => ({ ...prev, loading: false, error: e.message }));
      return false;
    }
  }, [projectId, applyForProject]);

  const selectConnection = (connectionId: string) => {
    connectionEpochRef.current++;
    setState((prev) => ({ ...prev, selectedConnection: connectionId }));
  };

  /**
   * Fetch the list of local .ipynb files from the backend.
   */
  const fetchNotebooks = useCallback(async (dbTypeOverride?: string, connectionIdOverride?: string) => {
    const currentState = stateRef.current;
    const resolvedConnectionId = connectionIdOverride ?? currentState.selectedConnection;
    const selectedConn = currentState.connections.find((c) => c.id === resolvedConnectionId);
    if (resolvedConnectionId && !selectedConn && !dbTypeOverride) return false;
    const dbType = dbTypeOverride || selectedConn?.databaseType;
    const connId = selectedConn?.id ?? resolvedConnectionId ?? '';
    setState((prev) => ({ ...prev, configLoading: { ...prev.configLoading, [connId]: true }, error: null }));
    const requestId = ++notebooksRequestIdRef.current;
    try {
      const [items, uploads] = await Promise.all([
        listNotebooks(dbType),
        projectId ? getUploadStatus(projectId, connId).catch(() => []) : Promise.resolve([]),
      ]);
      const saved: Record<string, { status: string; fabric_item_id: string | null }> = {};
      for (const u of uploads as any[]) {
        if (u.item_type === 'notebook' && u.source_connection_id === connId) {
          saved[u.item_name] = { status: u.status, fabric_item_id: u.fabric_item_id };
        }
      }
      const mapped: NotebookItem[] = items.map((nb) => {
        const matchedKey = pickBestUploadKey(saved, nb.name, (key) => key.endsWith(`_${nb.name}`));
        const entry = matchedKey ? saved[matchedKey] : undefined;
        return {
          filename: nb.filename, name: nb.name, sizeBytes: nb.size_bytes,
          uploadStatus: entry?.status === 'success' ? 'success' as const : entry?.status === 'failed' ? 'failed' as const : 'pending' as const,
          fabricItemId: entry?.fabric_item_id ?? undefined,
        };
      });
      if (requestId === notebooksRequestIdRef.current) {
        applyForProject(projectId, (prev) => {
          const existing = prev.notebooks[connId] || [];
          // Don't overwrite items currently being uploaded — preserve their uploading state
          const merged = mapped.map((nb) => {
            const live = existing.find((e) => e.name === nb.name);
            if (live && (live.uploadStatus === 'uploading' || live.uploadStatus === 'success')) return live;
            return nb;
          });
          return { ...prev, configLoading: { ...prev.configLoading, [connId]: false }, notebooks: { ...prev.notebooks, [connId]: merged } };
        });
      }
      return true;
    } catch (e: any) {
      if (requestId === notebooksRequestIdRef.current) {
        applyForProject(projectId, (prev) => ({ ...prev, configLoading: { ...prev.configLoading, [connId]: false }, error: e.message }));
      }
      return false;
    }
  }, [projectId, applyForProject]);

  /**
   * Upload all notebooks to Fabric under the selected connection folder.
   */
  const uploadNotebooksToFabric = useCallback(
    async (connectionName: string, connectionIndex: number, filenames?: string[], appMode: 'fabric' | 'finin' = 'fabric') => {
      if (!projectId) return false;
      const currentState = stateRef.current;
      const selectedConn = currentState.connections.find((c) => c.id === currentState.selectedConnection);
      const connId = selectedConn?.id ?? '';
      setState((prev) => ({
        ...prev, error: null,
        notebooks: {
          ...prev.notebooks,
          [connId]: (prev.notebooks[connId] || []).map((nb) =>
            nb.uploadStatus === 'pending' && (!filenames || filenames.includes(nb.filename)) ? { ...nb, uploadStatus: 'uploading' as const } : nb
          ),
        },
      }));
      try {
        const resp = await uploadNotebooks(projectId, {
          connection_name: connectionName,
          connection_index: connectionIndex,
          db_type: selectedConn?.databaseType,
          filenames,
          app_mode: appMode,
        });
        applyForProject(projectId, (prev) => ({
          ...prev,
          notebooks: {
            ...prev.notebooks,
            [connId]: (prev.notebooks[connId] || []).map((nb) => {
              const match = resp.results.find((r: any) => r.name === nb.name || r.name.endsWith(`_${nb.name}`));
              if (match) return { ...nb, uploadStatus: match.status === 'success' ? 'success' as const : 'failed' as const, error: match.error, fabricItemId: match.id };
              return nb;
            }),
          },
        }));
        return true;
      } catch (e: any) {
        applyForProject(projectId, (prev) => ({
          ...prev, error: e.message,
          notebooks: {
            ...prev.notebooks,
            [connId]: (prev.notebooks[connId] || []).map((nb) =>
              nb.uploadStatus === 'uploading' ? { ...nb, uploadStatus: 'failed' as const, error: e.message } : nb
            ),
          },
        }));
        return false;
      }
    },
    [projectId, applyForProject],
  );

  /**
   * Fetch the list of local pipeline JSON files from the backend.
   */
  const fetchPipelineFiles = useCallback(async (dbTypeOverride?: string, connectionIdOverride?: string, skipItlStatus?: boolean) => {
    const currentState = stateRef.current;
    const resolvedConnectionId = connectionIdOverride ?? currentState.selectedConnection;
    const selectedConn = currentState.connections.find((c) => c.id === resolvedConnectionId);
    if (resolvedConnectionId && !selectedConn && !dbTypeOverride) return false;
    const dbType = dbTypeOverride || selectedConn?.databaseType;
    const connId = selectedConn?.id ?? resolvedConnectionId ?? '';
    setState((prev) => ({ ...prev, configLoading: { ...prev.configLoading, [connId]: true }, error: null }));
    const requestId = ++pipelinesRequestIdRef.current;

    try {
      const finals = new Set(['completed', 'failed', 'error', 'cancelled']);
      const toRunStatus = (s: string): 'completed' | 'failed' | null =>
        s === 'completed' ? 'completed' : finals.has(s) ? 'failed' : null;

      // Fast path: local DB reads only (listPipelines reads local files,
      // getUploadStatus reads local config_uploads). No live Fabric calls
      // here — those are what were making Config Step feel slow to load.
      // Reconciling a stale 'running' badge against the live Fabric API
      // (below) now happens AFTER this first render, not before it.
      const [items, uploads] = await Promise.all([
        listPipelines(dbType),
        projectId ? getUploadStatus(projectId, connId).catch(() => []) : Promise.resolve([]),
      ]);
      const saved: Record<string, { status: string; fabric_item_id: string | null; run_status: string | null; job_id: string | null }> = {};
      for (const u of uploads as any[]) {
        if (u.item_type === 'pipeline' && u.source_connection_id === connId) {
          saved[u.item_name] = {
            status: u.status,
            fabric_item_id: u.fabric_item_id,
            run_status: u.run_status,
            job_id: u.job_id,
          };
        }
      }
      const mapped: PipelineItem[] = items.map((p) => {
        const matchedKey = pickBestUploadKey(saved, p.name, (key) =>
          isUploadMatch(key, p.name, p.filename, selectedConn?.name ?? undefined)
        );
        const entry = matchedKey ? saved[matchedKey] : undefined;
        return {
          filename: p.filename, name: p.name, sizeBytes: p.size_bytes,
          uploadStatus: entry?.status === 'success' ? 'success' as const : entry?.status === 'failed' ? 'failed' as const : 'pending' as const,
          fabricItemId: entry?.fabric_item_id ?? undefined,
          runStatus: (entry?.run_status as PipelineItem['runStatus']) ?? undefined,
          jobId: entry?.job_id ?? undefined,
          // Store the actual DB key (may be connection-prefixed) so status
          // updates PATCH the row that actually exists.
          uploadItemName: matchedKey ?? undefined,
        };
      });
      if (requestId === pipelinesRequestIdRef.current) {
        applyForProject(projectId, (prev) => {
          const existing = prev.pipelineFiles[connId] || [];
          const merged = mapped.map((p) => {
            const live = existing.find((e) => e.name === p.name);
            // Preserve uploading, running states — don't overwrite with stale fetch data
            if (live && (live.uploadStatus === 'uploading' || live.runStatus === 'running')) return live;
            if (live && live.uploadStatus === 'success') return live;
            return p;
          });
          return { ...prev, configLoading: { ...prev.configLoading, [connId]: false }, pipelineFiles: { ...prev.pipelineFiles, [connId]: merged } };
        });
        // Restore ITL downloaded/uploaded/notebook/pipeline state from backend DB.
        // ItlSection is shown for both Fabric and Finin (gated on allPipelinesRan,
        // not appMode) — callers must always pass skipItlStatus=false, or the
        // downloaded/uploaded flags reset to false on every reload and the
        // section looks like it needs to be redone even after completion.
        if (projectId && selectedConn?.name && !skipItlStatus) {
          getItlConfigStatus(projectId, selectedConn.name).then((status) => {
            applyForProject(projectId, (prev) => {
              const prevNotebookStatus = prev.itlNotebookRunStatus[connId] ?? null;
              // Don't clobber a live in-progress notebook run in this session
              const preserveNotebookStatus = prevNotebookStatus === 'running' || prevNotebookStatus === 'pending';
              const restoredPipelines: PipelineItem[] = status.deployed_pipelines.map((p) => ({
                filename: p.name + '.json',
                name: p.name,
                sizeBytes: 0,
                uploadStatus: p.status === 'success' ? 'success' as const : p.status === 'failed' ? 'failed' as const : 'pending' as const,
                fabricItemId: p.fabric_item_id ?? undefined,
                // Carry the persisted run state across too, so a pipeline that
                // was completed/running before the refresh doesn't revert to
                // looking like it was never run. Any stale 'running' value is
                // corrected shortly after by the background reconciliation
                // pass below (or the per-pipeline immediate-check poll).
                runStatus: (p.run_status as PipelineItem['runStatus']) ?? undefined,
                jobId: p.job_id ?? undefined,
              }));
              const prevItlPipelineFiles = prev.itlPipelineFiles[connId] || [];
              // Preserve any live 'uploading'/'running' rows already in state instead of overwriting
              const hasLiveDeploy = prevItlPipelineFiles.some((p) => p.uploadStatus === 'uploading' || p.runStatus === 'running');
              return {
                ...prev,
                itlConfigDownloaded: { ...prev.itlConfigDownloaded, [connId]: status.downloaded },
                itlConfigUploaded: { ...prev.itlConfigUploaded, [connId]: status.uploaded },
                itlNotebookRunStatus: {
                  ...prev.itlNotebookRunStatus,
                  [connId]: preserveNotebookStatus
                    ? prevNotebookStatus
                    : (status.notebook_run_status === 'success' ? 'success' : status.notebook_run_status === 'failed' ? 'failed' : prevNotebookStatus),
                },
                itlPipelineFiles: {
                  ...prev.itlPipelineFiles,
                  [connId]: hasLiveDeploy || restoredPipelines.length === 0 ? prevItlPipelineFiles : restoredPipelines,
                },
                // Mark this connection's ITL status as confirmed from the
                // backend — from this point on, an empty itlPipelineFiles
                // array genuinely means "nothing deployed" rather than
                // "haven't asked yet", so it's now safe for the UI to act
                // on that (show "Pending", allow auto-deploy) without risk
                // of jumping the gun mid-restore.
                itlStatusChecked: { ...prev.itlStatusChecked, [connId]: true },
              };
            });

            // Resume polling for any ITL pipelines persisted as 'running' (handles page-refresh case)
            for (const p of status.deployed_pipelines) {
              if (p.run_status === 'running' && p.fabric_item_id && p.job_id) {
                const epoch = connectionEpochRef.current;
                const fabricItemId = p.fabric_item_id;
                const jobId = p.job_id;
                const pipelineName = p.name;
                (async () => {
                  const applyFinal = async (finalStatus: 'completed' | 'failed') => {
                    if (connectionEpochRef.current !== epoch) return;
                    applyForProject(projectId, (prev) => ({
                      ...prev,
                      itlPipelineFiles: {
                        ...prev.itlPipelineFiles,
                        [connId]: (prev.itlPipelineFiles[connId] || []).map((pp) =>
                          pp.name === pipelineName ? { ...pp, runStatus: finalStatus } : pp
                        ),
                      },
                    }));
                    try { await updateRunStatus(projectId, { item_name: pipelineName, run_status: finalStatus, job_id: jobId }); } catch { /* ignore */ }
                  };
                  try {
                    const immediate = await getPipelineJobStatus(projectId, fabricItemId, jobId);
                    if (connectionEpochRef.current !== epoch) return;
                    if (immediate.status === 'completed' || ['failed', 'error', 'cancelled'].includes(immediate.status)) {
                      await applyFinal(immediate.status === 'completed' ? 'completed' : 'failed');
                      return;
                    }
                  } catch { /* fall through to poll loop */ }
                  const pollInterval = 5_000;
                  for (let i = 0; i < 180; i++) {
                    await new Promise((r) => setTimeout(r, pollInterval));
                    if (connectionEpochRef.current !== epoch) return;
                    try {
                      const statusResp = await getPipelineJobStatus(projectId, fabricItemId, jobId);
                      if (connectionEpochRef.current !== epoch) return;
                      if (statusResp.status === 'completed' || ['failed', 'error', 'cancelled'].includes(statusResp.status)) {
                        await applyFinal(statusResp.status === 'completed' ? 'completed' : 'failed');
                        return;
                      }
                    } catch { /* keep polling */ }
                  }
                })();
              }
            }
          }).catch(() => {
            applyForProject(projectId, (prev) => ({
              ...prev,
              itlStatusChecked: { ...prev.itlStatusChecked, [connId]: true },
            }));
          });
        }

        // Resume polling for any pipelines persisted as 'running' (handles page-refresh case)
        if (projectId) {
          for (const p of mapped) {
            if (p.runStatus === 'running' && p.fabricItemId && p.jobId) {
              const epoch = connectionEpochRef.current;
              const fabricItemId = p.fabricItemId;
              const jobId = p.jobId;
              const pipelineName = p.name;
              // The backend's config_uploads row may be keyed under a
              // connection-prefixed name (see PipelineItem.uploadItemName).
              // Use that for status PATCHes or the lookup 404s.
              const uploadItemName = p.uploadItemName ?? pipelineName;
              (async () => {
                // Check current status immediately before starting poll loop
                try {
                  const immediate = await getPipelineJobStatus(projectId, fabricItemId, jobId);
                  if (connectionEpochRef.current !== epoch) return;
                  if (immediate.status === 'completed' || ['failed', 'error', 'cancelled'].includes(immediate.status)) {
                    const finalStatus = immediate.status === 'completed' ? 'completed' as const : 'failed' as const;
                    applyForProject(projectId, (prev) => ({
                      ...prev,
                      pipelineFiles: {
                        ...prev.pipelineFiles,
                        [connId]: (prev.pipelineFiles[connId] || []).map((pp) =>
                          pp.name === pipelineName ? { ...pp, runStatus: finalStatus } : pp
                        ),
                      },
                    }));
                    try { await updateRunStatus(projectId, { item_name: uploadItemName, run_status: finalStatus, job_id: jobId }); } catch { /* ignore */ }
                    return; // no need to poll further
                  }
                } catch { /* fall through to poll loop */ }
                const pollInterval = 5_000;
                for (let i = 0; i < 240; i++) {
                  await new Promise((r) => setTimeout(r, pollInterval));
                  if (connectionEpochRef.current !== epoch) return;
                  try {
                    const statusResp = await getPipelineJobStatus(projectId, fabricItemId, jobId);
                    if (connectionEpochRef.current !== epoch) return;
                    if (statusResp.status === 'completed' || ['failed', 'error', 'cancelled'].includes(statusResp.status)) {
                      const finalStatus = statusResp.status === 'completed' ? 'completed' as const : 'failed' as const;
                      applyForProject(projectId, (prev) => ({
                        ...prev,
                        pipelineFiles: {
                          ...prev.pipelineFiles,
                          [connId]: (prev.pipelineFiles[connId] || []).map((pp) =>
                            pp.name === pipelineName ? { ...pp, runStatus: finalStatus } : pp
                          ),
                        },
                      }));
                      try { await updateRunStatus(projectId, { item_name: uploadItemName, run_status: finalStatus, job_id: jobId }); } catch { /* ignore */ }
                      return;
                    }
                  } catch { /* keep polling */ }
                }
              })();
            }
          }
        }
      }

      // Reconcile any pipelines that were left 'running' and may have
      // finished (or failed) while this page/tab was closed — fired AFTER
      // the fast local-only render above, not before it, so this live
      // Fabric check never delays Config Step's first paint. Only bothers
      // calling the live endpoint at all if the DB actually has something
      // marked 'running' to verify.
      const hasAnyRunning =
        mapped.some((p) => p.runStatus === 'running') ||
        Object.values(saved).some((s) => s.run_status === 'running');
      if (projectId && hasAnyRunning) {
        syncPipelineStatus(projectId).then((sync) => {
          const changed = sync.pipelines.filter((p) => toRunStatus(p.new_status));
          if (changed.length === 0) return;
          applyForProject(projectId, (prev) => {
            const applyTo = (list: PipelineItem[]) =>
              list.map((pp) => {
                const match = changed.find((c) => c.item_name === pp.name || c.item_name === pp.uploadItemName);
                return match ? { ...pp, runStatus: toRunStatus(match.new_status)! } : pp;
              });
            const nextPipelineFiles = { ...prev.pipelineFiles };
            for (const cid of Object.keys(nextPipelineFiles)) nextPipelineFiles[cid] = applyTo(nextPipelineFiles[cid]);
            const nextItlPipelineFiles = { ...prev.itlPipelineFiles };
            for (const cid of Object.keys(nextItlPipelineFiles)) nextItlPipelineFiles[cid] = applyTo(nextItlPipelineFiles[cid]);
            return { ...prev, pipelineFiles: nextPipelineFiles, itlPipelineFiles: nextItlPipelineFiles };
          });
        }).catch(() => { /* non-fatal */ });
      }

      return true;
    } catch (e: any) {
      if (requestId === pipelinesRequestIdRef.current) {
        applyForProject(projectId, (prev) => ({ ...prev, configLoading: { ...prev.configLoading, [connId]: false }, error: e.message }));
      }
      return false;
    }
  }, [projectId, applyForProject]);

  const uploadPipelinesToFabric = useCallback(
    async (connectionName: string, connectionIndex: number, filenames?: string[], appMode: 'fabric' | 'finin' = 'fabric') => {
      if (!projectId) return false;
      const currentState = stateRef.current;
      const selectedConn = currentState.connections.find((c) => c.id === currentState.selectedConnection);
      const connId = selectedConn?.id ?? '';
      setState((prev) => ({
        ...prev, error: null,
        pipelineFiles: {
          ...prev.pipelineFiles,
          [connId]: (prev.pipelineFiles[connId] || []).map((p) =>
            p.uploadStatus === 'pending' && (!filenames || filenames.includes(p.filename)) ? { ...p, uploadStatus: 'uploading' as const } : p
          ),
        },
      }));
      try {
        const resp = await uploadPipelines(projectId, {
          connection_name: connectionName,
          connection_index: connectionIndex,
          db_type: selectedConn?.databaseType,
          filenames,
          app_mode: appMode,
        });
        applyForProject(projectId, (prev) => {
          const existing = prev.pipelineFiles[connId] || [];
          const matchedFilenames = new Set<string>();
          const updated = existing.map((p) => {
            const match = resp.results.find((r: any) => r.filename === p.filename || r.name === p.name || isUploadMatch(r.name, p.name, p.filename, connectionName));
            if (match) {
              matchedFilenames.add(match.filename || match.name);
              return { ...p, uploadStatus: match.status === 'success' ? 'success' as const : 'failed' as const, error: match.error, fabricItemId: match.id, runStatus: 'not-started' as const };
            }
            return p;
          });
          // Any deploy result that didn't match an already-known template
          // (e.g. a db-type-specific file like 01_PL_SQL_ConfigCreation
          // that wasn't in the initially-fetched list) still really
          // deployed to Fabric — surface it instead of dropping it, which
          // is what previously left it invisible until a page refresh.
          const unmatched = resp.results
            .filter((r: any) => !matchedFilenames.has(r.filename || r.name))
            .map((r: any) => ({
              filename: r.filename || `${r.name}.json`,
              name: r.name,
              sizeBytes: 0,
              uploadStatus: r.status === 'success' ? 'success' as const : 'failed' as const,
              error: r.error,
              fabricItemId: r.id,
              runStatus: 'not-started' as const,
            }));
          return {
            ...prev,
            pipelineFiles: { ...prev.pipelineFiles, [connId]: [...updated, ...unmatched] },
          };
        });
        return true;
      } catch (e: any) {
        applyForProject(projectId, (prev) => ({
          ...prev, error: e.message,
          pipelineFiles: {
            ...prev.pipelineFiles,
            [connId]: (prev.pipelineFiles[connId] || []).map((p) =>
              p.uploadStatus === 'uploading' ? { ...p, uploadStatus: 'failed' as const, error: e.message } : p
            ),
          },
        }));
        return false;
      }
    },
    [projectId, applyForProject],
  );

  const updateMedallionLayer = (
    key: 'bronze' | 'silver' | 'gold',
    updates: Partial<{ name: string; validated: boolean }>
  ) => {
    setState((prev) => ({
      ...prev,
      medallionLayers: prev.medallionLayers.map((layer) =>
        layer.key === key ? { ...layer, ...updates } : layer
      ),
    }));
  };

  const updateConfigTask = (taskId: string, status: ConfigTask['status']) => {
    setState((prev) => ({
      ...prev,
      configTasks: prev.configTasks.map((task) =>
        task.id === taskId ? { ...task, status } : task
      ),
    }));
  };

  const updatePipeline = (pipelineId: string, status: Pipeline['status']) => {
    setState((prev) => ({
      ...prev,
      pipelines: prev.pipelines.map((pipeline) =>
        pipeline.id === pipelineId ? { ...pipeline, status } : pipeline
      ),
    }));
  };

  /**
   * Fetch deployed pipelines from the Fabric workspace.
   */
  const fetchWorkspacePipelines = useCallback(async () => {
    if (!projectId) return false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const items = await listWorkspacePipelines(projectId);
      // Sort: MetaDataConfig first, then alphabetically
      const sorted = [...items].sort((a, b) => {
        const aIsMeta = a.name.includes('MetaDataConfig');
        const bIsMeta = b.name.includes('MetaDataConfig');
        if (aIsMeta && !bIsMeta) return -1;
        if (bIsMeta && !aIsMeta) return 1;
        return a.name.localeCompare(b.name);
      });
      const mapped: Pipeline[] = sorted.map((p, i) => ({
        id: String(i + 1),
        name: p.name,
        fabricItemId: p.id,
        status: 'not-started' as const,
      }));
      applyForProject(projectId, (prev) => ({ ...prev, loading: false, pipelines: mapped }));
      return true;
    } catch (e: any) {
      applyForProject(projectId, (prev) => ({ ...prev, loading: false, error: e.message }));
      return false;
    }
  }, [projectId, applyForProject]);

  /**
   * Run a deployed pipeline in Fabric and poll for completion.
   */
  const runFabricPipelineAction = useCallback(
    async (pipelineId: string) => {
      if (!projectId) return false;

      const pipeline = state.pipelines.find((p) => p.id === pipelineId);
      if (!pipeline?.fabricItemId) return false;

      // Mark as running
      setState((prev) => ({
        ...prev,
        pipelines: prev.pipelines.map((p) =>
          p.id === pipelineId ? { ...p, status: 'running' as const } : p
        ),
      }));

      try {
        const result = await runFabricPipeline(projectId, pipeline.fabricItemId);
        const jobId = result.job_id;

        // Store the jobId
        applyForProject(projectId, (prev) => ({
          ...prev,
          pipelines: prev.pipelines.map((p) =>
            p.id === pipelineId ? { ...p, jobId } : p
          ),
        }));

        // Check right away in case it's already done, then poll fast —
        // previously this waited a full 30s before the very first check and
        // polled every 30s after, so the UI could sit on "Running" for a
        // long time after Fabric had already moved to Succeeded/Failed.
        const pollInterval = 5_000; // 5 seconds
        const maxPolls = 240; // up to 20 minutes
        for (let i = 0; i < maxPolls; i++) {
          if (i > 0) await new Promise((r) => setTimeout(r, pollInterval));
          try {
            const statusResp = await getPipelineJobStatus(
              projectId,
              pipeline.fabricItemId,
              jobId,
            );
            if (statusResp.status === 'completed') {
              applyForProject(projectId, (prev) => ({
                ...prev,
                pipelines: prev.pipelines.map((p) =>
                  p.id === pipelineId ? { ...p, status: 'completed' as const } : p
                ),
              }));
              return true;
            }
            if (['failed', 'error', 'cancelled'].includes(statusResp.status)) {
              const errMsg = statusResp.error || `Pipeline ${statusResp.status}`;
              applyForProject(projectId, (prev) => ({
                ...prev,
                error: errMsg,
                pipelines: prev.pipelines.map((p) =>
                  p.id === pipelineId ? { ...p, status: 'failed' as const } : p
                ),
              }));
              console.error(`Pipeline job failed:`, errMsg);
              return false;
            }
            // still in_progress, keep polling
          } catch {
            // polling error, keep trying
          }
        }

        // Timed out
        applyForProject(projectId, (prev) => ({
          ...prev,
          pipelines: prev.pipelines.map((p) =>
            p.id === pipelineId ? { ...p, status: 'failed' as const } : p
          ),
          error: 'Pipeline run timed out',
        }));
        return false;
      } catch (e: any) {
        applyForProject(projectId, (prev) => ({
          ...prev,
          pipelines: prev.pipelines.map((p) =>
            p.id === pipelineId ? { ...p, status: 'failed' as const } : p
          ),
          error: e.message,
        }));
        return false;
      }
    },
    [projectId, state.pipelines, applyForProject],
  );

  /**
   * Run a deployed pipeline using PipelineItem's fabricItemId (no workspace fetch needed).
   */
  const runPipelineFromFiles = useCallback(
    async (pipelineName: string) => {
      if (!projectId) return false;

      const s = stateRef.current;
      const connId = s.selectedConnection ?? '';
      const pf = (s.pipelineFiles[connId] || []).find((p) => p.name === pipelineName);
      if (!pf?.fabricItemId) return false;
      // Already running (or already finished) — never re-trigger. This
      // check alone isn't enough to close the reload race (see below), but
      // it does stop accidental double-clicks/re-renders within the same
      // session from firing a second job.
      if (pf.runStatus === 'running' || pf.runStatus === 'completed') return false;

      // The backend's config_uploads row may be keyed under a
      // connection-prefixed name (see PipelineItem.uploadItemName).
      // Use that for status PATCHes or the lookup 404s.
      const uploadItemName = pf.uploadItemName ?? pipelineName;

      const epoch = connectionEpochRef.current;

      const updatePipeline = (runStatus: PipelineItem['runStatus'], extra?: Partial<PipelineItem>) =>
        applyForProject(projectId, (prev) => ({
          ...prev,
          pipelineFiles: {
            ...prev.pipelineFiles,
            [connId]: (prev.pipelineFiles[connId] || []).map((p) =>
              p.name === pipelineName ? { ...p, runStatus, ...extra } : p
            ),
          },
        }));

      updatePipeline('running');
      // Persist 'running' BEFORE triggering the actual Fabric run — not
      // after. Previously this was persisted only once runFabricPipeline's
      // response came back, which left a window (network round-trip time)
      // where a reload saw this pipeline as 'not-started' in the DB even
      // though it either was about to run or already had — so on reload the
      // auto-run effect saw "not-started" and triggered ANOTHER Fabric job
      // for the same pipeline. Persisting first (job_id still unknown at
      // this point) means a reload during that same window at least sees
      // 'running' and won't re-trigger, even before we have a job_id yet.
      try { await updateRunStatus(projectId, { item_name: uploadItemName, run_status: 'running' }); } catch { /* non-fatal */ }

      try {
        const result = await runFabricPipeline(projectId, pf.fabricItemId);
        const jobId = result.job_id;
        if (connectionEpochRef.current !== epoch) return false;
        updatePipeline('running', { jobId });
        // Persist the real job id now that we have it — needed to resume-poll
        // (rather than just display "running") after a reload.
        try { await updateRunStatus(projectId, { item_name: uploadItemName, run_status: 'running', job_id: jobId }); } catch { /* non-fatal, resume-poll/sync will still catch up later */ }

        // Check right away in case it finished fast, then poll every 5s
        // instead of every 30s — previously the UI could sit on "Running"
        // for a long time after Fabric had already moved to Succeeded/Failed.
        const pollInterval = 5_000;
        const maxPolls = 240;
        for (let i = 0; i < maxPolls; i++) {
          if (i > 0) await new Promise((r) => setTimeout(r, pollInterval));
          if (connectionEpochRef.current !== epoch) return false;
          try {
            const statusResp = await getPipelineJobStatus(projectId, pf.fabricItemId, jobId);
            if (connectionEpochRef.current !== epoch) return false;
            if (statusResp.status === 'completed') {
              updatePipeline('completed');
              try { await updateRunStatus(projectId, { item_name: uploadItemName, run_status: 'completed', job_id: jobId }); } catch { /* ignore */ }
              return true;
            }
            if (['failed', 'error', 'cancelled'].includes(statusResp.status)) {
              const errMsg = statusResp.error || `Pipeline ${statusResp.status}`;
              applyForProject(projectId, (prev) => ({ ...prev, error: errMsg }));
              updatePipeline('failed');
              try { await updateRunStatus(projectId, { item_name: uploadItemName, run_status: 'failed', job_id: jobId }); } catch { /* ignore */ }
              return false;
            }
          } catch { /* polling error, keep trying */ }
        }

        if (connectionEpochRef.current === epoch) {
          updatePipeline('failed');
          applyForProject(projectId, (prev) => ({ ...prev, error: 'Pipeline run timed out' }));
          try { await updateRunStatus(projectId, { item_name: uploadItemName, run_status: 'failed', job_id: jobId }); } catch { /* ignore */ }
        }
        return false;
      } catch (e: any) {
        if (connectionEpochRef.current === epoch) {
          updatePipeline('failed');
          applyForProject(projectId, (prev) => ({ ...prev, error: e.message }));
          try { await updateRunStatus(projectId, { item_name: uploadItemName, run_status: 'failed' }); } catch { /* ignore */ }
        }
        return false;
      }
    },
    [projectId, applyForProject],
  );

  // ── ITL Actions ─────────────────────────────────────────────────────

  const downloadItlConfigExcel = useCallback(async () => {
    if (!projectId) return false;
    const selectedConn = state.connections.find((c) => c.id === state.selectedConnection);
    if (!selectedConn) return false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const blob = await downloadItlConfig(projectId, selectedConn.name);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ITL_Config_${selectedConn.name}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      applyForProject(projectId, (prev) => ({ ...prev, loading: false, itlConfigDownloaded: { ...prev.itlConfigDownloaded, [selectedConn.id]: true } }));
      return true;
    } catch (e: any) {
      applyForProject(projectId, (prev) => ({ ...prev, loading: false, error: e.message }));
      return false;
    }
  }, [projectId, state.connections, state.selectedConnection, applyForProject]);

  const uploadItlConfigExcel = useCallback(async (file: File) => {
    if (!projectId) return false;
    const selectedConn = state.connections.find((c) => c.id === state.selectedConnection);
    if (!selectedConn) return false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      await uploadItlConfig(projectId, selectedConn.name, file);
      applyForProject(projectId, (prev) => ({ ...prev, loading: false, itlConfigUploaded: { ...prev.itlConfigUploaded, [selectedConn.id]: true } }));
      return true;
    } catch (e: any) {
      applyForProject(projectId, (prev) => ({ ...prev, loading: false, error: e.message }));
      return false;
    }
  }, [projectId, state.connections, state.selectedConnection, applyForProject]);

  

  const uploadItlPipelinesToFabric = useCallback(async (connectionName: string, connectionIndex: number) => {
    if (!projectId) return false;
    const currentState = stateRef.current;
    const selectedConn = currentState.connections.find((c) => c.id === currentState.selectedConnection);
    const connId = selectedConn?.id ?? '';
    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      itlPipelineFiles: {
        ...prev.itlPipelineFiles,
        [connId]: (prev.itlPipelineFiles[connId] || []).map((p) =>
          p.uploadStatus === 'pending' ? { ...p, uploadStatus: 'uploading' as const } : p
        ),
      },
    }));
    try {
      const resp = await uploadItlPipelines(projectId, {
        connection_name: connectionName,
        connection_index: connectionIndex,
      });
      applyForProject(projectId, (prev) => {
        const updated = resp.results.map((r) => ({
          filename: r.name + '.json',
          name: r.name,
          sizeBytes: 0,
          uploadStatus: r.status === 'success' ? 'success' as const : 'failed' as const,
          error: r.error,
          fabricItemId: r.id,
        }));
        return { ...prev, loading: false, itlPipelineFiles: { ...prev.itlPipelineFiles, [connId]: updated } };
      });
      const anyFailed = resp.results.some((r) => r.status !== 'success');
      return !anyFailed;
    } catch (e: any) {
      applyForProject(projectId, (prev) => ({
        ...prev,
        loading: false,
        error: e.message,
        itlPipelineFiles: {
          ...prev.itlPipelineFiles,
          [connId]: (prev.itlPipelineFiles[connId] || []).map((p) =>
            p.uploadStatus === 'uploading' ? { ...p, uploadStatus: 'failed' as const, error: e.message } : p
          ),
        },
      }));
      return false;
    }
  }, [projectId, applyForProject]);

  const runItlNotebook = useCallback(async (notebookName?: string) => {
    if (!projectId) return null;
    const currentState = stateRef.current;
    const matchedConn = notebookName ? currentState.connections.find((c) => c.name === notebookName) : undefined;
    const connId = matchedConn?.id ?? currentState.selectedConnection ?? '';
    // Ensure we always clear previous success state before retrying
    setState((prev) => ({ ...prev, loading: true, error: null, itlNotebookRunStatus: { ...prev.itlNotebookRunStatus, [connId]: null } }));

    // Notebooks are uploaded as "{connection}_01_NB_IncrementalConfigCreation"
    const name = notebookName
      ? (notebookName.includes('IncrementalConfigCreation') ? notebookName : `${notebookName}_01_NB_IncrementalConfigCreation`)
      : '01_NB_IncrementalConfigCreation';

    try {
      const resp = await runItlNotebookApi(projectId, name);
      const jobId = resp?.job_id;
      if (!jobId) throw new Error('No job_id returned from notebook run');


      // Poll until terminal state
      const POLL_INTERVAL = 10_000;
      const MAX_POLLS = 60; // 10 min max
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        try {
          const status = await getItlNotebookStatus(projectId, name, jobId);
          const s = status?.status?.toLowerCase() ?? '';
          if (s === 'completed' || s === 'succeeded' || s === 'success') {
            applyForProject(projectId, (prev) => ({ ...prev, loading: false, itlNotebookRunStatus: { ...prev.itlNotebookRunStatus, [connId]: 'success' } }));
            return resp;
          }
          if (s === 'failed' || s === 'cancelled' || s === 'canceled') {
            throw new Error(`Notebook job ${s}: ${status?.error ?? ''}`);
          }
          // still running — continue polling
        } catch (pollErr: any) {
          if (pollErr.message?.startsWith('Notebook job')) throw pollErr;
          // transient fetch error — keep polling
        }
      }
      throw new Error('Notebook timed out after 10 minutes');
    } catch (e: any) {
      applyForProject(projectId, (prev) => ({ ...prev, loading: false, itlNotebookRunStatus: { ...prev.itlNotebookRunStatus, [connId]: 'failed' }, error: e.message }));
      return null;
    }
  }, [projectId, applyForProject]);

  /**
   * Deploy the bundled ims-schema stored procedure script to WH_Gold.
   * Starts a background job and polls its status until done/failed,
   * invoking `onProgress` (batch count, total, message) along the way so
   * the UI can drive a live progress bar instead of just spinning for the
   * ~90 batches this script runs.
   */
  const deployGoldStoredProcedures = useCallback(async (
    onProgress?: (progress: number, total: number, message: string) => void
  ) => {
    if (!projectId) throw new Error('No active project');
    const { job_id, total } = await startDeployGoldStoredProceduresApi(projectId);
    onProgress?.(0, total, 'Starting deployment…');

    while (true) {
      await new Promise((r) => setTimeout(r, 1000));
      const status = await getDeployGoldStoredProceduresStatusApi(projectId, job_id);
      onProgress?.(status.progress, status.total, status.message);
      if (status.status === 'done' && status.result) return status.result;
      if (status.status === 'failed') throw new Error(status.message || 'Deployment failed');
    }
  }, [projectId]);

  /**
   * Create [MasterExecuter].[sp_GoldExecute] in WH_Gold. Small script, runs
   * synchronously — no progress bar needed for this part.
   */
  const deployMasterExecutor = useCallback(async () => {
    if (!projectId) throw new Error('No active project');
    return deployMasterExecutorApi(projectId);
  }, [projectId]);

  /**
   * Run [MasterExecuter].[sp_GoldExecute] (executes every active procedure
   * from Config_Gold.finin_gold_sp_details) as a background job, polling for
   * live per-SP progress the same way deployGoldStoredProcedures does.
   */
  const executeMasterSp = useCallback(async (
    silverLakehouse?: string,
    onProgress?: (progress: number, total: number, message: string) => void
  ) => {
    if (!projectId) throw new Error('No active project');
    const { job_id, total } = await startExecuteMasterSpApi(projectId, silverLakehouse);
    onProgress?.(0, total, 'Starting execution…');

    while (true) {
      await new Promise((r) => setTimeout(r, 1500));
      const status = await getExecuteMasterSpStatusApi(projectId, job_id);
      onProgress?.(status.progress, status.total, status.message);
      if (status.status === 'done' && status.result) return status.result;
      if (status.status === 'failed') {
        const err: any = new Error(status.message || 'Master SP execution failed');
        err.result = status.result;
        throw err;
      }
    }
  }, [projectId]);

  /**
   * Upload the Tables/Relationships/Measures workbook — parsed and stored
   * server-side, ready for buildSemanticModel to pick up.
   */
  const uploadSemanticModelExcel = useCallback(async (file: File) => {
    if (!projectId) throw new Error('No active project');
    return uploadSemanticModelExcelApi(projectId, file);
  }, [projectId]);

  /**
   * Restore semantic-model Config-page state (uploaded Excel + last build
   * status) after a reload, the same idea as getItlConfigStatus.
   */
  const fetchSemanticModelStatus = useCallback(async () => {
    if (!projectId) return null;
    return getSemanticModelStatusApi(projectId);
  }, [projectId]);

  /**
   * Build (or rebuild) the semantic model from the previously-uploaded
   * Excel: reads live table schemas from WH_Gold, assembles the TMSL
   * definition, and creates/updates the Semantic Model item in Fabric —
   * as a background job, polled the same way executeMasterSp is.
   */
  const buildSemanticModel = useCallback(async (
    onProgress?: (progress: number, total: number, message: string) => void
  ) => {
    if (!projectId) throw new Error('No active project');
    const { job_id, total } = await startBuildSemanticModelApi(projectId);
    onProgress?.(0, total, 'Starting…');

    while (true) {
      await new Promise((r) => setTimeout(r, 1500));
      const status = await getBuildSemanticModelStatusApi(projectId, job_id);
      onProgress?.(status.progress, status.total, status.message);
      if (status.status === 'done' && status.result) return status.result;
      if (status.status === 'failed') throw new Error(status.message || 'Semantic model build failed');
    }
  }, [projectId]);

  /**
   * Run a single deployed ITL pipeline by name (from itlPipelineFiles), polling until done.
   */
  const runItlPipeline = useCallback(
    async (pipelineName: string) => {
      if (!projectId) return false;
      const s = stateRef.current;
      // Resolve the owning connection from the pipeline's name prefix (not just
      // "selectedConnection") so a long-running poll stays correct even if the
      // user switches to a different source connection while it's in flight.
      const matchedConn = s.connections.find((c) => pipelineName === c.name || pipelineName.startsWith(`${c.name}_`));
      const connId = matchedConn?.id ?? s.selectedConnection ?? '';
      const pf = (s.itlPipelineFiles[connId] || []).find((p) => p.name === pipelineName);
      if (!pf?.fabricItemId) {
        applyForProject(projectId, (prev) => ({ ...prev, error: `Pipeline '${pipelineName}' is not deployed yet` }));
        return false;
      }
      if (pf.runStatus === 'running' || pf.runStatus === 'completed') return false;

      const updateItlPipeline = (runStatus: PipelineItem['runStatus'], extra?: Partial<PipelineItem>) =>
        applyForProject(projectId, (prev) => ({
          ...prev,
          itlPipelineFiles: {
            ...prev.itlPipelineFiles,
            [connId]: (prev.itlPipelineFiles[connId] || []).map((p) =>
              p.name === pipelineName ? { ...p, runStatus, ...extra } : p
            ),
          },
        }));

      updateItlPipeline('running');
      // Persist 'running' BEFORE triggering — same reload-race fix as
      // runPipelineFromFiles above (see its comment for the full story).
      try { await updateRunStatus(projectId, { item_name: pipelineName, run_status: 'running' }); } catch { /* non-fatal */ }

      try {
        const result = await runFabricPipeline(projectId, pf.fabricItemId);
        const jobId = result.job_id;
        updateItlPipeline('running', { jobId });
        // Persist immediately so a refresh mid-run can be restored/resumed
        // instead of showing the pipeline as never having been run.
        try { await updateRunStatus(projectId, { item_name: pipelineName, run_status: 'running', job_id: jobId }); } catch { /* non-fatal */ }

        // Check right away in case it finished fast, then poll every 5s
        // instead of every 15s — previously the UI could sit on "Running"
        // for a long time after Fabric had already moved to Succeeded/Failed.
        const pollInterval = 5_000;
        const maxPolls = 180; // up to 15 minutes
        for (let i = 0; i < maxPolls; i++) {
          if (i > 0) await new Promise((r) => setTimeout(r, pollInterval));
          try {
            const statusResp = await getPipelineJobStatus(projectId, pf.fabricItemId, jobId);
            if (statusResp.status === 'completed') {
              updateItlPipeline('completed');
              try { await updateRunStatus(projectId, { item_name: pipelineName, run_status: 'completed', job_id: jobId }); } catch { /* ignore */ }
              return true;
            }
            if (['failed', 'error', 'cancelled'].includes(statusResp.status)) {
              const errMsg = statusResp.error || `Pipeline ${statusResp.status}`;
              updateItlPipeline('failed');
              try { await updateRunStatus(projectId, { item_name: pipelineName, run_status: 'failed', job_id: jobId }); } catch { /* ignore */ }
              applyForProject(projectId, (prev) => ({ ...prev, error: errMsg }));
              return false;
            }
            // still in_progress, keep polling
          } catch { /* transient poll error — keep polling */ }
        }

        updateItlPipeline('failed');
        applyForProject(projectId, (prev) => ({ ...prev, error: `Pipeline '${pipelineName}' run timed out` }));
        return false;
      } catch (e: any) {
        updateItlPipeline('failed');
        applyForProject(projectId, (prev) => ({ ...prev, error: e.message }));
        return false;
      }
    },
    [projectId, applyForProject],
  );

  /**
   * Run the post-deployment ITL pipelines in strict order:
   * 01_PL_WatermarkUpdate -> 02_PL_Master pipeline.
   * (06_PL_MailTrigger is temporarily removed from the sequence — see
   * ITL_RUN_SEQUENCE below.)
   * Master pipeline internally invokes 03_PL_InvokePipeline, which in turn
   * invokes 04_PL_IncrementalSourceToBronze and 05_PL_SourceDelete — those
   * three aren't triggered directly here. Stops at the first failure.
   *
   * These names must match exactly what upload_itl_pipelines() actually
   * deploys to Fabric (the "name" field inside each pipeline's JSON
   * template, connection-prefixed) — not a shorthand. Getting this wrong
   * means runItlPipeline() can never find the deployed item and every run
   * fails immediately with "is not deployed yet", even though it is.
   */
  // TEMP: '06_PL_MailTrigger' removed from the sequence while the pipeline is
  // failing (it was marking the whole run as failed). The pipeline is still
  // deployed to Fabric — it's just not triggered or shown in the UI. Add
  // '06_PL_MailTrigger' back here (and un-hide it in ConfigStep) to restore.
  const ITL_RUN_SEQUENCE = ['01_PL_WatermarkUpdate', '02_PL_Master pipeline'];

  // Child pipelines invoked internally BY the master pipeline (via its
  // "Invoke Pipeline" activities) rather than run directly by us. Fabric
  // still tracks a job instance for each of them individually, so we can
  // poll each one's own latest status and flip it to "completed" the
  // moment Fabric says so — instead of the UI leaving them stuck on
  // "Running"/pending until the whole master pipeline finishes.
  const ITL_INNER_PIPELINE_SUFFIXES = [
    '03_PL_InvokePipeline',
    '04_PL_IncrementalSourceToBronze',
    '05_PL_SourceDelete',
  ];

  /** Poll a single inner/child pipeline's own job status until it reaches a
   * terminal state, independent of the parent pipeline's own run. Safe to
   * fire-and-forget in parallel with the parent's polling loop. */
  const pollInnerPipelineStatus = useCallback(
    async (connId: string, pipelineName: string) => {
      if (!projectId) return;
      const pf = (stateRef.current.itlPipelineFiles[connId] || []).find((p) => p.name === pipelineName);
      if (!pf?.fabricItemId) return;
      if (pf.runStatus === 'completed' || pf.runStatus === 'failed') return;

      const updateInner = (runStatus: PipelineItem['runStatus']) =>
        applyForProject(projectId, (prev) => ({
          ...prev,
          itlPipelineFiles: {
            ...prev.itlPipelineFiles,
            [connId]: (prev.itlPipelineFiles[connId] || []).map((p) =>
              p.name === pipelineName ? { ...p, runStatus } : p
            ),
          },
        }));

      const pollInterval = 5_000;
      const maxPolls = 180; // up to 15 minutes, matches the parent's own timeout
      for (let i = 0; i < maxPolls; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, pollInterval));
        try {
          const resp = await getLatestItemJobStatus(projectId, pf.fabricItemId);
          if (resp.status === 'completed') {
            updateInner('completed');
            try { await updateRunStatus(projectId, { item_name: pipelineName, run_status: 'completed', job_id: resp.job_id }); } catch { /* ignore */ }
            return;
          }
          if (['failed', 'error', 'cancelled'].includes(resp.status)) {
            updateInner('failed');
            try { await updateRunStatus(projectId, { item_name: pipelineName, run_status: 'failed', job_id: resp.job_id }); } catch { /* ignore */ }
            return;
          }
          if (resp.status === 'in_progress') {
            updateInner('running');
          }
          // 'not-started'/'unknown' — parent hasn't reached this activity
          // yet, keep waiting without flipping the badge to "running".
        } catch { /* transient poll error — keep trying */ }
      }
    },
    [projectId, applyForProject],
  );

  const runItlPipelineSequence = useCallback(
    async (connectionName: string, resumeFromFailed?: boolean) => {
      let order = ITL_RUN_SEQUENCE.map((suffix) => `${connectionName}_${suffix}`);

      if (resumeFromFailed) {
        const connIdForResume = stateRef.current.connections.find((c) => c.name === connectionName)?.id
          ?? stateRef.current.selectedConnection ?? '';
        const files = stateRef.current.itlPipelineFiles[connIdForResume] || [];
        // Resume at the first step in the sequence that isn't already
        // 'completed' — this is Fabric's own "rerun from failed activity"
        // semantics applied to *our* run sequence: everything before the
        // failure is left alone, the run picks back up at (and re-attempts)
        // the step that broke. Fabric doesn't expose a public REST API for
        // true in-pipeline activity-level resume, so re-running our own
        // failed step is the closest honest equivalent achievable here.
        const resumeIdx = order.findIndex((name) => {
          const pf = files.find((p) => p.name === name);
          return pf?.runStatus !== 'completed';
        });
        if (resumeIdx > 0) order = order.slice(resumeIdx);
      }

      let connId = '';
      for (const name of order) {
        if (name === `${connectionName}_02_PL_Master pipeline`) {
          connId = stateRef.current.connections.find((c) => c.name === connectionName)?.id
            ?? stateRef.current.selectedConnection ?? '';
          // Fire-and-forget: these poll independently and update their own
          // rows as soon as Fabric reports each one done, in parallel with
          // (not blocked on) the master pipeline's own completion below.
          ITL_INNER_PIPELINE_SUFFIXES.forEach((suffix) => {
            void pollInnerPipelineStatus(connId, `${connectionName}_${suffix}`);
          });
        }
        const ok = await runItlPipeline(name);
        if (!ok) return false;
        if (name === `${connectionName}_02_PL_Master pipeline` && projectId && connId) {
          // Safety net: the master pipeline cannot report success if an
          // activity it invoked (03/04/05) actually failed, so once it's
          // done, any inner pipeline still sitting at 'not-started' or
          // 'running' here just means our own polling hasn't caught up
          // (or hit a transient API error) — not that it's still going.
          // Reconcile them to 'completed' rather than leaving the badge
          // stuck indefinitely.
          applyForProject(projectId, (prev) => ({
            ...prev,
            itlPipelineFiles: {
              ...prev.itlPipelineFiles,
              [connId]: (prev.itlPipelineFiles[connId] || []).map((p) =>
                ITL_INNER_PIPELINE_SUFFIXES.some((suf) => p.name === `${connectionName}_${suf}`)
                  && p.runStatus !== 'completed' && p.runStatus !== 'failed'
                  ? { ...p, runStatus: 'completed' as const }
                  : p
              ),
            },
          }));
        }
      }
      return true;
    },
    [runItlPipeline, pollInnerPipelineStatus, projectId, applyForProject],
  );

  return {
    state,
    setCurrentStep,
    updateWorkspace,
    updateCredentials,
    addConnection,
    selectConnection,
    updateMedallionLayer,
    updateConfigTask,
    updatePipeline,
    updateWarehouseName,
    fetchCredentialsFromBackend,
    saveCredentialsToBackend,
    provisionWorkspaceToBackend,
    addConnectionToBackend,
    createMedallionInBackend,
    createMetadataInBackend,
    createLogInBackend,
    fetchNotebooks,
    uploadNotebooksToFabric,
    fetchPipelineFiles,
    uploadPipelinesToFabric,
    fetchWorkspacePipelines,
    runFabricPipelineAction,
    runPipelineFromFiles,
    downloadItlConfigExcel,
    uploadItlConfigExcel,
    uploadItlPipelinesToFabric,
    runItlNotebook,
    runItlPipeline,
    runItlPipelineSequence,
    deployGoldStoredProcedures,
    deployMasterExecutor,
    executeMasterSp,
    uploadSemanticModelExcel,
    fetchSemanticModelStatus,
    buildSemanticModel,
    clearError,
  };
};