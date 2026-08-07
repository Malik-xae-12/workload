/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Play, Loader2, CheckCircle2, Database, FileText, XCircle, Workflow, Lock, Download, Upload, FileSpreadsheet, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { SourceConnection, ConfigTask, NotebookItem, PipelineItem } from '../../types';
import { useEffect, useState, useRef, type JSX } from 'react';
import { uploadBlobConfig } from '../../../../layouts/services/fabricApi';

interface ConfigStepProps {
  projectId: string;
  connections: SourceConnection[];
  connectionsLoading?: boolean;
  selectedConnection: string | null;
  configTasks: ConfigTask[];
  notebooks: Record<string, NotebookItem[]>;
  pipelineFiles: Record<string, PipelineItem[]>;
  /** Which accelerator this wizard instance is running as — set once, from
   * the sidebar (Fabric Accelerator vs Finin Accelerator), not per-connection. */
  appMode: 'fabric' | 'finin';
  /** Finin-only: true once the currently-selected connection's mapping has
   * already been saved to SourceInformationSchemaMapped. When true, the
   * "Go to AI Mapping" prompt stays hidden — the user already did it and
   * was routed back here. */
  isConnectionMapped?: boolean;
  onSelectConnection: (id: string) => void;
  onRunTask: (taskId: string) => void;
  onFetchNotebooks: (dbType?: string, connectionId?: string) => void;
  onUploadNotebooks: (connectionName: string, connectionIndex: number, filenames?: string[], appMode?: 'fabric' | 'finin') => void;
  onFetchPipelines: (dbType?: string, connectionId?: string, skipItlStatus?: boolean) => void;
  onUploadPipelines: (connectionName: string, connectionIndex: number, filenames?: string[], appMode?: 'fabric' | 'finin') => void;
  onRunPipeline: (pipelineName: string) => void;
  // ITL props — keyed by connection id, same shape as notebooks/pipelineFiles
  itlConfigDownloaded: Record<string, boolean>;
  itlConfigUploaded: Record<string, boolean>;
  itlPipelineFiles: Record<string, PipelineItem[]>;
  itlStatusChecked: Record<string, boolean>; 

  onDownloadItlConfig: () => Promise<boolean>;
  onUploadItlConfig: (file: File) => Promise<boolean>;
  onUploadItlPipelines: (connectionName: string, connectionIndex: number) => Promise<boolean>;
  onRunItlNotebook: (connectionName: string) => Promise<boolean>;
  onRunItlPipelines: (connectionName: string) => Promise<boolean>;
  itlNotebookRunStatus: Record<string, string | null>;
  onDeployGoldStoredProcedures: (
    onProgress?: (progress: number, total: number, message: string) => void
  ) => Promise<{ batches_executed: number; procedures_deployed: number; database: string; sp_details_recorded?: number }>;
  onDeployMasterExecutor: () => Promise<{ batches_executed: number; database: string }>;
  onExecuteMasterSp: (
    silverLakehouse?: string,
    onProgress?: (progress: number, total: number, message: string) => void
  ) => Promise<{ batch_id: number; database: string; done: number; succeeded: number; failed: number; failed_names: string[] }>;
  /** Finin-only: upload the Tables/Relationships/Measures workbook that
   * drives semantic-model creation. */
  onUploadSemanticModelExcel: (file: File) => Promise<{
    filename: string; tables_count: number; relationships_count: number; measures_count: number; uploaded_at: string;
  }>;
  /** Finin-only: restore uploaded-Excel / last-build state after a reload. */
  onFetchSemanticModelStatus: () => Promise<{
    excel: { filename: string; tables_count: number; relationships_count: number; measures_count: number; uploaded_at: string } | null;
    build: { status: string; fabric_item_id: string | null; job_id: string | null; display_name: string } | null;
  } | null>;
  /** Finin-only: build (or rebuild) the semantic model from the uploaded Excel. */
  onBuildSemanticModel: (
    onProgress?: (progress: number, total: number, message: string) => void
  ) => Promise<{ display_name: string; fabric_item_id: string | null; workspace_id: string; tables: number; relationships: number; measures: number }>;
  loading: boolean;
  configLoading: Record<string, boolean>;
  /** Finin-only: jump to the AI Mapping page (to build
   * SourceInformationSchemaMapped) after Config Files finish, before
   * Bronze/Silver. Not used in Fabric mode. */
  onGoToAIMapping?: () => void;
}

export const ConfigStep = ({
  connections,
  connectionsLoading,
  selectedConnection,
  configTasks,
  notebooks,
  pipelineFiles,
  appMode,
  isConnectionMapped,
  onSelectConnection,
  onRunTask,
  onFetchNotebooks,
  onUploadNotebooks,
  onFetchPipelines,
  onUploadPipelines,
  onRunPipeline,
  itlConfigDownloaded,
  itlConfigUploaded,
  itlPipelineFiles,
  onDownloadItlConfig,
  onUploadItlConfig,
  onUploadItlPipelines,
  onRunItlNotebook,
  onRunItlPipelines,
  itlNotebookRunStatus,
  onDeployGoldStoredProcedures,
  onDeployMasterExecutor,
  onExecuteMasterSp,
  onUploadSemanticModelExcel,
  onFetchSemanticModelStatus,
  onBuildSemanticModel,
  loading,
  configLoading,
  onGoToAIMapping,
  projectId,
}: ConfigStepProps) => {
  const selectedConn = connections.find((c) => c.id === selectedConnection);
  const connIndex = selectedConn ? connections.indexOf(selectedConn) + 1 : 1;

  // Slice per-connection arrays — each connection is fully independent
  const connNotebooks: NotebookItem[] = (selectedConnection ? notebooks[selectedConnection] : undefined) ?? [];
  const connPipelineFiles: PipelineItem[] = (selectedConnection ? pipelineFiles[selectedConnection] : undefined) ?? [];
  const connConfigLoading = selectedConnection ? (configLoading as Record<string, boolean>)[selectedConnection] ?? false : false;
  // Same slicing for ITL state — without this, ITL status leaked across sources
  // (e.g. showing "Done"/"Deployed" for a source that was never run) whenever
  // more than one connection existed in the workspace.
  const connItlConfigDownloaded = selectedConnection ? itlConfigDownloaded[selectedConnection] ?? false : false;
  const connItlConfigUploaded = selectedConnection ? itlConfigUploaded[selectedConnection] ?? false : false;
  const connItlPipelineFiles: PipelineItem[] = (selectedConnection ? itlPipelineFiles[selectedConnection] : undefined) ?? [];
  // TEMP: MailTrigger pipeline is hidden from the UI (and skipped in the run
  // sequence — see ITL_RUN_SEQUENCE in useSetupStore) while it's failing, so a
  // demo run isn't shown as failed by it. Remove this filter to restore it.
  const visibleItlPipelineFiles: PipelineItem[] = connItlPipelineFiles.filter(
    (p) => !p.name.includes('06_PL_MailTrigger')
  );
  // All ITL pipelines (excluding the temporarily hidden MailTrigger) created
  // successfully for the selected connection — gates the two WH_Gold SP cards.
  const allItlPipelinesCreated =
    visibleItlPipelineFiles.length > 0 && visibleItlPipelineFiles.every((p) => p.uploadStatus === 'success');
  const connItlNotebookRunStatus = (selectedConnection ? itlNotebookRunStatus[selectedConnection] : undefined) ?? '';

  const [notebooksUploadingMap, setNotebooksUploadingMap] = useState<Record<string, boolean>>({});
  const [pipelinesUploadingMap, setPipelinesUploadingMap] = useState<Record<string, boolean>>({});
  const [blobConfigStatusMap, setBlobConfigStatusMap] = useState<Record<string, 'idle' | 'loading' | 'success'>>({});
  const notebooksUploading = selectedConnection ? !!notebooksUploadingMap[selectedConnection] : false;
  const pipelinesUploading = selectedConnection ? !!pipelinesUploadingMap[selectedConnection] : false;
  const blobConfigStatus = selectedConnection ? blobConfigStatusMap[selectedConnection] ?? 'idle' : 'idle';
  const pendingPipelineDeployMap = useRef<Record<string, boolean>>({});
  const autoRunTriggeredMap = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (selectedConnection && connections.length > 0) {
      const conn = connections.find((c) => c.id === selectedConnection);
      const dbType = conn?.databaseType;
      // Already have this connection's artifacts from an earlier fetch this
      // session — reuse them instead of round-tripping to the backend again
      // every time the user flips between connections (or comes back from
      // AI Mapping). Live updates (deploy/run) still land via applyForProject
      // directly, so this cache never goes stale mid-session.
      const haveNotebooks = (notebooks[selectedConnection]?.length ?? 0) > 0;
      const havePipelines = (pipelineFiles[selectedConnection]?.length ?? 0) > 0;
      if (!haveNotebooks) onFetchNotebooks(dbType, selectedConnection);
      if (!havePipelines) onFetchPipelines(dbType, selectedConnection, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConnection, connections.length]);

  const isBlob = selectedConn?.databaseType?.toLowerCase() === 'azure blob';
  const allNotebooksDone = isBlob ? blobConfigStatus === 'success' : (connNotebooks.length === 0 || connNotebooks.every((nb) => nb.uploadStatus === 'success'));
  const allPipelinesDone = connPipelineFiles.length > 0 && connPipelineFiles.every((p) => p.uploadStatus === 'success');
  const anyNotebookUploading = connNotebooks.some((nb) => nb.uploadStatus === 'uploading');
  const anyPipelineUploading = connPipelineFiles.some((p) => p.uploadStatus === 'uploading');

  // Sort pipelines: MetaDataConfig first
  const sortedPipelineFiles = [...connPipelineFiles].sort((a, b) => {
    const aIsMeta = a.name.includes('MetaDataConfig');
    const bIsMeta = b.name.includes('MetaDataConfig');
    if (aIsMeta && !bIsMeta) return -1;
    if (bIsMeta && !aIsMeta) return 1;
    return a.name.localeCompare(b.name);
  });

  const allPipelinesRan = connPipelineFiles.length > 0 && connPipelineFiles.every((p) => p.runStatus === 'completed');
  const anyPipelineRunning = connPipelineFiles.some((p) => p.runStatus === 'running');

  // Auto-trigger pipeline deploy after notebooks finish (scoped to the connection that started it)
  useEffect(() => {
    if (
      selectedConnection &&
      pendingPipelineDeployMap.current[selectedConnection] &&
      allNotebooksDone &&
      !anyNotebookUploading &&
      !notebooksUploading
    ) {
      pendingPipelineDeployMap.current[selectedConnection] = false;
      deployPipelines();
    }
  }, [allNotebooksDone, anyNotebookUploading, notebooksUploading, selectedConnection]);

  // Guards the actual moment we decide to auto-trigger a run. Keyed by
  // "connId:pipelineName" and set the instant we call onRunPipeline —
  // synchronously, before any state update/re-render happens. Without
  // this, two effects that both look for "the next eligible pipeline"
  // (or the same effect re-entering before its own state write lands,
  // e.g. under React StrictMode's dev double-invoke) can both observe
  // the same pipeline as still 'not-started' and BOTH call
  // onRunPipeline for it — which is exactly why 02_PL_SourceToBronze
  // (or whichever pipeline is next in line at that moment) was ending up
  // running twice per deploy, even though runPipelineFromFiles's own
  // guard checks runStatus first: that check is on state that hasn't
  // been updated yet in the second, near-simultaneous call.
  const autoRunPipelineGuardRef = useRef<Set<string>>(new Set());
  const triggerAutoRun = (connId: string, pf: PipelineItem) => {
    const key = `${connId}:${pf.name}`;
    if (autoRunPipelineGuardRef.current.has(key)) return;
    autoRunPipelineGuardRef.current.add(key);
    onRunPipeline(pf.name);
  };

  // Auto-run MetaDataConfig after all pipelines deployed (scoped to the current connection)
  useEffect(() => {
    if (!selectedConnection) return;
    if (allPipelinesDone && !anyPipelineRunning && !autoRunTriggeredMap.current[selectedConnection]) {
      const metadata = sortedPipelineFiles.find((p) => p.name.includes('MetaDataConfig'));
      if (metadata?.fabricItemId && !metadata.runStatus) {
        autoRunTriggeredMap.current[selectedConnection] = true;
        triggerAutoRun(selectedConnection, metadata);
      }
    }
  }, [allPipelinesDone, selectedConnection]);

  // Auto-run next pipeline after previous completes
  useEffect(() => {
    if (!allPipelinesDone) return;
    for (let i = 0; i < sortedPipelineFiles.length; i++) {
      const pf = sortedPipelineFiles[i];
      if (pf.runStatus === 'completed') continue;
      if (pf.runStatus === 'running') break;
      if (i === 0 || sortedPipelineFiles[i - 1].runStatus === 'completed') {
        if (pf.fabricItemId && (!pf.runStatus || pf.runStatus === 'not-started') && selectedConnection) {
          triggerAutoRun(selectedConnection, pf);
        }
      }
      break;
    }
  }, [connPipelineFiles.map(p => p.runStatus).join(',')]);

  const deployInFlightMap = useRef<Record<string, boolean>>({});

  const deployPipelines = async () => {
    if (!selectedConn) return;
    const connId = selectedConn.id;
    if (deployInFlightMap.current[connId]) return;
    deployInFlightMap.current[connId] = true;
    setPipelinesUploadingMap((prev) => ({ ...prev, [connId]: true }));
    onRunTask('2');
    try {
      await onUploadPipelines(selectedConn.name, connIndex);
    } finally {
      setPipelinesUploadingMap((prev) => ({ ...prev, [connId]: false }));
      deployInFlightMap.current[connId] = false;
    }
  };

  const handleRunNotebooks = async () => {
    if (!selectedConn) return;
    const connId = selectedConn.id;
    setNotebooksUploadingMap((prev) => ({ ...prev, [connId]: true }));
    pendingPipelineDeployMap.current[connId] = true;
    onRunTask('1');
    try {
      await onUploadNotebooks(selectedConn.name, connIndex);
    } finally {
      setNotebooksUploadingMap((prev) => ({ ...prev, [connId]: false }));
    }
  };

  const handleUploadBlobConfig = async () => {
    if (!selectedConn) return;
    const connId = selectedConn.id;
    setBlobConfigStatusMap((prev) => ({ ...prev, [connId]: 'loading' }));
    
    try {
      const res = await uploadBlobConfig(projectId!);
      if (res.status === 'success') {
        toast.success(res.message);
        setBlobConfigStatusMap((prev) => ({ ...prev, [connId]: 'success' }));
      } else {
        throw new Error(res.message);
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to upload Blob Config');
      setBlobConfigStatusMap((prev) => ({ ...prev, [connId]: 'idle' }));
    }
  };


  const handleDeployPipelines = async () => {
    await deployPipelines();
  };

  // ── Finin mode: paired "Config Files" → "Bronze / Silver" artifact groups.
  // Fabric mode keeps the original bulk create-all-notebooks-then-all-pipelines
  // flow above; Finin mode creates+deploys one notebook/pipeline pair at a
  // time. State here is keyed per-connection, same pattern as the maps above,
  // so switching connections never shows stale progress from a different one.
  const isConfigCreationItem = (name: string) => name.toLowerCase().includes('configcreation');
  const group1Notebooks = connNotebooks.filter((nb) => isConfigCreationItem(nb.name));
  const group1Pipelines = sortedPipelineFiles.filter((p) => isConfigCreationItem(p.name));
  const group2Notebooks = connNotebooks.filter((nb) => !isConfigCreationItem(nb.name));
  const group2Pipelines = sortedPipelineFiles.filter((p) => !isConfigCreationItem(p.name));

  const group1NotebooksDone = group1Notebooks.length > 0 && group1Notebooks.every((nb) => nb.uploadStatus === 'success');
  const group1PipelinesDone = group1Pipelines.length > 0 && group1Pipelines.every((p) => p.uploadStatus === 'success');
  // "Created" (uploaded) is not the same as "executed". The AI Mapping prompt
  // should only appear once 01_PL_SQL_ConfigCreation has actually been run —
  // gate on runStatus, not just uploadStatus.
  const group1PipelinesRan = group1Pipelines.length > 0 && group1Pipelines.every((p) => p.runStatus === 'completed');
  const group1AnyNotebookUploading = group1Notebooks.some((nb) => nb.uploadStatus === 'uploading');
  const group2NotebooksDone = group2Notebooks.length > 0 && group2Notebooks.every((nb) => nb.uploadStatus === 'success');
  const group2PipelinesDone = group2Pipelines.length > 0 && group2Pipelines.every((p) => p.uploadStatus === 'success');
  const group2AnyNotebookUploading = group2Notebooks.some((nb) => nb.uploadStatus === 'uploading');

  const [group1NotebooksUploadingMap, setGroup1NotebooksUploadingMap] = useState<Record<string, boolean>>({});
  const [group1PipelinesUploadingMap, setGroup1PipelinesUploadingMap] = useState<Record<string, boolean>>({});
  const [group2NotebooksUploadingMap, setGroup2NotebooksUploadingMap] = useState<Record<string, boolean>>({});
  const [group2PipelinesUploadingMap, setGroup2PipelinesUploadingMap] = useState<Record<string, boolean>>({});
  const group1NotebooksUploading = selectedConnection ? !!group1NotebooksUploadingMap[selectedConnection] : false;
  const group1PipelinesUploading = selectedConnection ? !!group1PipelinesUploadingMap[selectedConnection] : false;
  const group2NotebooksUploading = selectedConnection ? !!group2NotebooksUploadingMap[selectedConnection] : false;
  const group2PipelinesUploading = selectedConnection ? !!group2PipelinesUploadingMap[selectedConnection] : false;
  const group1PendingDeployMap = useRef<Record<string, boolean>>({});
  const group2PendingDeployMap = useRef<Record<string, boolean>>({});

  const handleGroup1Create = async () => {
    if (!selectedConn || group1Notebooks.length === 0) return;
    const connId = selectedConn.id;
    setGroup1NotebooksUploadingMap((prev) => ({ ...prev, [connId]: true }));
    group1PendingDeployMap.current[connId] = true;
    onRunTask('1');
    try {
      await onUploadNotebooks(selectedConn.name, connIndex, group1Notebooks.map((nb) => nb.filename), 'finin');
    } finally {
      setGroup1NotebooksUploadingMap((prev) => ({ ...prev, [connId]: false }));
    }
  };
  const handleGroup1Deploy = async () => {
    if (!selectedConn || group1Pipelines.length === 0) return;
    const connId = selectedConn.id;
    if (deployInFlightMap.current[`g1:${connId}`]) return;
    deployInFlightMap.current[`g1:${connId}`] = true;
    setGroup1PipelinesUploadingMap((prev) => ({ ...prev, [connId]: true }));
    onRunTask('2');
    try {
      await onUploadPipelines(selectedConn.name, connIndex, group1Pipelines.map((p) => p.filename), 'finin');
    } finally {
      setGroup1PipelinesUploadingMap((prev) => ({ ...prev, [connId]: false }));
      deployInFlightMap.current[`g1:${connId}`] = false;
    }
  };
  const handleGroup2Create = async () => {
    if (!selectedConn || group2Notebooks.length === 0 || !group1PipelinesDone) return;
    const connId = selectedConn.id;
    setGroup2NotebooksUploadingMap((prev) => ({ ...prev, [connId]: true }));
    group2PendingDeployMap.current[connId] = true;
    onRunTask('1');
    try {
      await onUploadNotebooks(selectedConn.name, connIndex, group2Notebooks.map((nb) => nb.filename), 'finin');
    } finally {
      setGroup2NotebooksUploadingMap((prev) => ({ ...prev, [connId]: false }));
    }
  };
  const handleGroup2Deploy = async () => {
    if (!selectedConn || group2Pipelines.length === 0) return;
    const connId = selectedConn.id;
    if (deployInFlightMap.current[`g2:${connId}`]) return;
    deployInFlightMap.current[`g2:${connId}`] = true;
    setGroup2PipelinesUploadingMap((prev) => ({ ...prev, [connId]: true }));
    onRunTask('2');
    try {
      await onUploadPipelines(selectedConn.name, connIndex, group2Pipelines.map((p) => p.filename), 'finin');
    } finally {
      setGroup2PipelinesUploadingMap((prev) => ({ ...prev, [connId]: false }));
      deployInFlightMap.current[`g2:${connId}`] = false;
    }
  };

  // Auto-deploy each group's pipeline(s) right after its own notebook(s) finish creating.
  useEffect(() => {
    if (
      selectedConnection &&
      group1PendingDeployMap.current[selectedConnection] &&
      group1NotebooksDone &&
      !group1AnyNotebookUploading &&
      !group1NotebooksUploading
    ) {
      group1PendingDeployMap.current[selectedConnection] = false;
      handleGroup1Deploy();
    }
  }, [group1NotebooksDone, group1AnyNotebookUploading, group1NotebooksUploading, selectedConnection]);

  useEffect(() => {
    if (
      selectedConnection &&
      group2PendingDeployMap.current[selectedConnection] &&
      group2NotebooksDone &&
      !group2AnyNotebookUploading &&
      !group2NotebooksUploading
    ) {
      group2PendingDeployMap.current[selectedConnection] = false;
      handleGroup2Deploy();
    }
  }, [group2NotebooksDone, group2AnyNotebookUploading, group2NotebooksUploading, selectedConnection]);

  // handleGroup1Deploy/handleGroup2Deploy are auto-triggered from inside a
  // useEffect below, which only runs AFTER the render where notebooksDone
  // flips true — so there's one render in between where the button showed
  // idle, clickable "Deploy" even though pipeline deploy was about to start
  // (and did start, moments later). group1PendingDeployMap is set true
  // synchronously the instant Create is clicked and only cleared once
  // handleGroup1Deploy actually runs, so reading it here bridges that gap.
  const group1PipelineAutoPending = !!(
    selectedConnection && group1PendingDeployMap.current[selectedConnection] && group1NotebooksDone && !group1PipelinesDone
  );
  const group2PipelineAutoPending = !!(
    selectedConnection && group2PendingDeployMap.current[selectedConnection] && group2NotebooksDone && !group2PipelinesDone
  );

  // Overall Pipelines section status label
  const pipelineOverallLabel = allPipelinesRan
    ? 'Done'
    : anyPipelineRunning
    ? 'Running'
    : allPipelinesDone
    ? 'Deployed'
    : 'Pending';

  return (
    <div className="max-w-3xl">
      {appMode === 'finin' ? (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">Finin Accelerator — Financial Data Setup</h1>
          </div>
          <p className="text-[13px] text-slate-500 mt-1">
            Source config lands first, then Bronze/Silver — Finin's mapping step needs that data in place before it can match your source columns to the financial template.
          </p>
        </div>
      ) : (
        <div className="mb-5">
          <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">Configuration Setup</h1>
          <p className="text-[13px] text-slate-500 mt-1">
            Select a connection, then deploy notebooks and pipelines to Fabric.
          </p>
        </div>
      )}


      {/* Connection Selection */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-slate-700 mb-3">Select Connection</h3>
        {connections.length === 0 && connectionsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-pulse" aria-label="Loading connections">
            <div className="h-20 bg-slate-100 rounded-xl" />
            <div className="h-20 bg-slate-100 rounded-xl" />
          </div>
        ) : connections.length === 0 ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center">
            <p className="text-sm text-slate-500">No connections available. Add one in the Source step.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {connections.map((conn) => (
              <button
                key={conn.id}
                onClick={() => onSelectConnection(conn.id)}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  selectedConnection === conn.id
                    ? 'border-emerald-500 bg-emerald-50/50'
                    : 'border-slate-200 bg-white hover:border-emerald-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    selectedConnection === conn.id ? 'bg-emerald-600' : 'bg-slate-100'
                  }`}>
                    <Database size={18} className={selectedConnection === conn.id ? 'text-white' : 'text-slate-500'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-slate-900 mb-0.5">{conn.name}</h4>
                    <p className="text-xs text-slate-500 truncate">{conn.databaseType} • {conn.server}</p>
                  </div>
                  {selectedConnection === conn.id && <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedConnection && (
        <div className="space-y-5">
          {appMode === 'finin' ? (
            <>
              <ArtifactGroupCard
                title="Config Files"
                rows={[
                  ...group1Notebooks.map((nb) => ({ key: `nb-${nb.filename}`, name: nb.name, kind: 'Notebook' as const, uploadStatus: nb.uploadStatus })),
                  ...group1Pipelines.map((p) => ({ key: `pl-${p.filename}`, name: p.name, kind: 'Pipeline' as const, uploadStatus: p.uploadStatus, runStatus: p.runStatus, fabricItemId: p.fabricItemId })),
                ]}
                locked={false}
                loading={loading || connConfigLoading || !!connectionsLoading}
                notebooksExist={group1Notebooks.length > 0}
                pipelinesExist={group1Pipelines.length > 0}
                notebooksDone={group1NotebooksDone}
                pipelinesDone={group1PipelinesDone}
                notebooksUploading={group1NotebooksUploading || group1AnyNotebookUploading}
                pipelinesUploading={group1PipelinesUploading || group1PipelineAutoPending}
                onCreate={handleGroup1Create}
                onDeploy={handleGroup1Deploy}
                onRunPipeline={onRunPipeline}
              />

              {group1PipelinesRan && !connConfigLoading && (
                isConnectionMapped ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-4">
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[13px] font-bold text-emerald-900">Source columns mapped</p>
                        <p className="text-[11px] text-emerald-700 mt-0.5">
                          <code>SourceInformationSchemaMapped</code> is built for{' '}
                          <span className="font-semibold">{selectedConn?.name}</span>. You can review or adjust it any time.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onGoToAIMapping}
                      disabled={!onGoToAIMapping}
                      className="shrink-0 flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-all"
                    >
                      View Mapping →
                    </button>
                  </div>
                ) : (
                  <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[13px] font-bold text-teal-900">Map source columns before Bronze/Silver</p>
                      <p className="text-[11px] text-teal-700 mt-0.5">
                        Head to AI Mapping to build <code>SourceInformationSchemaMapped</code> for{' '}
                        <span className="font-semibold">{selectedConn?.name}</span> — 01_NB_BronzeToSilver reads from it
                        instead of SourceInformationSchema. You'll return here automatically once it's saved.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onGoToAIMapping}
                      disabled={!onGoToAIMapping}
                      className="shrink-0 flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-all"
                    >
                      Go to AI Mapping →
                    </button>
                  </div>
                )
              )}

              <ArtifactGroupCard
                title="Bronze / Silver"
                rows={[
                  ...group2Notebooks.map((nb) => ({ key: `nb-${nb.filename}`, name: nb.name, kind: 'Notebook' as const, uploadStatus: nb.uploadStatus })),
                  ...group2Pipelines.map((p) => ({ key: `pl-${p.filename}`, name: p.name, kind: 'Pipeline' as const, uploadStatus: p.uploadStatus, runStatus: p.runStatus, fabricItemId: p.fabricItemId })),
                ]}
                locked={appMode === 'finin' ? !isConnectionMapped : !group1PipelinesDone}
                loading={loading || connConfigLoading || !!connectionsLoading}
                notebooksExist={group2Notebooks.length > 0}
                pipelinesExist={group2Pipelines.length > 0}
                notebooksDone={group2NotebooksDone}
                pipelinesDone={group2PipelinesDone}
                notebooksUploading={group2NotebooksUploading || group2AnyNotebookUploading}
                pipelinesUploading={group2PipelinesUploading || group2PipelineAutoPending}
                onCreate={handleGroup2Create}
                onDeploy={handleGroup2Deploy}
                onRunPipeline={onRunPipeline}
              />
            </>
          ) : (
          <>
          {/* Notebooks */}
          {selectedConn?.databaseType?.toLowerCase() !== 'azure blob' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2">
                <FileText size={15} className="text-emerald-600" />
                <h3 className="text-[13px] font-bold text-slate-700">Notebooks</h3>
              </div>
              <button
                onClick={handleRunNotebooks}
                disabled={loading || notebooksUploading || allNotebooksDone || connNotebooks.length === 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                  allNotebooksDone
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50'
                }`}
              >
                {allNotebooksDone ? (
                  <><CheckCircle2 size={12} /> Created</>
                ) : notebooksUploading || anyNotebookUploading ? (
                  <><Loader2 size={12} className="animate-spin" /> Creating...</>
                ) : (
                  <><Upload size={12} /> Create</>
                )}
              </button>
            </div>
            {connConfigLoading ? (
              <div className="p-4">
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-4 px-5 py-3 animate-pulse">
                      <div className="w-6 h-6 bg-slate-200 rounded" />
                      <div className="flex-1">
                        <div className="h-3 bg-slate-200 rounded w-1/3 mb-2" />
                        <div className="h-2 bg-slate-200 rounded w-1/6" />
                      </div>
                      <div className="w-20 h-3 bg-slate-200 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            ) : connNotebooks.length === 0 ? (
              <div className="p-8 text-center">
                <FileText size={24} className="text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500">No notebooks found</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="border-b border-slate-100">
                  <tr>
                    <th className="px-5 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Name</th>
                    <th className="px-5 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {connNotebooks.map((nb) => (
                    <tr key={nb.filename} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <FileText size={13} className="text-slate-400" />
                          <span className="text-[12px] font-medium text-slate-800">{nb.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {nb.uploadStatus === 'success' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 size={11} /> Created</span>
                        ) : nb.uploadStatus === 'uploading' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600"><Loader2 size={11} className="animate-spin" /> Creating</span>
                        ) : nb.uploadStatus === 'failed' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600"><XCircle size={11} /> Failed</span>
                        ) : (
                          <span className="text-[10px] font-bold text-amber-600">Not Created</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          )}

          {/* Blob Configuration */}
          {selectedConn?.databaseType?.toLowerCase() === 'azure blob' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm mb-6">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2">
                <FileText size={15} className="text-emerald-600" />
                <h3 className="text-[13px] font-bold text-slate-700">Blob Configuration</h3>
              </div>
              <button
                onClick={handleUploadBlobConfig}
                disabled={loading || blobConfigStatus === 'loading' || blobConfigStatus === 'success'}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                  blobConfigStatus === 'success'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50'
                }`}
              >
                {blobConfigStatus === 'success' ? (
                  <><CheckCircle2 size={12} /> Generated</>
                ) : blobConfigStatus === 'loading' ? (
                  <><Loader2 size={12} className="animate-spin" /> Generating...</>
                ) : (
                  <><Upload size={12} /> Generate & Upload</>
                )}
              </button>
            </div>
            <div className="p-5 flex flex-col justify-center items-center text-center">
              <Database size={24} className="text-slate-300 mb-2" />
              <p className="text-sm text-slate-600">
                Discover the folder structure in the Azure Blob Storage container and upload the schema (<code>blob_config.json</code>) to the Bronze Lakehouse.
              </p>
              <p className="text-xs text-slate-400 mt-2">
                The pipeline will read this configuration to know which folders to process.
              </p>
            </div>
          </div>
          )}

          {/* Pipelines */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2">
                <Workflow size={15} className="text-emerald-600" />
                <h3 className="text-[13px] font-bold text-slate-700">Pipelines</h3>
              </div>
              <div className="flex items-center gap-2">
                {allPipelinesRan ? (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-50 text-emerald-700">
                    <CheckCircle2 size={12} /> Done
                  </span>
                ) : (
                  <button
                    onClick={handleDeployPipelines}
                    disabled={loading || pipelinesUploading || allPipelinesDone || connPipelineFiles.length === 0 || notebooksUploading || (!allNotebooksDone && !allPipelinesDone)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                      allPipelinesDone
                        ? 'bg-emerald-50 text-emerald-700'
                        : (notebooksUploading || (!allNotebooksDone && !allPipelinesDone))
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50'
                    }`}
                  >
                    {allPipelinesDone ? (
                      <><CheckCircle2 size={12} /> Created</>
                    ) : pipelinesUploading || anyPipelineUploading ? (
                      <><Loader2 size={12} className="animate-spin" /> Creating...</>
                    ) : notebooksUploading ? (
                      <><Lock size={12} /> Waiting for Notebooks</>
                    ) : !allNotebooksDone ? (
                      <><Lock size={12} /> Create Notebooks First</>
                    ) : (
                      <><Upload size={12} /> Create</>
                    )}
                  </button>
                )}
              </div>
            </div>
            {connConfigLoading ? (
              <div className="p-4">
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4 px-5 py-3 animate-pulse">
                      <div className="w-6 h-6 bg-slate-200 rounded" />
                      <div className="flex-1">
                        <div className="h-3 bg-slate-200 rounded w-1/2 mb-2" />
                        <div className="h-2 bg-slate-200 rounded w-1/4" />
                      </div>
                      <div className="w-28 h-3 bg-slate-200 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            ) : connPipelineFiles.length === 0 ? (
              <div className="p-8 text-center">
                <Workflow size={24} className="text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500">No pipelines found</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="border-b border-slate-100">
                  <tr>
                    <th className="px-5 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Name</th>
                    <th className="px-5 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    {allPipelinesDone && (
                      <th className="px-5 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Run</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sortedPipelineFiles.map((pl, i) => {
                    const prevDone = i === 0 || sortedPipelineFiles[i - 1].runStatus === 'completed';
                    const isLocked = !prevDone && (!pl.runStatus || pl.runStatus === 'not-started');
                    return (
                      <tr key={pl.filename} className="hover:bg-slate-50/50" style={pl.runStatus === 'running' ? { background: '#f0f7ff' } : {}}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <Workflow size={13} className="text-slate-400" />
                            <span className="text-[12px] font-medium text-slate-800">{pl.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          {pl.uploadStatus === 'success' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 size={11} /> Created</span>
                          ) : pl.uploadStatus === 'uploading' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600"><Loader2 size={11} className="animate-spin" /> Creating</span>
                          ) : pl.uploadStatus === 'failed' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600"><XCircle size={11} /> Failed</span>
                          ) : (
                            <span className="text-[10px] font-bold text-amber-600">Not Created</span>
                          )}
                        </td>
                        {(pl.uploadStatus === 'success' || pl.runStatus) && (
                          <td className="px-5 py-3">
                            {pl.runStatus === 'completed' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 size={11} /> Done</span>
                            ) : pl.runStatus === 'running' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600"><Loader2 size={11} className="animate-spin" /> Running</span>
                            ) : pl.runStatus === 'failed' ? (
                              <button
                                onClick={() => onRunPipeline(pl.name)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-md bg-red-600 text-white hover:bg-red-700 transition-all"
                              >
                                <Play size={10} /> Retry
                              </button>
                            ) : isLocked ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400"><Lock size={10} /> Waiting</span>
                            ) : pl.uploadStatus === 'success' ? (
                              <button
                                onClick={() => onRunPipeline(pl.name)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-all"
                              >
                                <Play size={10} /> Run
                              </button>
                            ) : null}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          </>
          )}

          {/* ITL Configuration Section – shown after all OTL pipelines run */}
          {allPipelinesRan && (
            <ItlSection
              key={selectedConn!.id}
              loading={loading}
              connectionName={selectedConn!.name}
              itlConfigDownloaded={connItlConfigDownloaded}
              itlConfigUploaded={connItlConfigUploaded}
              itlPipelineFiles={visibleItlPipelineFiles}
              onDownloadItlConfig={onDownloadItlConfig}
              onUploadItlConfig={onUploadItlConfig}
              onUploadItlPipelines={() => onUploadItlPipelines(selectedConn!.name, connIndex)}
              onRunItlNotebook={onRunItlNotebook}
              onRunItlPipelines={() => onRunItlPipelines(selectedConn!.name)}
              itlNotebookRunStatus={connItlNotebookRunStatus}
            />
          )}

          {/* Gold stored procedures — finin-only. Independent of any one source
              connection's ITL run, so it lives as its own section rather
              than nested inside (and re-mounted per-connection by) ItlSection.
              Both SP sections stay greyed out (disabled) until every ITL
              pipeline for the selected connection has been created successfully. */}
          {appMode === 'finin' && allPipelinesRan && (
            <GoldStoredProceduresSection
              onDeployGoldStoredProcedures={onDeployGoldStoredProcedures}
              disabled={!allItlPipelinesCreated}
            />
          )}

          {appMode === 'finin' && allPipelinesRan && (
            <MasterExecuteSection
              onDeployMasterExecutor={onDeployMasterExecutor}
              onExecuteMasterSp={onExecuteMasterSp}
              disabled={!allItlPipelinesCreated}
            />
          )}

          {/* Semantic Model — Finin-only: upload the Tables/Relationships/
              Measures workbook, then build the semantic model against
              WH_Gold. Independent section, same placement rationale as the
              Gold SP / Master Execute sections above. */}
          {appMode === 'finin' && allPipelinesRan && (
            <SemanticModelSection
              onUploadExcel={onUploadSemanticModelExcel}
              onFetchStatus={onFetchSemanticModelStatus}
              onBuild={onBuildSemanticModel}
              disabled={!allItlPipelinesCreated}
            />
          )}
        </div>
      )}
    </div>
  );
};

// ── Finin artifact group (paired Notebook + Pipeline, one stage at a time) ──

interface ArtifactRow {
  key: string;
  name: string;
  kind: 'Notebook' | 'Pipeline';
  uploadStatus: 'pending' | 'uploading' | 'success' | 'failed';
  runStatus?: PipelineItem['runStatus'];
  fabricItemId?: string;
}

interface ArtifactGroupCardProps {
  title: string;
  rows: ArtifactRow[];
  locked: boolean;
  loading: boolean;
  notebooksExist: boolean;
  pipelinesExist: boolean;
  notebooksDone: boolean;
  pipelinesDone: boolean;
  notebooksUploading: boolean;
  pipelinesUploading: boolean;
  onCreate: () => void;
  onDeploy: () => void;
  onRunPipeline: (pipelineName: string) => void;
}

const ArtifactGroupCard = ({
  title, rows, locked, loading, notebooksExist, pipelinesExist,
  notebooksDone, pipelinesDone, notebooksUploading, pipelinesUploading,
  onCreate, onDeploy, onRunPipeline,
}: ArtifactGroupCardProps): JSX.Element => {
  const bothDone = (!notebooksExist || notebooksDone) && (!pipelinesExist || pipelinesDone);
  const pipelineRows = rows.filter((r) => r.kind === 'Pipeline');
  // Fully complete = artifacts created AND (for pipelines) actually run to
  // completion — not just deployed. Collapsing on bothDone alone left the
  // full table (with Run/Retry buttons) visible even after everything had
  // finished, which looked like the stage was still asking the user to act.
  const fullyComplete = bothDone && (pipelineRows.length === 0 || pipelineRows.every((r) => r.runStatus === 'completed'));
  const [showDetails, setShowDetails] = useState(true);

  // Auto-run each deployed pipeline in this group once it's ready, one at a
  // time — same chained pattern as the Fabric-mode Pipelines table (a row
  // only auto-runs once the previous one in the group has completed).
  useEffect(() => {
    if (!pipelinesDone) return;
    for (let i = 0; i < pipelineRows.length; i++) {
      const pr = pipelineRows[i];
      if (pr.runStatus === 'completed') continue;
      if (pr.runStatus === 'running') break;
      const prevDone = i === 0 || pipelineRows[i - 1].runStatus === 'completed';
      if (prevDone && pr.fabricItemId && (!pr.runStatus || pr.runStatus === 'not-started')) {
        onRunPipeline(pr.name);
      }
      break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelinesDone, pipelineRows.map((r) => `${r.key}:${r.runStatus}`).join(',')]);

  return (
    <div className={`bg-white rounded-xl border overflow-hidden shadow-sm ${locked ? 'border-slate-100 opacity-60' : 'border-slate-200'}`}>
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
        <h3 className="text-[13px] font-bold text-slate-700">{title}</h3>
        {fullyComplete ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={12} /> Completed
            </span>
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="text-[11px] font-bold text-teal-600 hover:text-teal-800"
            >
              {showDetails ? 'Hide details' : 'View details'}
            </button>
          </div>
        ) : bothDone ? (
          <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-50 text-emerald-700">
            <CheckCircle2 size={12} /> Done
          </span>
        ) : locked ? (
          <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-slate-100 text-slate-400">
            <Lock size={12} /> Waiting
          </span>
        ) : !notebooksDone ? (
          <button
            onClick={onCreate}
            disabled={loading || notebooksUploading || !notebooksExist}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-all"
          >
            {notebooksUploading ? <><Loader2 size={12} className="animate-spin" /> Creating...</> : <><Upload size={12} /> Create</>}
          </button>
        ) : !pipelinesDone ? (
          <button
            onClick={onDeploy}
            disabled={loading || pipelinesUploading || !pipelinesExist}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-all"
          >
            {pipelinesUploading ? <><Loader2 size={12} className="animate-spin" /> Creating...</> : <><Upload size={12} /> Deploy</>}
          </button>
        ) : null}
      </div>
      {fullyComplete && !showDetails ? null : rows.length === 0 && loading ? (
        <div className="p-5 space-y-2 animate-pulse" aria-label="Loading artifacts">
          <div className="h-3.5 bg-slate-100 rounded w-3/4" />
          <div className="h-3.5 bg-slate-100 rounded w-2/3" />
          <div className="h-3.5 bg-slate-100 rounded w-1/2" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-xs text-slate-500">No artifacts found</p>
        </div>
      ) : (
        <table className="w-full">
          <thead className="border-b border-slate-100">
            <tr>
              <th className="px-5 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Name</th>
              <th className="px-5 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Artifact</th>
              <th className="px-5 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-5 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Run</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((row) => (
              <tr key={row.key} className="hover:bg-slate-50/50" style={row.runStatus === 'running' ? { background: '#f0f7ff' } : {}}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    {row.kind === 'Notebook' ? <FileText size={13} className="text-slate-400" /> : <Workflow size={13} className="text-slate-400" />}
                    <span className="text-[12px] font-medium text-slate-800">{row.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <span className="text-[11px] font-semibold text-slate-500">{row.kind}</span>
                </td>
                <td className="px-5 py-3">
                  {row.uploadStatus === 'success' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 size={11} /> Created</span>
                  ) : row.uploadStatus === 'uploading' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600"><Loader2 size={11} className="animate-spin" /> Creating</span>
                  ) : row.uploadStatus === 'failed' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600"><XCircle size={11} /> Failed</span>
                  ) : locked ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400"><Lock size={11} /> Waiting</span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-600">Not Created</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  {row.kind !== 'Pipeline' ? (
                    <span className="text-[10px] text-slate-300">—</span>
                  ) : row.uploadStatus !== 'success' && !row.runStatus ? (
                    <span className="text-[10px] text-slate-300">—</span>
                  ) : row.runStatus === 'completed' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 size={11} /> Completed</span>
                  ) : row.runStatus === 'running' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600"><Loader2 size={11} className="animate-spin" /> Running</span>
                  ) : row.runStatus === 'failed' ? (
                    <button
                      onClick={() => onRunPipeline(row.name)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-md bg-red-600 text-white hover:bg-red-700 transition-all"
                    >
                      <XCircle size={11} /> Retry
                    </button>
                  ) : (
                    <button
                      onClick={() => onRunPipeline(row.name)}
                      disabled={!row.fabricItemId}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      <Play size={10} /> Run
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// ── ITL Sub-component ─────────────────────────────────────────────────

interface ItlSectionProps {
  loading: boolean;
  connectionName: string;
  itlConfigDownloaded: boolean;
  itlConfigUploaded: boolean;
  itlPipelineFiles: PipelineItem[];
  onDownloadItlConfig: () => Promise<boolean>;
  onUploadItlConfig: (file: File) => Promise<boolean>;
  onUploadItlPipelines: () => Promise<boolean>;
  onRunItlNotebook: (connectionName: string) => Promise<boolean>;
  onRunItlPipelines: () => Promise<boolean>;
  itlNotebookRunStatus: string;
}

const ItlSection = ({
  loading,
  connectionName,
  itlConfigDownloaded,
  itlConfigUploaded,
  itlPipelineFiles,
  onDownloadItlConfig,
  onUploadItlConfig,
  onUploadItlPipelines,
  onRunItlNotebook,
  onRunItlPipelines,
  itlNotebookRunStatus,
}: ItlSectionProps): JSX.Element => {
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [runningNotebook, setRunningNotebook] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoDeployTriggeredRef = useRef(false);

  const notebookRan = itlNotebookRunStatus === 'success';
  const notebookFailed = itlNotebookRunStatus === 'failed';
  const allItlDeployed = itlPipelineFiles.length > 0 && itlPipelineFiles.every((p) => p.uploadStatus === 'success');
  const anyItlFailed = itlPipelineFiles.some((p) => p.uploadStatus === 'failed');
  const [runningPipelines, setRunningPipelines] = useState(false);  // Must match the real Fabric item names from upload_itl_pipelines() exactly
  // (the pipeline JSON's own "name" field, connection-prefixed) — including
  // the "NN_PL_" numbering and the literal space in "Master pipeline". A
  // shorthand here means these never match anything in itlPipelineFiles, so
  // the run-status UI (and the "is not deployed yet" run failure) is wrong
  // even when the pipelines really did deploy and run fine.
  // TEMP: '06_PL_MailTrigger' removed while the pipeline is failing — it's
  // also hidden from the ITL list and skipped by the store's run sequence.
  const RUN_SEQUENCE_SUFFIXES = ['01_PL_WatermarkUpdate', '02_PL_Master pipeline'];
  const runSequenceItems = itlPipelineFiles.filter((p) =>
    RUN_SEQUENCE_SUFFIXES.some((suffix) => p.name === `${connectionName}_${suffix}`)
  );
  const allItlPipelinesRan = runSequenceItems.length === RUN_SEQUENCE_SUFFIXES.length && runSequenceItems.every((p) => p.runStatus === 'completed');
  const anyItlPipelineFailed = runSequenceItems.some((p) => p.runStatus === 'failed');
  // Source of truth for "is a run in flight" — derived from the store's
  // per-pipeline runStatus (itlPipelineFiles), not just the local
  // `runningPipelines` flag below. The local flag alone only reflects this
  // one mounted instance's own in-flight await; it resets to false on
  // remount (switching connections, navigating to AI Mapping and back,
  // etc.) even though the sequence launched via runItlPipelineSequence is
  // still actually running server-side. Checking the persisted statuses
  // too means the button correctly stays "Running" either way.
  const anyItlPipelineRunning = itlPipelineFiles.some((p) => p.runStatus === 'running');

  // Every step for THIS connection done — download, upload, notebook run,
  // pipelines deployed, and the run sequence completed. `key={selectedConn.id}`
  // on ItlSection remounts this component per connection, so showDetails
  // below is naturally isolated per source rather than leaking across them.
  const fullyComplete = itlConfigDownloaded && itlConfigUploaded && notebookRan && allItlDeployed && allItlPipelinesRan;
  const [showDetails, setShowDetails] = useState(true);

  // Auto-deploy ITL pipelines once notebook succeeds
  useEffect(() => {
    if (notebookRan && !allItlDeployed && !deploying && !autoDeployTriggeredRef.current) {
      autoDeployTriggeredRef.current = true;
      setDeploying(true);
      onUploadItlPipelines().then((ok) => {
        setDeploying(false);
        if (ok) toast.success('ITL pipelines deployed');
        else toast.error('Some ITL pipelines failed to deploy');
      });
    }
  }, [notebookRan]);

  const handleDownload = async () => {
    setDownloading(true);
    const ok = await onDownloadItlConfig();
    setDownloading(false);
    if (ok) toast.success('ITL Config Excel downloaded');
    else toast.error('Failed to download ITL config');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ok = await onUploadItlConfig(file);
    setUploading(false);
    if (ok) toast.success('ITL Config uploaded successfully');
    else toast.error('Failed to upload ITL config');
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
        <div className="flex items-center gap-2">
          <Workflow size={15} className="text-emerald-600" />
          <h3 className="text-[13px] font-bold text-slate-700">ITL (Incremental Load)</h3>
        </div>
        <div className="flex items-center gap-2">
          {allItlDeployed && !fullyComplete && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={12} /> Done
            </span>
          )}
          {fullyComplete && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={12} /> Completed
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="text-[11px] font-bold text-emerald-600 hover:text-emerald-800"
          >
            {showDetails ? 'Hide details' : 'View details'}
          </button>
        </div>
      </div>

      {showDetails && (
      <div className="p-5 space-y-4">
        {/* Step 1: Download Excel */}
        <div className="flex items-center gap-4">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${
            itlConfigDownloaded ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-100 text-emerald-700'
          }`}>1</div>
          <div className="flex-1">
            <p className="text-[12px] font-medium text-slate-700">Download ITL Config Excel</p>
            <p className="text-[10px] text-slate-500">OTL config with watermark columns to fill</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={loading || downloading || itlConfigDownloaded}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                itlConfigDownloaded
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50'
              }`}
            >
              {itlConfigDownloaded ? (
                <><CheckCircle2 size={12} /> Downloaded</>
              ) : downloading ? (
                <><Loader2 size={12} className="animate-spin" /> Downloading...</>
              ) : (
                <><Download size={12} /> Download</>
              )}
            </button>

            {itlConfigDownloaded && (
              <button
                type="button"
                onClick={handleDownload}
                disabled={loading || downloading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              >
                <Download size={12} /> Re-download
              </button>
            )}
          </div>
        </div>

        {/* Step 2: Upload Filled Excel */}
        <div className="flex items-center gap-4">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${
            itlConfigUploaded ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-100 text-emerald-700'
          }`}>2</div>
          <div className="flex-1">
            <p className="text-[12px] font-medium text-slate-700">Upload Filled Excel</p>
            <p className="text-[10px] text-slate-500">Fill watermark fields and upload back</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || uploading || itlConfigUploaded}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                itlConfigUploaded
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50'
              }`}
            >
              {itlConfigUploaded ? (
                <><CheckCircle2 size={12} /> Uploaded</>
              ) : uploading ? (
                <><Loader2 size={12} className="animate-spin" /> Uploading...</>
              ) : (
                <><Upload size={12} /> Upload</>
              )}
            </button>

            {itlConfigUploaded && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || uploading}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50`}
              >
                <Upload size={12} /> Re-upload
              </button>
            )}
          </div>
        </div>

        {/* Step 3: Run ITL Notebook */}
        <div className="flex items-center gap-4">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${
            notebookRan ? 'bg-emerald-100 text-emerald-700' : notebookFailed ? 'bg-red-100 text-red-700' : itlConfigUploaded ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
          }`}>3</div>
          <div className="flex-1">
            <p className="text-[12px] font-medium text-slate-700">Run ITL Notebook</p>
            <p className="text-[10px] text-slate-500">Execute incremental config creation notebook</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setRunningNotebook(true);
                const ok = await onRunItlNotebook(connectionName);
                setRunningNotebook(false);
                if (ok) toast.success('ITL Notebook executed');
                else toast.error('Failed to run ITL notebook');
              }}
              disabled={runningNotebook || !itlConfigUploaded || notebookRan}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                notebookRan
                  ? 'bg-emerald-50 text-emerald-700'
                  : notebookFailed
                  ? 'bg-red-50 text-red-700 hover:bg-red-100'
                  : !itlConfigUploaded
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50'
              }`}
            >
              {notebookRan ? (
                <><CheckCircle2 size={12} /> Done</>
              ) : notebookFailed ? (
                <><XCircle size={12} /> Failed – Retry</>
              ) : runningNotebook ? (
                <><Loader2 size={12} className="animate-spin" /> Running...</>
              ) : (
                <><Play size={12} /> Run</>
              )}
            </button>

            {notebookRan && (
              <button
                type="button"
                onClick={async () => {
                  setRunningNotebook(true);
                  const ok = await onRunItlNotebook(connectionName);
                  setRunningNotebook(false);
                  if (ok) toast.success('ITL Notebook re-executed');
                  else toast.error('Failed to re-run ITL notebook');
                }}
                disabled={runningNotebook}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              >
                {runningNotebook ? <><Loader2 size={12} className="animate-spin" /> Running...</> : <><Play size={12} /> Re-run</>}
              </button>
            )}
          </div>
        </div>

        {/* Step 4: Deploy ITL Pipelines – auto-triggered after notebook */}
        <div className="flex items-center gap-4">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${
            allItlDeployed ? 'bg-emerald-100 text-emerald-700' : anyItlFailed ? 'bg-red-100 text-red-700' : notebookRan ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
          }`}>4</div>
          <div className="flex-1">
            <p className="text-[12px] font-medium text-slate-700">Deploy ITL Pipelines</p>
            <p className="text-[10px] text-slate-500">Auto-deployed after notebook completes</p>
          </div>
          {anyItlFailed && !allItlDeployed ? (
            <button
              onClick={() => {
                if (deploying) return;
                setDeploying(true);
                onUploadItlPipelines().then((ok) => {
                  setDeploying(false);
                  if (ok) toast.success('ITL pipelines deployed');
                  else toast.error('Some ITL pipelines failed to deploy');
                });
              }}
              disabled={deploying}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {deploying ? <><Loader2 size={12} className="animate-spin" /> Retrying...</> : <><XCircle size={12} /> Failed – Retry</>}
            </button>
          ) : allItlDeployed ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-50 text-emerald-700">
                <CheckCircle2 size={12} /> Deployed
              </span>
              <button
                type="button"
                onClick={() => {
                  if (deploying) return;
                  setDeploying(true);
                  onUploadItlPipelines().then((ok) => {
                    setDeploying(false);
                    if (ok) toast.success('ITL pipelines redeployed');
                    else toast.error('Some ITL pipelines failed to redeploy');
                  });
                }}
                disabled={deploying || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              >
                {deploying ? <><Loader2 size={12} className="animate-spin" /> Redeploying...</> : <><Upload size={12} /> Redeploy</>}
              </button>
            </div>
          ) : (
            <span className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg ${
              deploying ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
            }`}>
              {deploying ? (
                <><Loader2 size={12} className="animate-spin" /> Deploying...</>
              ) : (
                'Pending'
              )}
            </span>
          )}
        </div>

        {/* Step 5: Run Pipelines – WaterMarkUpdate -> MasterPipeline (MailTrigger temporarily removed) */}
        {allItlDeployed && (
          <div className="flex items-center gap-4 mt-3">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${
              allItlPipelinesRan ? 'bg-emerald-100 text-emerald-700' : anyItlPipelineFailed ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
            }`}>5</div>
            <div className="flex-1">
              <p className="text-[12px] font-medium text-slate-700">Run Pipelines</p>
              <p className="text-[10px] text-slate-500">Runs WaterMarkUpdate → MasterPipeline in order</p>
            </div>
            <button
              type="button"
              onClick={async () => {
                if (runningPipelines || anyItlPipelineRunning) return;
                setRunningPipelines(true);
                const ok = await onRunItlPipelines();
                setRunningPipelines(false);
                if (ok) toast.success('ITL pipeline run completed');
                else toast.error('ITL pipeline run failed');
              }}
              disabled={runningPipelines || anyItlPipelineRunning}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all disabled:opacity-50 ${
                anyItlPipelineFailed
                  ? 'bg-red-50 text-red-700 hover:bg-red-100'
                  : allItlPipelinesRan
                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {(runningPipelines || anyItlPipelineRunning) ? (
                <><Loader2 size={12} className="animate-spin" /> Running...</>
              ) : anyItlPipelineFailed ? (
                <><XCircle size={12} /> Failed – Retry</>
              ) : allItlPipelinesRan ? (
                <><CheckCircle2 size={12} /> Re-run</>
              ) : (
                <><Play size={12} /> Run Pipelines</>
              )}
            </button>
          </div>
        )}

        {/* ITL Pipeline Results */}
        {itlPipelineFiles.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <table className="w-full">
              <thead className="border-b border-slate-100">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pipeline</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Run</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {itlPipelineFiles.map((pl) => (
                  <tr key={pl.name} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Workflow size={12} className="text-slate-400" />
                        <span className="text-[11px] font-medium text-slate-800">{pl.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {pl.uploadStatus === 'success' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 size={11} /> Created</span>
                      ) : pl.uploadStatus === 'uploading' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600"><Loader2 size={11} className="animate-spin" /> Creating</span>
                      ) : pl.uploadStatus === 'failed' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600"><XCircle size={11} /> Failed</span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400">Pending</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {pl.runStatus === 'completed' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 size={11} /> Success</span>
                      ) : pl.runStatus === 'running' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600"><Loader2 size={11} className="animate-spin" /> Running</span>
                      ) : pl.runStatus === 'failed' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600"><XCircle size={11} /> Failed</span>
                      ) : (
                        <span className="text-[10px] text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
    
  );
};

// ── Gold stored procedures — independent section, own progress bar ──

interface GoldStoredProceduresSectionProps {
  onDeployGoldStoredProcedures: (
    onProgress?: (progress: number, total: number, message: string) => void
  ) => Promise<{ batches_executed: number; procedures_deployed: number; database: string; sp_details_recorded?: number }>;
  /** Greyed out until all ITL pipelines are created successfully */
  disabled?: boolean;
}

const GoldStoredProceduresSection = ({
  onDeployGoldStoredProcedures,
  disabled = false,
}: GoldStoredProceduresSectionProps): JSX.Element => {
  const [deploying, setDeploying] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, message: '' });
  const [deployed, setDeployed] = useState<{ procedures_deployed: number; database: string; sp_details_recorded?: number } | null>(null);

  const handleDeploy = async () => {
    setDeploying(true);
    setProgress({ done: 0, total: 0, message: 'Starting deployment…' });
    try {
      const res = await onDeployGoldStoredProcedures((done, total, message) =>
        setProgress({ done, total, message })
      );
      setDeployed({
        procedures_deployed: res.procedures_deployed,
        database: res.database,
        sp_details_recorded: res.sp_details_recorded,
      });
      toast.success(`${res.procedures_deployed} stored procedures deployed to ${res.database}`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to deploy stored procedures');
    } finally {
      setDeploying(false);
    }
  };

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${deployed ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-50 text-emerald-700'}`}>
          <Database size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-800">Create Stored Procedures for WH_Gold</p>
          <p className="text-[11px] text-slate-500">
            {deployed
              ? `${deployed.procedures_deployed} procedures deployed under [ims] in ${deployed.database}`
                + (deployed.sp_details_recorded ? ` · ${deployed.sp_details_recorded} recorded in Config_Gold` : '')
              : disabled
              ? 'Available once all ITL pipelines are created successfully'
              : 'Creates the [ims] schema and its stored procedures in WH_Gold'}
          </p>
        </div>
        <button
          onClick={handleDeploy}
          disabled={disabled || deploying}
          title={disabled ? 'Create all ITL pipelines first' : undefined}
          className={`flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-bold rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
            disabled
              ? 'bg-slate-100 text-slate-400'
              : deployed ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
        >
          {deploying ? (
            <><Loader2 size={13} className="animate-spin" /> Deploying…</>
          ) : deployed ? (
            <><CheckCircle2 size={13} /> Created</>
          ) : (
            <><Upload size={13} /> Create Stored Procedures</>
          )}
        </button>
      </div>

      {deploying && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-slate-500">{progress.message || 'Working…'}</span>
            <span className="text-[11px] font-semibold text-emerald-700 tabular-nums">
              {progress.total > 0 ? `${progress.done}/${progress.total} batches` : ''}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(pct, progress.total > 0 ? 3 : 8)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ── Master SP execution — deploys MasterExecuter.sp_GoldExecute on demand,
//    then runs it; own progress bar sourced from ExecutionLog polling ──

interface MasterExecuteSectionProps {
  onDeployMasterExecutor: () => Promise<{ batches_executed: number; database: string }>;
  onExecuteMasterSp: (
    silverLakehouse?: string,
    onProgress?: (progress: number, total: number, message: string) => void
  ) => Promise<{ batch_id: number; database: string; done: number; succeeded: number; failed: number; failed_names: string[] }>;
  /** Greyed out until all ITL pipelines are created successfully */
  disabled?: boolean;
}

const MasterExecuteSection = ({
  onDeployMasterExecutor,
  onExecuteMasterSp,
  disabled = false,
}: MasterExecuteSectionProps): JSX.Element => {
  const [executing, setExecuting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, message: '' });
  const [result, setResult] = useState<{ done: number; succeeded: number; failed: number; failed_names: string[]; database: string } | null>(null);

  const handleExecute = async () => {
    setExecuting(true);
    setResult(null);
    setProgress({ done: 0, total: 0, message: 'Deploying MasterExecuter.sp_GoldExecute…' });
    try {
      // Idempotent (CREATE OR ALTER / IF NOT EXISTS throughout) — deployed
      // fresh on every click so this works even after a reload, without
      // needing to remember whether it was deployed in an earlier session.
      await onDeployMasterExecutor();
      const res = await onExecuteMasterSp(undefined, (done, total, message) =>
        setProgress({ done, total, message })
      );
      setResult(res);
      if (res.failed > 0) {
        toast.error(`${res.succeeded}/${res.done} succeeded — ${res.failed} failed`);
      } else {
        toast.success(`${res.succeeded} stored procedures executed successfully`);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to execute Master SP');
      if (e?.result) setResult(e.result);
    } finally {
      setExecuting(false);
    }
  };

  const pct2 = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${result ? (result.failed > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-100 text-emerald-700') : 'bg-emerald-50 text-emerald-700'}`}>
          <Workflow size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-800">Execute Master SP</p>
          <p className="text-[11px] text-slate-500">
            {result
              ? `${result.succeeded}/${result.done} succeeded in ${result.database}`
                + (result.failed > 0 ? ` · ${result.failed} failed` : '')
              : disabled
              ? 'Available once all ITL pipelines are created successfully'
              : 'Runs MasterExecuter.sp_GoldExecute — executes every active procedure from Config_Gold.finin_gold_sp_details'}
          </p>
          {result && result.failed > 0 && (
            <p className="text-[10px] text-red-600 mt-1 truncate" title={result.failed_names.join(', ')}>
              Failed: {result.failed_names.join(', ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {result && result.failed === 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-50 text-emerald-700 flex-shrink-0">
              <CheckCircle2 size={12} /> Done
            </span>
          )}
          <button
            onClick={handleExecute}
            disabled={disabled || executing}
            title={disabled ? 'Create all ITL pipelines first' : undefined}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-bold rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0 ${
              disabled
                ? 'bg-slate-100 text-slate-400'
                : result ? (result.failed > 0 ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100') : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {executing ? (
              <><Loader2 size={13} className="animate-spin" /> Executing…</>
            ) : result ? (
              <><Play size={13} /> Re-run</>
            ) : (
              <><Play size={13} /> Execute Master SP</>
            )}
          </button>
        </div>
      </div>

      {executing && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-slate-500">{progress.message || 'Working…'}</span>
            <span className="text-[11px] font-semibold text-emerald-700 tabular-nums">
              {progress.total > 0 ? `${progress.done}/${progress.total} stored procedures` : ''}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(pct2, progress.total > 0 ? 3 : 8)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ── Semantic Model — Finin-only: upload Tables/Relationships/Measures
//    Excel, then build the semantic model against WH_Gold. Two steps in one
//    card: upload gates build, same as Deploy → Execute above ──

interface SemanticModelExcelSummary {
  filename: string;
  tables_count: number;
  relationships_count: number;
  measures_count: number;
  uploaded_at: string;
}

interface SemanticModelBuildResult {
  display_name: string;
  fabric_item_id: string | null;
  workspace_id: string;
  tables: number;
  relationships: number;
  measures: number;
}

interface SemanticModelSectionProps {
  onUploadExcel: (file: File) => Promise<SemanticModelExcelSummary>;
  onFetchStatus: () => Promise<{
    excel: SemanticModelExcelSummary | null;
    build: { status: string; fabric_item_id: string | null; job_id: string | null; display_name: string } | null;
  } | null>;
  onBuild: (
    onProgress?: (progress: number, total: number, message: string) => void
  ) => Promise<SemanticModelBuildResult>;
  /** Greyed out until all ITL pipelines are created successfully */
  disabled?: boolean;
}

const SemanticModelSection = ({
  onUploadExcel,
  onFetchStatus,
  onBuild,
  disabled = false,
}: SemanticModelSectionProps): JSX.Element => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [excel, setExcel] = useState<SemanticModelExcelSummary | null>(null);
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, message: '' });
  const [result, setResult] = useState<SemanticModelBuildResult | null>(null);
  const [buildFailed, setBuildFailed] = useState(false);

  // Restore state after a reload — was an Excel already uploaded / a model
  // already built in an earlier visit to this page?
  useEffect(() => {
    let cancelled = false;
    onFetchStatus()
      .then((status) => {
        if (cancelled || !status) return;
        if (status.excel) setExcel(status.excel);
        if (status.build?.status === 'success') {
          setResult({
            display_name: status.build.display_name,
            fabric_item_id: status.build.fabric_item_id,
            workspace_id: '',
            tables: 0,
            relationships: 0,
            measures: 0,
          });
        } else if (status.build?.status === 'failed') {
          setBuildFailed(true);
        }
      })
      .catch(() => {/* best-effort restore — silent */});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const summary = await onUploadExcel(file);
      setExcel(summary);
      setResult(null);
      setBuildFailed(false);
      toast.success(
        `Parsed ${summary.tables_count} table(s), ${summary.relationships_count} relationship(s), ${summary.measures_count} measure(s)`
      );
    } catch (e: any) {
      toast.error(e?.message || 'Failed to parse workbook');
    } finally {
      setUploading(false);
    }
  };

  const handleBuild = async () => {
    setBuilding(true);
    setBuildFailed(false);
    setProgress({ done: 0, total: 0, message: 'Starting…' });
    try {
      const res = await onBuild((done, total, message) => setProgress({ done, total, message }));
      setResult(res);
      toast.success(`Semantic model '${res.display_name}' created`);
    } catch (e: any) {
      setBuildFailed(true);
      toast.error(e?.message || 'Failed to build semantic model');
    } finally {
      setBuilding(false);
    }
  };

  const pct3 = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${result ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-50 text-emerald-700'}`}>
          <Sparkles size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-800">Build Semantic Model</p>
          <p className="text-[11px] text-slate-500">
            {result
              ? `'${result.display_name}' created in Fabric`
              : excel
              ? `${excel.filename} — ${excel.tables_count} table(s), ${excel.relationships_count} relationship(s), ${excel.measures_count} measure(s)`
              : disabled
              ? 'Available once all ITL pipelines are created successfully'
              : 'Upload the Tables / Relationships / Measures workbook, then build the semantic model against WH_Gold'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={ uploading || building}
            title={disabled ? 'Create all ITL pipelines first' : undefined}
            className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-bold rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            {uploading ? (
              <><Loader2 size={13} className="animate-spin" /> Uploading…</>
            ) : excel ? (
              <><FileSpreadsheet size={13} /> Re-upload Excel</>
            ) : (
              <><FileSpreadsheet size={13} /> Upload Excel</>
            )}
          </button>
          <button
            onClick={handleBuild}
            disabled={!excel || building}
            title={!excel ? 'Upload the Excel first' : undefined}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-bold rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
              !excel
                ? 'bg-slate-100 text-slate-400'
                : buildFailed ? 'bg-red-50 text-red-700 hover:bg-red-100' : result ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {building ? (
              <><Loader2 size={13} className="animate-spin" /> Building…</>
            ) : result ? (
              <><CheckCircle2 size={13} /> Rebuild</>
            ) : (
              <><Play size={13} /> Build Semantic Model</>
            )}
          </button>
        </div>
      </div>

      {building && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-slate-500">{progress.message || 'Working…'}</span>
            <span className="text-[11px] font-semibold text-emerald-700 tabular-nums">
              {progress.total > 0 ? `${progress.done}/${progress.total} tables` : ''}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(pct3, progress.total > 0 ? 3 : 8)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};