/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Play, Loader2, CheckCircle2, Database, FileText, XCircle, Workflow, Lock, Download, Upload, FileSpreadsheet, Sparkles, ChevronRight, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import type { SourceConnection, ConfigTask, NotebookItem, PipelineItem } from '../../types';
import { useEffect, useState, useRef, Fragment, type JSX } from 'react';
import {
  uploadBlobConfig,
  listPendingSourceSchemas,
  listPendingSourceTables,
  savePendingSourceTableSelection,
  type PendingTableSelectionMode,
  type PendingSourceSchema,
  type PendingSourceTable,
} from '../../../../layouts/services/fabricApi';
import { SelectDropdown } from '../../../../shared/components/selectdropdown';

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
  itlStatusChecked,
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
  // Defaults to true (not false) until proven otherwise — undefined here
  // means "the fetch hasn't even started yet", not "nothing to load".
  // Defaulting to false let ArtifactGroupCard's auto-create/auto-deploy
  // effects run on their very first mount — before this connection's
  // notebooks/pipelines had actually been fetched back from the backend
  // — since React fires a child's effects before its parent's, so this
  // component's own fetch-trigger effect (which sets configLoading=true)
  // hadn't run yet. With notebooksDone/pipelinesDone still reading their
  // empty-array defaults at that moment too, the auto-create/auto-deploy
  // conditions looked satisfied and fired for real — re-uploading
  // notebooks and REDEPLOYING pipelines (WatermarkUpdate, Master, etc.)
  // on every single page reload. Defaulting to true keeps everything
  // gated shut until the real fetch resolves.
  const connConfigLoading = selectedConnection ? (configLoading as Record<string, boolean>)[selectedConnection] ?? true : false;
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
  // Whether a Tables-to-move-to-Bronze selection has actually been saved
  // (and applied to WH_MetaData) for a given connection. Undefined means
  // "not known yet" (TableSelectionPanel hasn't reported in), which is
  // treated as not-applied so OTL stays locked until it has — this also
  // covers a page reload: TableSelectionPanel re-fetches on mount and
  // reports back whatever was actually saved last time via its
  // onAppliedChange callback, so a real prior save is picked back up
  // immediately instead of asking the person to save again.
  const [tableSelectionAppliedMap, setTableSelectionAppliedMap] = useState<Record<string, boolean>>({});
  const tableSelectionApplied = selectedConnection ? !!tableSelectionAppliedMap[selectedConnection] : false;
  // Fabric-mode "Hide details" / "View details" toggle for the Notebooks
  // and Pipelines tables — same collapse-once-complete pattern the Finin
  // mode's ArtifactGroupCard/ItlSection already use, per connection so
  // switching connections doesn't carry over a previous one's collapsed state.
  const [showNotebooksDetailsMap, setShowNotebooksDetailsMap] = useState<Record<string, boolean>>({});
  const [showPipelinesDetailsMap, setShowPipelinesDetailsMap] = useState<Record<string, boolean>>({});
  const showNotebooksDetails = selectedConnection ? showNotebooksDetailsMap[selectedConnection] ?? true : true;
  const showPipelinesDetails = selectedConnection ? showPipelinesDetailsMap[selectedConnection] ?? true : true;
  const toggleNotebooksDetails = () => {
    if (!selectedConnection) return;
    setShowNotebooksDetailsMap((prev) => ({ ...prev, [selectedConnection]: !(prev[selectedConnection] ?? true) }));
  };
  const togglePipelinesDetails = () => {
    if (!selectedConnection) return;
    setShowPipelinesDetailsMap((prev) => ({ ...prev, [selectedConnection]: !(prev[selectedConnection] ?? true) }));
  };
  const notebooksUploading = selectedConnection ? !!notebooksUploadingMap[selectedConnection] : false;
  const pipelinesUploading = selectedConnection ? !!pipelinesUploadingMap[selectedConnection] : false;
  const blobConfigStatus = selectedConnection ? blobConfigStatusMap[selectedConnection] ?? 'idle' : 'idle';
  const pendingPipelineDeployMap = useRef<Record<string, boolean>>({});

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

  // NOTE: pipeline auto-running is now owned entirely by ArtifactGroupCard,
  // which auto-runs the pipeline(s) within its own group (Metadata's
  // 01_PL_SQL_ConfigCreation, then OTL's 02_PL_SourceToBronze) one at a
  // time, right where onRunPipeline is actually wired up. There used to
  // also be a connection-wide chain effect here that scanned every
  // pipeline across both groups and auto-ran whichever was "next" — with
  // ArtifactGroupCard's own per-group effect now doing the same job, the
  // two fired independently for the same pipeline (e.g. 02_PL_SourceToBronze
  // getting run/created twice: once from each effect). Removed here so
  // there's exactly one place that decides when a pipeline auto-runs.
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

  // Auto-trigger Blob Configuration too — same "no manual click needed"
  // rule applies here; it's just another artifact-creation step, not one
  // of the two things (Table Selection, ITL Excel) that genuinely need a
  // person's judgment.
  const autoBlobConfigRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (!isBlob || !selectedConn) return;
    const connId = selectedConn.id;
    const status = blobConfigStatusMap[connId] || 'idle';
    if (status !== 'idle' || autoBlobConfigRef.current[connId]) return;
    autoBlobConfigRef.current[connId] = true;
    handleUploadBlobConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBlob, selectedConn?.id, blobConfigStatusMap[selectedConn?.id || '']]);


  // ── Metadata → OTL: paired artifact groups, used for both Fabric and
  // Finin modes. "Metadata" creates+deploys 01_NB_SQL_ConfigCreation +
  // 01_PL_SQL_ConfigCreation together; "OTL" creates+deploys
  // 01_NB_BronzeToSilver + 02_PL_SourceToBronze together, one
  // notebook/pipeline pair at a time. State here is keyed per-connection,
  // same pattern as the maps above, so switching connections never shows
  // stale progress from a different one.
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
      await onUploadNotebooks(selectedConn.name, connIndex, group1Notebooks.map((nb) => nb.filename), appMode);
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
      await onUploadPipelines(selectedConn.name, connIndex, group1Pipelines.map((p) => p.filename), appMode);
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
      await onUploadNotebooks(selectedConn.name, connIndex, group2Notebooks.map((nb) => nb.filename), appMode);
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
      await onUploadPipelines(selectedConn.name, connIndex, group2Pipelines.map((p) => p.filename), appMode);
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


      {/* Connection Selection — dropdown instead of a card grid, so this
          stays usable with 10+ connections. */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-slate-700 mb-3">Select Connection</h3>
        {connections.length === 0 && connectionsLoading ? (
          <div className="h-11 bg-slate-100 rounded-xl animate-pulse" aria-label="Loading connections" />
        ) : connections.length === 0 ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center">
            <p className="text-sm text-slate-500">No connections available. Add one in the Source step.</p>
          </div>
        ) : (
          <>
            <SelectDropdown
              value={connections.find((c) => c.id === selectedConnection)?.name ?? ''}
              options={connections.map((c) => c.name)}
              placeholder="Select a connection…"
              onChange={(name) => {
                const c = connections.find((c) => c.name === name);
                if (c) onSelectConnection(c.id);
              }}
            />
            {(() => {
              const conn = connections.find((c) => c.id === selectedConnection);
              if (!conn) return null;
              return (
                <div className="mt-2.5 p-4 rounded-xl border-2 border-emerald-500 bg-emerald-50/50">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-emerald-600">
                      <Database size={18} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-slate-900 mb-0.5">{conn.name}</h4>
                      <p className="text-xs text-slate-500 truncate">{conn.databaseType} • {conn.server}</p>
                    </div>
                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>

      {selectedConnection && (
        <div className="space-y-5">
          <>
            <ArtifactGroupCard
              key={`metadata-${selectedConn?.id}`}
              title="OTL Metadata Creation"
              icon={<Database size={13} />}
              requireManualStart
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

            {appMode === 'finin' && group1PipelinesRan && !connConfigLoading && (
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

            {/* Tables to move to Bronze — shown only once Metadata's
                01_PL_SQL_ConfigCreation has actually finished RUNNING
                (not just been deployed): that's the earliest moment
                OneTimeConfigETL exists in WH_MetaData for the picker to
                read from and, on Save, write IsActive into directly. */}
            {selectedConn && group1PipelinesRan && !connConfigLoading && (
              <TableSelectionPanel
                connection={selectedConn}
                onAppliedChange={(applied) =>
                  setTableSelectionAppliedMap((prev) => ({ ...prev, [selectedConn.id]: applied }))
                }
              />
            )}

            {/* Blob Configuration — Azure Blob sources don't have a
                Metadata/OTL notebook pair; they need the discovered
                folder structure uploaded instead before OTL can run. */}
            {isBlob && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
                  <div className="flex items-center gap-2">
                    <FileText size={15} className="text-emerald-600" />
                    <h3 className="text-[13px] font-bold text-slate-700">Blob Configuration</h3>
                  </div>
                  <button
                    onClick={handleUploadBlobConfig}
                    disabled={loading || blobConfigStatus === 'loading' || blobConfigStatus === 'success'}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${blobConfigStatus === 'success'
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

            <ArtifactGroupCard
              key={`otl-${selectedConn?.id}`}
              title="One Time Load"
              icon={<Workflow size={13} />}
              rows={[
                ...group2Notebooks.map((nb) => ({ key: `nb-${nb.filename}`, name: nb.name, kind: 'Notebook' as const, uploadStatus: nb.uploadStatus })),
                ...group2Pipelines.map((p) => ({ key: `pl-${p.filename}`, name: p.name, kind: 'Pipeline' as const, uploadStatus: p.uploadStatus, runStatus: p.runStatus, fabricItemId: p.fabricItemId })),
              ]}
              locked={
                appMode === 'finin'
                  ? !isConnectionMapped
                  : isBlob
                    ? !group1PipelinesDone
                    // Non-blob: wait for the table selection to actually be
                    // saved (even picking "Select All" counts) before OTL's
                    // SourceToBronze pipeline is allowed to deploy/run —
                    // otherwise it can run against IsActive='1' for every
                    // table before a save ever lands.
                    : !group1PipelinesRan || !tableSelectionApplied
              }
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
              itlStatusChecked={!!itlStatusChecked[selectedConn!.id]}
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
  /** Small icon shown beside the title so each section is recognizable
   * at a glance without reading the text (e.g. a database icon for
   * Metadata, a workflow icon for One Time Load). */
  icon?: JSX.Element;
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
  /** When true, the initial "Create" step never auto-fires — it waits for
   *  a real click on the Create button. Everything after that first click
   *  (deploy, pipeline auto-run, etc.) still happens automatically. Used
   *  for Metadata so simply selecting a connection can't kick off real
   *  work by accident. */
  requireManualStart?: boolean;
}

const ArtifactGroupCard = ({
  title, icon, rows, locked, loading, notebooksExist, pipelinesExist,
  notebooksDone, pipelinesDone, notebooksUploading, pipelinesUploading,
  onCreate, onDeploy, onRunPipeline, requireManualStart,
}: ArtifactGroupCardProps): JSX.Element => {
  const bothDone = (!notebooksExist || notebooksDone) && (!pipelinesExist || pipelinesDone);
  const pipelineRows = rows.filter((r) => r.kind === 'Pipeline');
  // Fully complete = artifacts created AND (for pipelines) actually run to
  // completion — not just deployed. Collapsing on bothDone alone left the
  // full table (with Run/Retry buttons) visible even after everything had
  // finished, which looked like the stage was still asking the user to act.
  const fullyComplete = bothDone && (pipelineRows.length === 0 || pipelineRows.every((r) => r.runStatus === 'completed'));
  // Collapsed by default — most people using this screen aren't
  // technical and don't need (or want) to watch artifact-by-artifact
  // detail; the header's status badge + progress bar is the whole
  // story for them. Anyone who does want to see it clicks "View details".
  const [showDetails, setShowDetails] = useState(false);
  // Pipelines shown at the top level; notebooks nest underneath their
  // pipeline as a sub-artifact instead of being listed as their own row
  // — expanded by default so the notebook is visible without an extra
  // click (there's normally just the one, so collapsing by default would
  // only hide something people actually want to see).
  const [expandedPipelineKeys, setExpandedPipelineKeys] = useState<Set<string>>(
    () => new Set(pipelineRows.map((r) => r.key))
  );
  const toggleExpanded = (key: string) => {
    setExpandedPipelineKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Percent of this group's rows that are fully done — notebooks count as
  // done once created, pipelines only once actually run to completion —
  // shown as a simple progress bar so non-technical users get an
  // at-a-glance sense of "how much is left" without reading a table.
  const totalUnits = rows.length;
  const doneUnits = rows.filter((r) =>
    r.kind === 'Notebook' ? r.uploadStatus === 'success' : r.runStatus === 'completed'
  ).length;
  const progressPct = totalUnits > 0 ? Math.round((doneUnits / totalUnits) * 100) : 0;

  // Guards against the same create/deploy call firing twice in quick
  // succession (StrictMode double-invoke, or this effect re-firing before
  // its own state write has landed).
  const autoCreateGuardRef = useRef(false);
  const autoDeployGuardRef = useRef(false);
  // For requireManualStart groups (Metadata): true once the person has
  // actually clicked Create for real — separate from autoCreateGuardRef,
  // which just prevents double-firing. Starts true whenever
  // requireManualStart is off (nothing to gate) or the group already has
  // work in flight/done (covers remounts after a real start already
  // happened, e.g. coming back from another step).
  const [manuallyStarted, setManuallyStarted] = useState(
    !requireManualStart || notebooksUploading || notebooksDone
  );

  // Auto-create notebooks the moment this group unlocks — no click
  // needed, UNLESS requireManualStart is set (Metadata), in which case
  // this waits for manuallyStarted instead: selecting a connection alone
  // must never kick off real work, only an actual click on Create does.
  useEffect(() => {
    if (locked || loading || !notebooksExist || notebooksDone || notebooksUploading) return;
    if (requireManualStart && !manuallyStarted) return;
    if (autoCreateGuardRef.current) return;
    autoCreateGuardRef.current = true;
    onCreate();
  }, [locked, loading, notebooksExist, notebooksDone, notebooksUploading, requireManualStart, manuallyStarted]);

  // Auto-deploy pipelines the moment notebooks are done — no click needed.
  useEffect(() => {
    if (locked || loading || !notebooksDone || !pipelinesExist || pipelinesDone || pipelinesUploading) return;
    if (autoDeployGuardRef.current) return;
    autoDeployGuardRef.current = true;
    onDeploy();
  }, [locked, loading, notebooksDone, pipelinesExist, pipelinesDone, pipelinesUploading]);

  // If something actually needs a person's attention (a failed create/
  // deploy/run), open the details automatically so they're not staring
  // at a collapsed "Waiting" card with no idea what to do — the whole
  // point of auto-collapsing everything else is that nothing needs
  // attention until something goes wrong.
  useEffect(() => {
    const anyFailed = rows.some((r) => r.uploadStatus === 'failed' || r.runStatus === 'failed');
    if (anyFailed) setShowDetails(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((r) => `${r.uploadStatus}:${r.runStatus}`).join(',')]);

  // Guards against the same pipeline being auto-run twice in quick
  // succession — e.g. React 18 StrictMode's dev-only double-invoke of
  // effects, or this effect re-firing before the just-triggered run's
  // status has made it back into `rows` yet. Keyed by pipeline name;
  // cleared once the row's own runStatus reflects the run so a genuine
  // retry (via the Retry button) still works.
  const autoRunGuardRef = useRef<Set<string>>(new Set());

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
        if (autoRunGuardRef.current.has(pr.name)) break;
        autoRunGuardRef.current.add(pr.name);
        onRunPipeline(pr.name);
      }
      break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelinesDone, pipelineRows.map((r) => `${r.key}:${r.runStatus}`).join(',')]);

  // Anyone-can-read status for the header, in the exact vocabulary asked
  // for: Creating (artifacts being uploaded), Running (a pipeline is
  // executing), Done (everything finished). Locked/Waiting stays for the
  // "hasn't started yet" case.
  const anyPipelineRunning = pipelineRows.some((r) => r.runStatus === 'running');
  const groupStatus: 'locked' | 'creating' | 'running' | 'done' | 'idle' =
    locked ? 'locked'
      : fullyComplete ? 'done'
      : notebooksUploading || pipelinesUploading ? 'creating'
      : anyPipelineRunning ? 'running'
      : 'idle';

  return (
    <div className={`bg-white rounded-xl border overflow-hidden shadow-sm transition-opacity duration-300 ${locked ? 'border-slate-100 opacity-60' : 'border-slate-200'}`}>
      <div className="px-5 py-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-slate-700 flex items-center gap-2">
            {icon && (
              <span className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                {icon}
              </span>
            )}
            {title}
          </h3>
          <div className="flex items-center gap-2">
            {groupStatus === 'done' ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-50 text-emerald-700">
                <CheckCircle2 size={12} /> Done
              </span>
            ) : groupStatus === 'locked' ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-slate-100 text-slate-400">
                <Lock size={12} /> Waiting
              </span>
            ) : groupStatus === 'creating' ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-blue-50 text-blue-700">
                <Loader2 size={12} className="animate-spin" /> Creating
              </span>
            ) : groupStatus === 'running' ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-blue-50 text-blue-700">
                <Loader2 size={12} className="animate-spin" /> Running
              </span>
            ) : (
              // Idle-but-unlocked: this is a transient sliver of time
              // right before the auto-create/auto-deploy effect above
              // fires — everything is automatic, so a manual button is
              // just a fallback for a stuck/failed attempt, kept small
              // and secondary rather than a prompt to act.
              <>
                {!notebooksDone ? (
                  <button
                    onClick={() => { setManuallyStarted(true); onCreate(); }}
                    disabled={loading || notebooksUploading || !notebooksExist}
                    className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <Upload size={12} /> Create
                  </button>
                ) : !pipelinesDone ? (
                  <button
                    onClick={onDeploy}
                    disabled={loading || pipelinesUploading || !pipelinesExist}
                    className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <Upload size={12} /> Deploy
                  </button>
                ) : null}
              </>
            )}
            {rows.length > 0 && (
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="cursor-pointer text-[11px] font-bold text-teal-600 hover:text-teal-800 transition-colors"
              >
                {showDetails ? 'Hide details' : 'View details'}
              </button>
            )}
          </div>
        </div>
        {totalUnits > 0 && !fullyComplete && (
          <div className="mt-2.5 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-500 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-[10px] font-semibold text-slate-400 tabular-nums shrink-0">{doneUnits}/{totalUnits}</span>
          </div>
        )}
      </div>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: showDetails ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className={`transition-all duration-300 ease-in-out ${showDetails ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'}`}>
            {rows.length === 0 && loading ? (
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
            {/* Notebooks nest under their pipeline as a sub-artifact
                (toggle to expand/collapse) rather than being listed as
                their own top-level row — a notebook never has a "Run"
                of its own here, it's created as part of deploying the
                pipeline it belongs to. Any pipeline row with no
                notebooks attached (shouldn't normally happen for
                Metadata/OTL, each pairs exactly one of each) just
                renders with nothing to expand. */}
            {pipelineRows.map((pipelineRow) => {
              const children = rows.filter((r) => r.kind === 'Notebook');
              const isExpanded = expandedPipelineKeys.has(pipelineRow.key);
              return (
                <Fragment key={pipelineRow.key}>
                  <tr
                    className={`hover:bg-slate-50/50 ${children.length > 0 ? 'cursor-pointer' : ''}`}
                    style={pipelineRow.runStatus === 'running' ? { background: '#f0f7ff' } : {}}
                    onClick={children.length > 0 ? () => toggleExpanded(pipelineRow.key) : undefined}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        {children.length > 0 && (
                          <ChevronRight
                            size={12}
                            className={`text-slate-400 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                          />
                        )}
                        <Workflow size={13} className="text-slate-400" />
                        <span className="text-[12px] font-medium text-slate-800">{pipelineRow.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-[11px] font-semibold text-slate-500">Pipeline</span>
                    </td>
                    <td className="px-5 py-3">
                      {pipelineRow.uploadStatus === 'success' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 size={11} /> Created</span>
                      ) : pipelineRow.uploadStatus === 'uploading' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600"><Loader2 size={11} className="animate-spin" /> Creating</span>
                      ) : pipelineRow.uploadStatus === 'failed' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600"><XCircle size={11} /> Failed</span>
                      ) : locked ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400"><Lock size={11} /> Waiting</span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-600">Not Created</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {pipelineRow.uploadStatus !== 'success' && !pipelineRow.runStatus ? (
                        <span className="text-[10px] text-slate-300">—</span>
                      ) : pipelineRow.runStatus === 'completed' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 size={11} /> Completed</span>
                      ) : pipelineRow.runStatus === 'running' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600"><Loader2 size={11} className="animate-spin" /> Running</span>
                      ) : pipelineRow.runStatus === 'failed' ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); onRunPipeline(pipelineRow.name); }}
                          className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-md bg-red-600 text-white hover:bg-red-700 transition-all"
                        >
                          <XCircle size={11} /> Retry
                        </button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); onRunPipeline(pipelineRow.name); }}
                          disabled={!pipelineRow.fabricItemId}
                          className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                          <Play size={10} /> Run
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && children.map((nb) => (
                    <tr key={nb.key} className="bg-slate-50/50 hover:bg-slate-100/60">
                      <td className="px-5 py-3 pl-11">
                        <div className="flex items-center gap-2">
                          <FileText size={12} className="text-slate-300" />
                          <span className="text-[11px] font-medium text-slate-600">{nb.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-[11px] font-semibold text-slate-400">Notebook</span>
                      </td>
                      <td className="px-5 py-3">
                        {nb.uploadStatus === 'success' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 size={11} /> Created</span>
                        ) : nb.uploadStatus === 'uploading' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600"><Loader2 size={11} className="animate-spin" /> Creating</span>
                        ) : nb.uploadStatus === 'failed' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600"><XCircle size={11} /> Failed</span>
                        ) : locked ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400"><Lock size={11} /> Waiting</span>
                        ) : (
                          <span className="text-[10px] font-bold text-amber-600">Not Created</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {/* Notebooks don't have their own run status here
                            — they're created as part of this pipeline's
                            deploy, not run independently. */}
                        <span className="text-[10px] text-slate-300">—</span>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            {/* Fallback: a notebook with no pipeline sibling at all
                (shouldn't happen for Metadata/OTL, kept only so nothing
                silently disappears if that ever changes). */}
            {rows.filter((r) => r.kind === 'Notebook').length > 0 && pipelineRows.length === 0 &&
              rows.filter((r) => r.kind === 'Notebook').map((nb) => (
                <tr key={nb.key} className="hover:bg-slate-50/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <FileText size={13} className="text-slate-400" />
                      <span className="text-[12px] font-medium text-slate-800">{nb.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3"><span className="text-[11px] font-semibold text-slate-500">Notebook</span></td>
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
                  <td className="px-5 py-3"><span className="text-[10px] text-slate-300">—</span></td>
                </tr>
              ))}
          </tbody>
        </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Tables to move to Bronze (Select All / SchemaWise / TableWise) ─────
// Lives in the Metadata step, after that connection's Metadata
// (ConfigCreation) notebook + pipeline are created. Reads directly from
// the source database, so it works even before OTL's config-creation
// notebook has actually run and created OneTimeConfigETL — the pick is
// applied automatically the next time this connection's tables are
// opened via the (post-notebook) table picker. 'sys' is always excluded.

const TableSelectionPanel = ({
  connection,
  onAppliedChange,
}: {
  connection: SourceConnection;
  onAppliedChange?: (applied: boolean) => void;
}) => {
  const [mode, setMode] = useState<PendingTableSelectionMode>('all');
  const [loadingData, setLoadingData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [schemas, setSchemas] = useState<PendingSourceSchema[]>([]);
  const [tables, setTables] = useState<PendingSourceTable[]>([]);
  const [selectedSchemas, setSelectedSchemas] = useState<Set<string>>(new Set());
  const [selectedTableKeys, setSelectedTableKeys] = useState<Set<string>>(new Set());
  const [tableSearch, setTableSearch] = useState('');
  const [saving, setSaving] = useState(false);
  // "Hide details" — collapses the whole picker body down to just the
  // header + a one-line summary. This is the one section that genuinely
  // needs a person's action (picking tables), so — unlike every other
  // section, which stays collapsed until there's something to show —
  // this one opens itself automatically once it's relevant (right after
  // the fetch below resolves) and only collapses once Save actually
  // succeeds; from then on it stays collapsed like everything else,
  // reopening only if the person clicks "View details" to change it.
  const [showDetails, setShowDetails] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  // Table Wise Selection drills down: null = showing the schema list,
  // otherwise the schema whose tables are currently shown.
  const [openSchema, setOpenSchema] = useState<string | null>(null);
  const requestId = useRef(0);

  const tableKey = (t: PendingSourceTable) => `${t.schema_name}.${t.table_name}`;

  useEffect(() => {
    const reqId = ++requestId.current;
    setLoadingData(true);
    setLoadError(null);
    Promise.all([listPendingSourceSchemas(connection.id), listPendingSourceTables(connection.id)])
      .then(([schemaRes, tableRes]) => {
        if (requestId.current !== reqId) return;
        setMode(tableRes.mode || 'all');
        setSchemas(schemaRes.schemas);
        setTables(tableRes.tables);
        setSelectedSchemas(new Set(schemaRes.schemas.filter((s) => s.is_selected).map((s) => s.schema_name)));
        setSelectedTableKeys(new Set(tableRes.tables.filter((t) => t.is_selected).map(tableKey)));
        const alreadyApplied = !!tableRes.applied;
        setJustSaved(alreadyApplied);
        // Open automatically if there's a real pick to make (nothing
        // saved/applied yet); otherwise a prior save already happened
        // (e.g. a page reload) so it stays collapsed like every other
        // finished section.
        setShowDetails(!alreadyApplied);
        onAppliedChange?.(alreadyApplied);
      })
      .catch((e) => {
        if (requestId.current !== reqId) return;
        setLoadError(e?.message || 'Failed to load tables for this connection.');
        onAppliedChange?.(false);
      })
      .finally(() => {
        if (requestId.current === reqId) setLoadingData(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.id]);


  // Distinct schemas that actually have tables under Table Wise mode,
  // derived from the flat table list so it always matches what's really
  // there (rather than trusting the separate schema list, which could in
  // principle drift from it).
  const schemaGroups = tables.reduce<Record<string, PendingSourceTable[]>>((acc, t) => {
    (acc[t.schema_name] ||= []).push(t);
    return acc;
  }, {});
  const tableWiseSchemaNames = Object.keys(schemaGroups).sort();

  const selectedCountForSchema = (schemaName: string) =>
    (schemaGroups[schemaName] || []).filter((t) => selectedTableKeys.has(tableKey(t))).length;

  const tablesInOpenSchema = openSchema ? schemaGroups[openSchema] || [] : [];
  const filteredTablesInSchema = tablesInOpenSchema.filter((t) =>
    !tableSearch.trim() || t.table_name.toLowerCase().includes(tableSearch.trim().toLowerCase())
  );
  const allFilteredInSchemaSelected =
    filteredTablesInSchema.length > 0 && filteredTablesInSchema.every((t) => selectedTableKeys.has(tableKey(t)));

  const toggleSchema = (s: string) => {
    setSelectedSchemas((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };
  const toggleTable = (key: string) => {
    setSelectedTableKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const selectAllInOpenSchema = () => {
    setSelectedTableKeys((prev) => {
      const next = new Set(prev);
      filteredTablesInSchema.forEach((t) => next.add(tableKey(t)));
      return next;
    });
  };
  const deselectAllInOpenSchema = () => {
    setSelectedTableKeys((prev) => {
      const next = new Set(prev);
      filteredTablesInSchema.forEach((t) => next.delete(tableKey(t)));
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let res: { applied: boolean; apply_error?: string };
      if (mode === 'all') {
        res = await savePendingSourceTableSelection(connection.id, 'all', {});
      } else if (mode === 'schema') {
        const picked = Array.from(selectedSchemas);
        res = await savePendingSourceTableSelection(connection.id, 'schema', { schemas: picked });
      } else {
        const picked = Array.from(selectedTableKeys);
        res = await savePendingSourceTableSelection(connection.id, 'table', { selected: picked });
      }

      if (res.applied) {
        const countLabel =
          mode === 'all'
            ? `every table (except 'sys')`
            : mode === 'schema'
              ? `tables from ${selectedSchemas.size} schema${selectedSchemas.size === 1 ? '' : 's'}`
              : `${selectedTableKeys.size} of ${tables.length} table${tables.length === 1 ? '' : 's'}`;
        toast.success(`Saved — ${countLabel} will move to Bronze.`);
      } else {
        // Saved locally but couldn't be written into WH_MetaData yet
        // (e.g. the metadata warehouse isn't reachable right now) — will
        // retry automatically the next time this connection's tables are
        // opened, but flag it so it isn't mistaken for fully done.
        toast.error(res.apply_error || 'Selection saved, but could not be applied to WH_MetaData yet — it will retry automatically.');
      }
      // Once saved (applied or not — either way there's nothing more to
      // do right now), collapse the details and lock the Save button so
      // it reads as "done" instead of inviting another click.
      setJustSaved(true);
      setShowDetails(false);
      onAppliedChange?.(res.applied);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save table selection.');
    } finally {
      setSaving(false);
    }
  };

  // Re-arm Save (and clear the "just saved" lock) the moment the person
  // actually changes something, so editing after a save works normally.
  const markDirty = () => {
    if (justSaved) {
      setJustSaved(false);
      onAppliedChange?.(false);
    }
  };

  const summaryText =
    mode === 'all'
      ? `Every table (except 'sys') will move to Bronze.`
      : mode === 'schema'
        ? `${selectedSchemas.size} schema${selectedSchemas.size === 1 ? '' : 's'} selected.`
        : `${selectedTableKeys.size} of ${tables.length} table${tables.length === 1 ? '' : 's'} selected.`;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
        <div className="flex items-center gap-2">
          <FileText size={15} className="text-emerald-600" />
          <h3 className="text-[13px] font-bold text-slate-700">Required Tables Selection</h3>
        </div>
        <div className="flex items-center gap-2">
          {justSaved && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={11} /> Saved
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="cursor-pointer text-[11px] font-bold text-teal-600 hover:text-teal-800 transition-colors"
          >
            {showDetails ? 'Hide details' : 'View details'}
          </button>
        </div>
      </div>

      {/* Animated collapse: grid-rows trick gives a smooth height
          transition without needing to know the content's real height
          up front (max-height tricks either clip early or leave a big
          empty gap — this doesn't). */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: showDetails ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div
            className={`p-5 transition-all duration-300 ease-in-out ${showDetails ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'}`}
          >
            {/* Selection mode */}
            <div className="flex items-center gap-2 mb-4">
              {(['all', 'schema', 'table'] as PendingTableSelectionMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setOpenSchema(null); markDirty(); }}
                  disabled={justSaved}
                  className={`cursor-pointer px-3 py-1.5 text-[12px] font-semibold rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    mode === m
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {m === 'all' ? 'Select All' : m === 'schema' ? 'SchemaWise Selection' : 'Table Wise Selection'}
                </button>
              ))}
            </div>

            {loadingData ? (
              <div className="flex items-center justify-center gap-2 py-8 text-slate-400 text-[12px]">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </div>
            ) : loadError ? (
              <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-[12px] text-red-700">{loadError}</div>
            ) : mode === 'all' ? (
              <p className="text-[12px] text-slate-500">
                Every table in this source will move to Bronze.
              </p>
            ) : mode === 'schema' ? (
              schemas.length === 0 ? (
                <div className="py-8 text-center text-[12px] text-slate-400">No schemas found for this connection yet.</div>
              ) : (
                <div className="max-h-72 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
                  {schemas.map((s) => (
                    <label key={s.schema_name} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer text-[13px]">
                      <input
                        type="checkbox"
                        checked={selectedSchemas.has(s.schema_name)}
                        onChange={() => { toggleSchema(s.schema_name); markDirty(); }}
                        disabled={justSaved}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400 cursor-pointer disabled:cursor-not-allowed"
                      />
                      <span className="text-slate-800 font-medium">{s.schema_name}</span>
                    </label>
                  ))}
                </div>
              )
            ) : tables.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-slate-400">No tables found for this connection yet.</div>
            ) : openSchema === null ? (
              /* Table Wise Selection, step 1: pick a schema */
              <div className="max-h-72 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
                {tableWiseSchemaNames.map((s) => {
                  const count = schemaGroups[s].length;
                  const selectedCount = selectedCountForSchema(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setOpenSchema(s); setTableSearch(''); }}
                      className="cursor-pointer w-full flex items-center justify-between gap-2.5 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left text-[13px]"
                    >
                      <div className="flex items-center gap-2">
                        <FileText size={13} className="text-slate-400" />
                        <span className="text-slate-800 font-medium">{s}</span>
                        <span className="text-[11px] text-slate-400">({count} table{count === 1 ? '' : 's'})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedCount > 0 && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                            {selectedCount} selected
                          </span>
                        )}
                        <ChevronRight size={14} className="text-slate-300" />
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Table Wise Selection, step 2: tables inside the chosen schema */
              <>
                <div className="flex items-center gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setOpenSchema(null)}
                    className="cursor-pointer flex items-center gap-1 text-[12px] font-semibold text-teal-600 hover:text-teal-800 transition-colors shrink-0"
                  >
                    <ChevronLeft size={14} /> All schemas
                  </button>
                  <span className="text-slate-300">/</span>
                  <span className="text-[12px] font-bold text-slate-700 truncate">{openSchema}</span>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="text"
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    placeholder={`Filter tables in ${openSchema}…`}
                    className="flex-1 h-9 px-3.5 text-[13px] rounded-lg border border-slate-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 text-slate-800 placeholder:text-slate-400 bg-slate-50"
                  />
                  <button
                    onClick={() => { (allFilteredInSchemaSelected ? deselectAllInOpenSchema : selectAllInOpenSchema)(); markDirty(); }}
                    disabled={justSaved}
                    className="cursor-pointer h-9 px-3 text-[12px] font-semibold text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {allFilteredInSchemaSelected ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
                  {filteredTablesInSchema.map((t) => (
                    <label key={tableKey(t)} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer text-[13px]">
                      <input
                        type="checkbox"
                        checked={selectedTableKeys.has(tableKey(t))}
                        onChange={() => { toggleTable(tableKey(t)); markDirty(); }}
                        disabled={justSaved}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400 cursor-pointer disabled:cursor-not-allowed"
                      />
                      <span className="text-slate-800 font-medium">{t.table_name}</span>
                    </label>
                  ))}
                  {filteredTablesInSchema.length === 0 && (
                    <div className="py-6 text-center text-[12px] text-slate-400">No tables match "{tableSearch}".</div>
                  )}
                </div>
              </>
            )}

            {!loadingData && !loadError && (
              <div className="flex items-center justify-end gap-2 mt-3.5">
                <button
                  onClick={handleSave}
                  disabled={saving || justSaved}
                  className="cursor-pointer flex items-center gap-2 px-4 py-2 text-[12px] font-bold text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(135deg, #1D9E75, #0d6e52)' }}
                >
                  {saving ? (
                    <><Loader2 size={12} className="animate-spin" /> Saving…</>
                  ) : justSaved ? (
                    <><CheckCircle2 size={12} /> Saved</>
                  ) : (
                    <><Upload size={12} /> Save Selection</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Collapsed one-line summary, shown only while details are hidden. */}
      {!showDetails && !loadingData && !loadError && (
        <div className="px-5 pb-4 -mt-1">
          <p className="text-[12px] text-slate-500 mt-3">{summaryText}</p>
        </div>
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
  // True once the backend's persisted ITL state (downloaded/uploaded
  // flags, notebook run status, deployed-pipeline run statuses) has
  // actually been fetched and restored into itlPipelineFiles /
  // itlNotebookRunStatus for this connection. Every auto-trigger effect
  // below waits for this — without it, a page refresh briefly sees
  // "nothing has run yet" (state hasn't been restored) and immediately
  // auto-fires a real run, which is exactly what was causing pipelines
  // to fire repeatedly and lose their real completed status.
  itlStatusChecked: boolean;
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
  itlStatusChecked,
}: ItlSectionProps): JSX.Element => {
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [runningNotebook, setRunningNotebook] = useState(false);
  const [deploying, setDeploying] = useState(false);
  // Name of the last file uploaded via "Upload Filled Excel" this session
  // — shown next to the button so it's clear which file is currently in
  // use, and swaps to the new name the moment a different file is
  // uploaded. Session-local only (not persisted across a reload) since
  // the backend doesn't track the original filename, only that a file
  // was uploaded.
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoDeployTriggeredRef = useRef(false);

  const notebookRan = itlNotebookRunStatus === 'success';
  const notebookFailed = itlNotebookRunStatus === 'failed';
  const allItlDeployed = itlPipelineFiles.length > 0 && itlPipelineFiles.every((p) => p.uploadStatus === 'success');
  const anyItlFailed = itlPipelineFiles.some((p) => p.uploadStatus === 'failed');
  const [runningPipelines, setRunningPipelines] = useState(false);
  // 03_PL_InvokePipeline, 04_PL_IncrementalSourceToBronze, and
  // 05_PL_SourceDelete are sub-pipelines the Master pipeline invokes
  // internally — nested under it in the results table instead of listed
  // as their own top-level rows, toggled open/closed by clicking Master.
  const SUB_PIPELINE_SUFFIXES = ['03_PL_InvokePipeline', '04_PL_IncrementalSourceToBronze', '05_PL_SourceDelete'];
  const [masterExpanded, setMasterExpanded] = useState(false);
  // Must match the real Fabric item names from upload_itl_pipelines() exactly
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

  // Two independent collapse states — "ITL Config Creation" (download +
  // upload, manual) and "Incremental Load" (notebook run → deploy →
  // pipeline run, fully automatic). Config Creation needs a person's
  // action, so — like Table Selection — it opens itself by default and
  // only collapses once both steps are actually done; Incremental Load
  // needs no action at all, so it stays collapsed like every other
  // automatic section.
  const configCreationDone = itlConfigDownloaded && itlConfigUploaded;
  const [showConfigDetails, setShowConfigDetails] = useState(!configCreationDone);
  const [showIncrementalDetails, setShowIncrementalDetails] = useState(false);
  const incrementalDone = notebookRan && allItlDeployed && allItlPipelinesRan;
  const incrementalUnitsDone = [notebookRan, allItlDeployed, allItlPipelinesRan].filter(Boolean).length;
  const incrementalAnyRunning = runningNotebook || deploying || runningPipelines || anyItlPipelineRunning;

  // Collapse Config Creation the moment both steps finish (covers the
  // person completing them during this mount, not just a fresh remount
  // that already starts collapsed via the initializer above).
  useEffect(() => {
    if (configCreationDone) setShowConfigDetails(false);
  }, [configCreationDone]);

  // Open Incremental Load automatically if something in it actually needs
  // attention (a failed notebook run, pipeline deploy, or pipeline run) —
  // same rule as every other auto-driven section: stay collapsed until
  // there's genuinely something to look at.
  useEffect(() => {
    if (notebookFailed || anyItlFailed || anyItlPipelineFailed) setShowIncrementalDetails(true);
  }, [notebookFailed, anyItlFailed, anyItlPipelineFailed]);


  // Auto-run the ITL notebook the moment the filled Excel is uploaded —
  // no click needed. Deploy (step 4) already auto-triggers off notebookRan
  // below; this closes the gap one step earlier.
  //
  // Gated on itlStatusChecked: without it, this fires on every page
  // refresh before the persisted notebook_run_status has even been
  // fetched back — itlNotebookRunStatus briefly reads as "never run",
  // so it looked like nothing had happened yet and this kicked off a
  // brand new run every single reload.
  const autoRunNotebookRef = useRef(false);
  useEffect(() => {
    if (!itlStatusChecked || !itlConfigUploaded || notebookRan || runningNotebook || autoRunNotebookRef.current) return;
    autoRunNotebookRef.current = true;
    setRunningNotebook(true);
    onRunItlNotebook(connectionName).then((ok) => {
      setRunningNotebook(false);
      if (ok) toast.success('ITL Notebook executed');
      else { toast.error('Failed to run ITL notebook'); autoRunNotebookRef.current = false; }
    });
  }, [itlStatusChecked, itlConfigUploaded, notebookRan]);

  // NOTE: ITL pipeline running (WatermarkUpdate → MasterPipeline) is
  // deliberately NOT auto-triggered — only the manual "Run"/"Re-run"
  // button in the table below ever calls onRunItlPipelines now. This
  // used to auto-run once (gated on itlStatusChecked to avoid firing
  // before the persisted run_status had loaded back from the DB), but
  // that guard still meant a run could kick off automatically the very
  // first time deploy finished — which wasn't wanted here at all. The
  // persisted run_status (already stored in config_uploads and restored
  // by the fetch above) is simply displayed as-is until a person
  // explicitly re-runs.

  // Auto-deploy ITL pipelines once notebook succeeds
  useEffect(() => {
    if (itlStatusChecked && notebookRan && !allItlDeployed && !deploying && !autoDeployTriggeredRef.current) {
      autoDeployTriggeredRef.current = true;
      setDeploying(true);
      onUploadItlPipelines().then((ok) => {
        setDeploying(false);
        if (ok) toast.success('ITL pipelines deployed');
        else toast.error('Some ITL pipelines failed to deploy');
      });
    }
  }, [itlStatusChecked, notebookRan]);


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
    if (ok) {
      setUploadedFileName(file.name);
      toast.success('ITL Config uploaded successfully');
    } else {
      toast.error('Failed to upload ITL config');
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      {/* Card 1: ITL Config Creation — download + upload stay manual;
          these need a human to actually fill in watermark values, so
          they're intentionally exempt from auto-run. */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet size={15} className="text-emerald-600" />
              <h3 className="text-[13px] font-bold text-slate-700">ITL Config Creation</h3>
            </div>
            <div className="flex items-center gap-2">
              {configCreationDone ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-50 text-emerald-700">
                  <CheckCircle2 size={12} /> Done
                </span>
              ) : (
                <>  </>
              )}
              <button
                type="button"
                onClick={() => setShowConfigDetails((v) => !v)}
                className="cursor-pointer text-[11px] font-bold text-emerald-600 hover:text-emerald-800 transition-colors"
              >
                {showConfigDetails ? 'Hide details' : 'View details'}
              </button>
            </div>
          </div>
        </div>

        <div
          className="grid transition-[grid-template-rows] duration-300 ease-in-out"
          style={{ gridTemplateRows: showConfigDetails ? '1fr' : '0fr' }}
        >
          <div className="overflow-hidden">
            <div className={`p-5 space-y-4 transition-all duration-300 ease-in-out ${showConfigDetails ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'}`}>
              {/* Step 1: Download Excel */}
              <div className="flex items-center gap-4">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold bg-emerald-100 text-emerald-700">1</div>
                <div className="flex-1">
                  <p className="text-[12px] font-medium text-slate-700">Download ITL Config Excel</p>
                  <p className="text-[10px] text-slate-500">OTL config with watermark columns to fill</p>
                </div>
                <button
                  onClick={handleDownload}
                  disabled={loading || downloading}
                  className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${itlConfigDownloaded
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                >
                  {downloading ? (
                    <><Loader2 size={12} className="animate-spin" /> Downloading...</>
                  ) : itlConfigDownloaded ? (
                    <><CheckCircle2 size={12} /> Download</>
                  ) : (
                    <><Download size={12} /> Download</>
                  )}
                </button>
              </div>

              {/* Step 2: Upload Filled Excel */}
              <div className="flex items-center gap-4">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold bg-emerald-100 text-emerald-700">2</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-slate-700">Upload Filled Excel</p>
                  {uploadedFileName ? (
                    <p className="text-[10px] text-emerald-700 font-semibold truncate" title={uploadedFileName}>
                      {uploadedFileName}
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-500">Fill watermark fields and upload back</p>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading || uploading}
                  className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${itlConfigUploaded
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                >
                  {uploading ? (
                    <><Loader2 size={12} className="animate-spin" /> Uploading...</>
                  ) : itlConfigUploaded ? (
                    <><CheckCircle2 size={12} /> Upload</>
                  ) : (
                    <><Upload size={12} /> Upload</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Card 2: Incremental Load — notebook run, pipeline deploy, and the
          watermark/master pipeline run all fire automatically in sequence
          once the filled Excel is uploaded; the buttons below are just a
          manual fallback for a stuck/failed step. */}
      <div className={`bg-white rounded-xl border overflow-hidden shadow-sm transition-opacity duration-300 ${!itlConfigUploaded ? 'border-slate-100 opacity-60' : 'border-slate-200'}`}>
        <div className="px-5 py-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Workflow size={15} className="text-emerald-600" />
              <h3 className="text-[13px] font-bold text-slate-700">Incremental Load</h3>
            </div>
            <div className="flex items-center gap-2">
              {incrementalDone ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-50 text-emerald-700">
                  <CheckCircle2 size={12} /> Done
                </span>
              ) : !itlConfigUploaded ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-slate-100 text-slate-400">
                  <Lock size={12} /> Waiting
                </span>
              ) : notebookFailed || anyItlFailed || anyItlPipelineFailed ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-red-50 text-red-700">
                  <XCircle size={12} /> Failed
                </span>
              ) : incrementalAnyRunning ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-blue-50 text-blue-700">
                  <Loader2 size={12} className="animate-spin" /> Running
                </span>
              ) : allItlDeployed ? (
                // Notebook + deploy finished automatically; running the
                // pipelines themselves is a deliberate manual step now
                // (Run/Re-run button below) — this genuinely IS just
                // sitting here waiting for a click, not doing anything,
                // so it shouldn't look like it's still working.
                <>  </>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-blue-50 text-blue-700">
                  <Loader2 size={12} className="animate-spin" /> Creating
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowIncrementalDetails((v) => !v)}
                className="cursor-pointer text-[11px] font-bold text-emerald-600 hover:text-emerald-800 transition-colors"
              >
                {showIncrementalDetails ? 'Hide details' : 'View details'}
              </button>
            </div>
          </div>
          {itlConfigUploaded && !incrementalDone && (
            <div className="mt-2.5 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-500 ease-out"
                  style={{ width: `${Math.round((incrementalUnitsDone / 3) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] font-semibold text-slate-400 tabular-nums shrink-0">{incrementalUnitsDone}/3</span>
            </div>
          )}
        </div>

        <div
          className="grid transition-[grid-template-rows] duration-300 ease-in-out"
          style={{ gridTemplateRows: showIncrementalDetails ? '1fr' : '0fr' }}
        >
          <div className="overflow-hidden">
            <div className={`p-5 space-y-4 transition-all duration-300 ease-in-out ${showIncrementalDetails ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'}`}>
              {/* Step 3: Run ITL Notebook — auto-fires once Excel is uploaded */}
              <div className="flex items-center gap-4">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${notebookRan ? 'bg-emerald-100 text-emerald-700' : notebookFailed ? 'bg-red-100 text-red-700' : itlConfigUploaded ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                  }`}>1</div>
                <div className="flex-1">
                  <p className="text-[12px] font-medium text-slate-700">Run ITL Notebook</p>
                  <p className="text-[10px] text-slate-500">Auto-runs once the filled Excel is uploaded</p>
                </div>
                <button
                  onClick={async () => {
                    setRunningNotebook(true);
                    const ok = await onRunItlNotebook(connectionName);
                    setRunningNotebook(false);
                    if (ok) toast.success(notebookRan ? 'ITL Notebook re-executed' : 'ITL Notebook executed');
                    else toast.error('Failed to run ITL notebook');
                  }}
                  disabled={runningNotebook || !itlConfigUploaded}
                  className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${notebookFailed
                      ? 'bg-red-50 text-red-700 hover:bg-red-100'
                      : notebookRan
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : !itlConfigUploaded
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {runningNotebook ? (
                    <><Loader2 size={12} className="animate-spin" /> Running...</>
                  ) : notebookFailed ? (
                    <><XCircle size={12} /> Failed – Retry</>
                  ) : notebookRan ? (
                    <><CheckCircle2 size={12} /> Run</>
                  ) : (
                    <><Play size={12} /> Run</>
                  )}
                </button>
              </div>

              {/* Step 4: Deploy ITL Pipelines — auto-fires once the notebook succeeds */}
              <div className="flex items-center gap-4">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${allItlDeployed ? 'bg-emerald-100 text-emerald-700' : anyItlFailed ? 'bg-red-100 text-red-700' : notebookRan ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                  }`}>2</div>
                <div className="flex-1">
                  <p className="text-[12px] font-medium text-slate-700">Deploy ITL Pipelines</p>
                  <p className="text-[10px] text-slate-500">Auto-deployed once the notebook completes</p>
                </div>
                {notebookRan || allItlDeployed || anyItlFailed || deploying ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (deploying) return;
                      setDeploying(true);
                      onUploadItlPipelines().then((ok) => {
                        setDeploying(false);
                        if (ok) toast.success(allItlDeployed ? 'ITL pipelines redeployed' : 'ITL pipelines deployed');
                        else toast.error('Some ITL pipelines failed to deploy');
                      });
                    }}
                    disabled={deploying || loading}
                    className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${anyItlFailed && !allItlDeployed
                        ? 'bg-red-50 text-red-700 hover:bg-red-100'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                  >
                    {deploying ? (
                      <><Loader2 size={12} className="animate-spin" /> Deploying...</>
                    ) : anyItlFailed && !allItlDeployed ? (
                      <><XCircle size={12} /> Failed – Retry</>
                    ) : allItlDeployed ? (
                      <><CheckCircle2 size={12} /> Deploy</>
                    ) : (
                      <><Upload size={12} /> Deploy</>
                    )}
                  </button>
                ) : (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-slate-100 text-slate-400">
                    Waiting
                  </span>
                )}
              </div>

              {/* Step 5: Run Pipelines — auto-fires once deployed; WatermarkUpdate -> MasterPipeline */}
              {allItlDeployed && (
                <div className="flex items-center gap-4 mt-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${allItlPipelinesRan ? 'bg-emerald-100 text-emerald-700' : anyItlPipelineFailed ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>3</div>
                  <div className="flex-1">
                    <p className="text-[12px] font-medium text-slate-700">Run Pipelines</p>
                    <p className="text-[10px] text-slate-500">Auto-runs WatermarkUpdate → MasterPipeline in order</p>
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
                    className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${anyItlPipelineFailed
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
                      <><CheckCircle2 size={12} /> Run</>
                    ) : (
                      <><Play size={12} /> Run</>
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
                      {itlPipelineFiles
                        .filter((pl) => !SUB_PIPELINE_SUFFIXES.some((suffix) => pl.name.endsWith(`_${suffix}`)))
                        .map((pl) => {
                          const isMaster = pl.name.endsWith('_02_PL_Master pipeline');
                          const subRows = isMaster
                            ? itlPipelineFiles.filter((p) =>
                                SUB_PIPELINE_SUFFIXES.some((suffix) => p.name.endsWith(`_${suffix}`))
                              )
                            : [];
                          return (
                            <Fragment key={pl.name}>
                              <tr
                                className={`hover:bg-slate-50/50 ${isMaster ? 'cursor-pointer' : ''}`}
                                onClick={isMaster ? () => setMasterExpanded((v) => !v) : undefined}
                              >
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    {isMaster && subRows.length > 0 && (
                                      <ChevronRight
                                        size={12}
                                        className={`text-slate-400 shrink-0 transition-transform duration-200 ${masterExpanded ? 'rotate-90' : ''}`}
                                      />
                                    )}
                                    <Workflow size={12} className="text-slate-400" />
                                    <span className="text-[11px] font-medium text-slate-800">{pl.name}</span>
                                    {isMaster && subRows.length > 0 && (
                                      <span className="text-[10px] text-slate-400">({subRows.length} sub-pipeline{subRows.length === 1 ? '' : 's'})</span>
                                    )}
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
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 size={11} /> Completed</span>
                                  ) : pl.runStatus === 'running' ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600"><Loader2 size={11} className="animate-spin" /> Running</span>
                                  ) : pl.runStatus === 'failed' ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600"><XCircle size={11} /> Failed</span>
                                  ) : (
                                    <span className="text-[10px] text-slate-300">—</span>
                                  )}
                                </td>
                              </tr>
                              {isMaster && masterExpanded && subRows.map((sub) => (
                                <tr key={sub.name} className="bg-slate-50/50 hover:bg-slate-100/60">
                                  <td className="px-3 py-2 pl-9">
                                    <div className="flex items-center gap-2">
                                      <Workflow size={11} className="text-slate-300" />
                                      <span className="text-[11px] font-medium text-slate-600">{sub.name}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2">
                                    {sub.uploadStatus === 'success' ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 size={11} /> Created</span>
                                    ) : sub.uploadStatus === 'uploading' ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600"><Loader2 size={11} className="animate-spin" /> Creating</span>
                                    ) : sub.uploadStatus === 'failed' ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600"><XCircle size={11} /> Failed</span>
                                    ) : (
                                      <span className="text-[10px] font-bold text-slate-400">Pending</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2">
                                    {sub.runStatus === 'completed' ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 size={11} /> Completed</span>
                                    ) : sub.runStatus === 'running' ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600"><Loader2 size={11} className="animate-spin" /> Running</span>
                                    ) : sub.runStatus === 'failed' ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600"><XCircle size={11} /> Failed</span>
                                    ) : (
                                      <span className="text-[10px] text-slate-300">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </Fragment>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
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
          className={`flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-bold rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed ${disabled
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
            className={`flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-bold rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0 ${disabled
                ? 'bg-slate-100 text-slate-400'
                : result ? (result.failed > 0 ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100') : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
          >
            {executing ? (
              <><Loader2 size={13} className="animate-spin" /> Executing…</>
            ) : result ? (
              <><Play size={13} /> Execute Master SP</>
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
      .catch(() => {/* best-effort restore — silent */ });
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
            disabled={uploading || building}
            title={disabled ? 'Create all ITL pipelines first' : undefined}
            className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-bold rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            {uploading ? (
              <><Loader2 size={13} className="animate-spin" /> Uploading…</>
            ) : excel ? (
              <><FileSpreadsheet size={13} /> Upload Excel</>
            ) : (
              <><FileSpreadsheet size={13} /> Upload Excel</>
            )}
          </button>
          <button
            onClick={handleBuild}
            disabled={!excel || building}
            title={!excel ? 'Upload the Excel first' : undefined}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-bold rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed ${!excel
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