/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ArrowLeft, ArrowRight, Loader2, SkipBack, SkipForward, Bell, HelpCircle, User } from 'lucide-react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { SidebarStepper } from '../components/SidebarStepper';
import { StepProgressCard } from '../components/StepProgressCard';
import { ProjectsPage } from '../components/ProjectsPage';
import {
  WorkspaceSetupStep,
  SourceStep,
  MedallionStep,
  MetadataStep,
  ConfigStep,
  OverviewStep,
} from '../components/steps';
import { useSetupStore } from '../hooks';
import type { SourceConnection } from '../types';
import { useNavigate } from 'react-router-dom';
import { FininPage } from '../../finin/pages/FininPage';

const ACTIVE_PROJECT_STORAGE_KEY = 'fabric_setup_active_project';

// Fabric Accelerator and Finin Accelerator are separate apps that happen to
// share this wizard shell — each keeps its own "where was I" (open project),
// independent of the other, persisted separately so a refresh (or switching
// back and forth) reopens the right project for whichever accelerator is
// active. AI Mapping counts as Finin's side too.
type AccelMode = 'fabric' | 'finin';
const modeOf = (nav: string): AccelMode => (nav === 'finin-accelerator' || nav === 'ai-mapping' ? 'finin' : 'fabric');

const loadPersistedActiveProject = (mode: AccelMode): { id: string | null; name: string } => {
  try {
    const raw = localStorage.getItem(`${ACTIVE_PROJECT_STORAGE_KEY}_${mode}`);
    if (!raw) return { id: null, name: '' };
    const parsed = JSON.parse(raw);
    return { id: typeof parsed.id === 'string' ? parsed.id : null, name: typeof parsed.name === 'string' ? parsed.name : '' };
  } catch {
    return { id: null, name: '' };
  }
};

export const SetupPage = () => {
  const navigate = useNavigate();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeNav, setActiveNavRaw] = useState('fabric-accelerator');
  // Brief visual confirmation when the user switches between the Fabric
  // and Finin accelerators (not shown for in-mode nav like Dashboard),
  // so the re-theme reads as an intentional mode change rather than a
  // jarring color flicker.
  const [modeSwitchFlash, setModeSwitchFlash] = useState<{ mode: AccelMode; key: number } | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => loadPersistedActiveProject(modeOf('fabric-accelerator')).id);
  const [activeProjectName, setActiveProjectName] = useState<string>(() => loadPersistedActiveProject(modeOf('fabric-accelerator')).name);
  // Finin-only: the connection selected in Config when the user is sent to
  // AI Mapping, so that page can pick it up instead of asking again, and so
  // we know where to send them back once the mapping is saved.
  const [aiMappingConnectionName, setAiMappingConnectionName] = useState<string | null>(null);
  const [aiMappingReturnNav, setAiMappingReturnNav] = useState<string>('finin-accelerator');
  // True when the user reached AI Mapping via "View Mapping" for a
  // connection that's already been mapped — Manual Mapping's Save is
  // disabled in that case so a read-only revisit can't silently overwrite
  // a mapping that Bronze/Silver may already be reading from.
  const [aiMappingReadOnly, setAiMappingReadOnly] = useState(false);
  // Finin-only: connections whose mapping has already been saved to
  // SourceInformationSchemaMapped. Once a connection is in this set, the
  // "Go to AI Mapping" prompt in Config stays hidden for it — no need to
  // send the user back through mapping again after they've returned.
  const [mappedConnectionNames, setMappedConnectionNames] = useState<Set<string>>(new Set());

  // Keep the persisted active project in sync (per accelerator) so a page
  // refresh reopens the same project (and, combined with useSetupStore's own
  // persistence, the same wizard step) instead of dropping back to the
  // projects list.
  useEffect(() => {
    const mode = modeOf(activeNav);
    try {
      if (activeProjectId) {
        localStorage.setItem(`${ACTIVE_PROJECT_STORAGE_KEY}_${mode}`, JSON.stringify({ id: activeProjectId, name: activeProjectName }));
      } else {
        localStorage.removeItem(`${ACTIVE_PROJECT_STORAGE_KEY}_${mode}`);
      }
    } catch {
      /* localStorage unavailable — non-fatal, just skip persistence */
    }
  }, [activeNav, activeProjectId, activeProjectName]);

  // Switching accelerators resumes wherever that accelerator's project list
  // last left off; currentStep/selectedConnection for whatever project that
  // resolves to are restored automatically inside useSetupStore (keyed by
  // project id, so they need no extra handling here).
  const setActiveNav = (nextNav: string) => {
    const fromMode = modeOf(activeNav);
    const toMode = modeOf(nextNav);
    if (fromMode !== toMode) {
      const resume = loadPersistedActiveProject(toMode);
      setActiveProjectId(resume.id);
      setActiveProjectName(resume.name);
      setModeSwitchFlash({ mode: toMode, key: Date.now() });
    }
    setActiveNavRaw(nextNav);
  };

  // Clear the flash/pill after its animation finishes so it can re-trigger
  // cleanly on the next switch.
  useEffect(() => {
    if (!modeSwitchFlash) return;
    const timeout = setTimeout(() => setModeSwitchFlash(null), 1500);
    return () => clearTimeout(timeout);
  }, [modeSwitchFlash]);

  const {
    state,
    setCurrentStep,
    updateWorkspace,
    updateCredentials,
    addConnection,
    selectConnection,
    updateMedallionLayer,
    updateMedallionLayerType,
    updateConfigTask,
    updatePipeline,
    updateWarehouseName,
    provisionWorkspaceToBackend,
    fetchCredentialsFromBackend,
    saveCredentialsToBackend,
    addConnectionToBackend,
    deleteConnectionFromBackend,
    createMedallionInBackend,
    createMetadataInBackend,
    createLogInBackend,
    fetchNotebooks,
    uploadNotebooksToFabric,
    fetchPipelineFiles,
    uploadPipelinesToFabric,
    runPipelineFromFiles,
    downloadItlConfigExcel,
    uploadItlConfigExcel,
    uploadItlPipelinesToFabric,
    runItlNotebook,
    runItlPipelineSequence,
    deployGoldStoredProcedures,
    deployMasterExecutor,
    executeMasterSp,
    uploadSemanticModelExcel,
    fetchSemanticModelStatus,
    buildSemanticModel,
    clearError,
  } = useSetupStore(activeProjectId);

  // Finin-only: whenever the connections list (re)loads — including after a
  // page reload — merge in any connection whose mapping was already
  // persisted server-side (aiMappingSaved), so the "Go to AI Mapping" prompt
  // stays hidden without depending on in-session state alone.
  useEffect(() => {
    const persistedMapped = state.connections.filter((c) => c.aiMappingSaved).map((c) => c.name);
    if (persistedMapped.length === 0) return;
    setMappedConnectionNames((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const name of persistedMapped) {
        if (!next.has(name)) {
          next.add(name);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [state.connections]);

  // Load saved credentials when project changes
  useEffect(() => {
    if (activeProjectId) {
      fetchCredentialsFromBackend();
    }
  }, [activeProjectId, fetchCredentialsFromBackend]);

  // If a connection is still mid-creation (status 'creating') — including
  // one that was left that way by a reload during the original create
  // request — poll until it resolves to 'active'/'failed' instead of making
  // the user manually refresh to find out.
  useEffect(() => {
    if (!activeProjectId) return;
    const anyCreating = state.connections.some((c) => c.status === 'creating');
    if (!anyCreating) return;
    const interval = setInterval(() => {
      fetchCredentialsFromBackend();
    }, 3000);
    return () => clearInterval(interval);
  }, [activeProjectId, state.connections, fetchCredentialsFromBackend]);

  const userName = useMemo(() => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return 'User';
      const payload = JSON.parse(atob(token.split('.')[1]));
      const email = payload.email || payload.preferred_username || payload.sub || '';
      const atIndex = email.indexOf('@');
      return atIndex > 0 ? email.substring(0, atIndex) : email || 'User';
    } catch {
      return 'User';
    }
  }, []);

  const validateCurrentStep = (): string | null => {
    switch (state.currentStep) {
      case 0: {
        if (state.credentialsSaved) return null;
        if (!state.workspace.workspaceId) return 'Please provision a workspace first';
        return null;
      }
      case 1: {
        const unnamedLayers = state.medallionLayers.filter((l) => !l.name.trim());
        const unvalidatedLayers = state.medallionLayers.filter((l) => !l.validated);
        if (unnamedLayers.length > 0)
          return `Please fill in names for: ${unnamedLayers.map((l) => l.label).join(', ')}`;
        if (unvalidatedLayers.length > 0)
          return 'Please create the Medallion architecture first';
        return null;
      }
      case 2: {
        if (!state.metadataSetup.warehouseName.trim()) return 'Please fill in: Warehouse Name';
        if (!state.metadataSetup.metadataCreated) return 'Please create the metadata warehouse first';
        if (!state.metadataSetup.logCreated) return 'Please run the log setup first';
        return null;
      }
      case 3: {
        if (state.connections.length === 0) return 'Please add at least one source connection';
        return null;
      }
      case 4: {
        if (!state.selectedConnection) return 'Please select a connection';
        return null;
      }
      default:
        return null;
    }
  };

  const handleNext = async () => {
    clearError();
    const error = validateCurrentStep();
    if (error) {
      toast.warning(error);
      return;
    }
    if (state.currentStep === 0 && !state.credentialsSaved) {
      toast.warning('Please provision a workspace first');
      return;
    }
    if (state.currentStep < 5) {
      setCurrentStep(state.currentStep + 1);
    }
  };

  // Medallion (step 1) is otherwise a single manual "Create in Fabric"
  // click — auto-fire it the moment layer names are set (they default to
  // sensible names already) so nobody has to click anything here, then
  // auto-advance to the next step the instant every layer validates.
  // Guarded so a person who navigates back to this step to tweak
  // something doesn't get auto-created/advanced out from under them a
  // second time.
  const medallionAutoCreateRef = useRef(false);
  const medallionAutoAdvanceRef = useRef(false);
  useEffect(() => {
    if (state.currentStep !== 1) return;
    const allNamed = state.medallionLayers.every((l) => l.name.trim());
    const allValidated = state.medallionLayers.every((l) => l.validated);
    if (allValidated) {
      if (!medallionAutoAdvanceRef.current) {
        medallionAutoAdvanceRef.current = true;
        handleNext();
      }
      return;
    }
    if (allNamed && !state.loading && !medallionAutoCreateRef.current) {
      medallionAutoCreateRef.current = true;
      createMedallionInBackend();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentStep, state.medallionLayers.map((l) => `${l.name}:${l.validated}`).join(','), state.loading]);

  // Step 0 (Workspace): provisioning itself stays the one deliberate
  // manual action ("create project") — but the instant it succeeds,
  // auto-advance straight into Medallion rather than making the person
  // click Next for something that already finished.
  //
  // Gated on workspace.workspaceId, NOT credentialsSaved: saving the SP
  // credentials alone (saveCredentialsToBackend, a separate, earlier
  // action) also sets credentialsSaved=true, before the workspace is
  // actually provisioned. Watching credentialsSaved alone auto-advanced
  // to Medallion right after entering SP details — before a workspace
  // existed at all — so Medallion's own auto-create immediately failed
  // with "workspace not provisioned" and the person had to come back
  // here and provision manually. workspaceId is only ever set once
  // provisionWorkspaceToBackend actually succeeds, so that's the real
  // signal to advance on.
  const workspaceAutoAdvanceRef = useRef(false);
  useEffect(() => {
    if (state.currentStep !== 0) return;
    if (state.workspace.workspaceId && !workspaceAutoAdvanceRef.current) {
      workspaceAutoAdvanceRef.current = true;
      handleNext();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentStep, state.workspace.workspaceId]);

  // Step 2 (Metadata warehouse + log setup): auto-create WH_MetaData, then
  // auto-create the log objects, then auto-advance into Source Connections
  // — which is where automation deliberately stops. Source connections
  // are added manually, and (per Config Step's own gating) nothing else
  // auto-runs until the person explicitly clicks Create on Metadata for a
  // chosen connection — this step just gets them there without clicking
  // through two more "Create" buttons for setup that doesn't need a
  // decision.
  const metadataAutoCreateRef = useRef(false);
  const metadataAutoLogRef = useRef(false);
  const metadataAutoAdvanceRef = useRef(false);
  useEffect(() => {
    if (state.currentStep !== 2) return;
    const { metadataCreated, logCreated } = state.metadataSetup;
    if (metadataCreated && logCreated) {
      if (!metadataAutoAdvanceRef.current) {
        metadataAutoAdvanceRef.current = true;
        handleNext();
      }
      return;
    }
    if (state.loading) return;
    if (!metadataCreated && !metadataAutoCreateRef.current) {
      metadataAutoCreateRef.current = true;
      createMetadataInBackend();
      return;
    }
    if (metadataCreated && !logCreated && !metadataAutoLogRef.current) {
      metadataAutoLogRef.current = true;
      createLogInBackend();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentStep, state.metadataSetup.metadataCreated, state.metadataSetup.logCreated, state.loading]);

  // Drives the Next button's dimmed "not ready yet" look — mirrors both
  // gates handleNext itself checks (validateCurrentStep() plus the
  // separate credentialsSaved check for step 0), so the button's look
  // never disagrees with what clicking it will actually do. See the
  // button's own comment for why this is visual-only rather than the
  // native `disabled` attribute.
  const stepIncomplete = !!validateCurrentStep() || (state.currentStep === 0 && !state.credentialsSaved);

  const handleBack = () => {    if (activeProjectId && state.currentStep > 0) {
      setCurrentStep(state.currentStep - 1);
    } else if (activeProjectId && state.currentStep === 0) {
      setActiveProjectId(null);
      setActiveProjectName('');
    } else {
      navigate('/');
    }
  };

  const handleAddConnection = async (connection: {
    name: string;
    databaseType: string;
    server: string;
    databaseName: string;
    username: string;
    password: string;
  }) => {
    await addConnectionToBackend(connection);
  };

  const handleDeleteConnection = async (connection: SourceConnection): Promise<boolean> => {
    return (await deleteConnectionFromBackend(connection)) ?? false;
  };

  const handleRunTask = (taskId: string) => {
    updateConfigTask(taskId, 'running');
    setTimeout(() => updateConfigTask(taskId, 'completed'), 2000);
  };

  const handleRunPipelineFromFiles = (pipelineName: string) => {
    runPipelineFromFiles(pipelineName);
  };

  const sidebarWidth = isSidebarCollapsed ? 68 : 260;
  const progress = Math.round(((state.currentStep + 1) / 6) * 100);

  const stepTitles = [
    'Workspace Setup',
    'Source Connections',
    'Medallion Architecture',
    'Metadata Setup',
    'Configuration Setup',
    'Setup Overview',
  ];

  // Human-readable labels for the breadcrumb's second segment when not
  // inside an open project (e.g. browsing the AI Mapping tool or Dashboard).
  const navLabels: Record<string, string> = {
    'dashboard': 'Dashboard',
    'ai-mapping': 'AI Mapping',
  };

  const renderStep = () => {
    switch (state.currentStep) {
      case 0:
        return (
          <WorkspaceSetupStep
            workspaceId={state.workspace.workspaceId || null}
            workspaceName={state.workspace.workspaceName || ''}
            capacityAssigned={state.workspace.capacityAssigned}
            onProvision={provisionWorkspaceToBackend}
            loading={state.loading}
            error={state.error}
            credentialsSaved={state.credentialsSaved}
            credentials={state.credentials}
            onUpdateCredentials={updateCredentials}
            onSaveCredentials={saveCredentialsToBackend}
          />
        );
      case 1:
        return (
          <MedallionStep
            layers={state.medallionLayers}
            onUpdateLayer={(key, name) => updateMedallionLayer(key, { name })}
            onUpdateLayerType={(key, itemType) => updateMedallionLayerType(key, itemType)}
            onValidateLayer={(key) => updateMedallionLayer(key, { validated: true })}
            onCreateInFabric={createMedallionInBackend}
            loading={state.loading}
            error={state.error}
          />
        );
      case 2:
        return (
          <MetadataStep
            metadataSetup={state.metadataSetup}
            connections={state.connections}
            selectedConnection={state.selectedConnection}
            onWarehouseNameChange={updateWarehouseName}
            onCreateMetadata={createMetadataInBackend}
            onCreateLog={createLogInBackend}
            onSelectConnection={selectConnection}
            loading={state.loading}
            error={state.error}
          />
        );
      case 3:
        return (
          <SourceStep
            connections={state.connections}
            onAddConnection={handleAddConnection}
            onDeleteConnection={handleDeleteConnection}
            loading={state.loading}
            error={state.error}
            projectId={activeProjectId}
          />
        );
      case 4:
        return (
          <ConfigStep
            projectId={activeProjectId || ''}
            connections={state.connections}
            connectionsLoading={state.connectionsLoading}
            selectedConnection={state.selectedConnection}
            configTasks={state.configTasks}
            notebooks={state.notebooks}
            pipelineFiles={state.pipelineFiles}
            appMode={activeNav === 'finin-accelerator' ? 'finin' : 'fabric'}
            isConnectionMapped={
              !!state.connections.find((c) => c.id === state.selectedConnection) &&
              mappedConnectionNames.has(
                state.connections.find((c) => c.id === state.selectedConnection)?.name || ''
              )
            }
            onGoToAIMapping={
              activeNav === 'finin-accelerator'
                ? () => {
                    const conn = state.connections.find((c) => c.id === state.selectedConnection);
                    const alreadyMapped = !!conn && mappedConnectionNames.has(conn.name);
                    setAiMappingConnectionName(conn?.name || null);
                    setAiMappingReturnNav(activeNav);
                    setAiMappingReadOnly(alreadyMapped);
                    setActiveNav('ai-mapping');
                  }
                : undefined
            }
            onSelectConnection={selectConnection}
            onRunTask={handleRunTask}
            onFetchNotebooks={fetchNotebooks}
            onUploadNotebooks={uploadNotebooksToFabric}
            onFetchPipelines={fetchPipelineFiles}
            onUploadPipelines={uploadPipelinesToFabric}
            onRunPipeline={handleRunPipelineFromFiles}
            itlConfigDownloaded={state.itlConfigDownloaded}
            itlConfigUploaded={state.itlConfigUploaded}
            itlUploadedFileName={state.itlUploadedFileName}
            itlPipelineFiles={state.itlPipelineFiles}
            onDownloadItlConfig={downloadItlConfigExcel}
            onUploadItlConfig={uploadItlConfigExcel}
            onUploadItlPipelines={uploadItlPipelinesToFabric}
            onRunItlNotebook={async (connectionName: string) => {
              try {
                await runItlNotebook(connectionName);
                return true;
              } catch {
                return false;
              }
            }}
            itlNotebookRunStatus={state.itlNotebookRunStatus}
            itlStatusChecked={state.itlStatusChecked}
            onRunItlPipelines={runItlPipelineSequence}
            onDeployGoldStoredProcedures={deployGoldStoredProcedures}
            onDeployMasterExecutor={deployMasterExecutor}
            onExecuteMasterSp={executeMasterSp}
            onUploadSemanticModelExcel={uploadSemanticModelExcel}
            onFetchSemanticModelStatus={fetchSemanticModelStatus}
            onBuildSemanticModel={buildSemanticModel}
            loading={state.loading}
            configLoading={state.configLoading}
          />
        );
      case 5:
        return <OverviewStep setupState={state} />;
      default:
        return null;
    }
  };

  const currentMode = modeOf(activeNav);

  return (
    <div className="min-h-screen bg-[#e8ecf1] font-sans">
      {/* Layered, softly animated backdrop — hue shifts between Fabric's
       * warmer forest-green and Finin's cooler teal-green depending on
       * mode, cross-fading rather than snapping. */}
      <div className={`accel-bg accel-bg--fabric ${currentMode === 'fabric' ? 'opacity-100' : 'opacity-0'}`} />
      <div className={`accel-bg accel-bg--finin ${currentMode === 'finin' ? 'opacity-100' : 'opacity-0'}`} />

      {/* Mode-switch confirmation: pill toast only (the center radial
       * flash was removed — it read as a stray popping circle rather
       * than a deliberate transition). */}
      {modeSwitchFlash && (
        <div
          key={`pill-${modeSwitchFlash.key}`}
          className="mode-switch-pill"
          style={{ background: modeSwitchFlash.mode === 'finin' ? 'linear-gradient(135deg, #14b8a6, #0f766e)' : 'linear-gradient(135deg, #1D9E75, #0d6e52)' }}
        >
          <span className="mode-switch-pill-dot" />
          Switched to {modeSwitchFlash.mode === 'finin' ? 'Finin Accelerator' : 'Fabric Accelerator'}
        </div>
      )}

      {/* Sidebar */}
      <SidebarStepper
        currentStep={state.currentStep}
        onStepClick={setCurrentStep}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        activeNav={activeNav}
        onNavChange={setActiveNav}
      />

      {/* Main content area */}
      <div
        className="min-h-screen flex flex-col transition-all duration-300 relative z-10"
        style={{ marginLeft: sidebarWidth }}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-200/80">
          <div className="flex items-center justify-between h-14 px-8">
            {/* Left: breadcrumb + nav arrows */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-[12px]">
                <span className="text-slate-400">
                  {modeOf(activeNav) === 'finin' ? 'Finin Accelerator' : 'Fabric Accelerator'}
                </span>
                <span className="text-slate-300">/</span>
                {(activeNav === 'fabric-accelerator' || activeNav === 'finin-accelerator') && activeProjectId && activeProjectName ? (
                  <>
                    <span
                      className="text-emerald-600 font-medium cursor-pointer hover:underline"
                      onClick={() => { setActiveProjectId(null); setActiveProjectName(''); }}
                    >
                      {activeProjectName}
                    </span>
                    <span className="text-slate-300">/</span>
                    <span className="text-slate-700 font-semibold">
                      {stepTitles[state.currentStep] || 'Setup'}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-700 font-semibold">
                    {activeNav === 'fabric-accelerator' || activeNav === 'finin-accelerator'
                      ? 'Projects'
                      : navLabels[activeNav] || activeNav.charAt(0).toUpperCase() + activeNav.slice(1)}
                  </span>
                )}
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-3">

              <div className="w-px h-4 bg-slate-200" />

              <button className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                <Bell size={14} />
              </button>
              <button className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                <HelpCircle size={14} />
              </button>

              <div className="w-px h-4 bg-slate-200" />

              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center">
                  <User size={14} className="text-white" />
                </div>
                <span className="text-[12px] font-semibold text-slate-700">{userName}</span>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-0.5 bg-slate-100">
            <div
              className="h-full transition-all duration-700"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(to right, #1D9E75, #5dd4a8)',
              }}
            />
          </div>
        </header>

        {/* Step content */}
        <main className="flex-1 px-10 py-5">
          {(activeNav === 'fabric-accelerator' || activeNav === 'finin-accelerator') && (
            activeProjectId ? (
              /* Setup wizard for selected project — same steps either way;
               * appMode only changes how the Config step behaves. */
              <div className={activeNav === 'finin-accelerator' ? 'finin-theme' : ''}>
                <div className="flex gap-8 items-start">
                  <div className="flex-1 min-w-0">
                    {renderStep()}
                  </div>
                  <div className="sticky top-[72px] hidden xl:flex flex-col gap-4">
                    <StepProgressCard currentStep={state.currentStep} highestStepReached={state.highestStepReached} />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleBack}
                        className="flex-1 h-9 rounded-lg flex items-center justify-center gap-1.5 border border-slate-200 bg-white text-slate-600 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-600 transition-all shadow-sm text-[11px] font-bold"
                      >
                        <ArrowLeft size={14} strokeWidth={2} />
                        Back
                      </button>
                      <button
                        onClick={handleNext}
                        disabled={state.currentStep >= 5}
                        // Deliberately NOT tied to state.loading: that flag
                        // is shared by every background auto-process (this
                        // step's own auto-create/auto-advance, an in-flight
                        // notebook/pipeline upload, etc.), so wiring it to
                        // `disabled` made Next genuinely unclickable for as
                        // long as anything was running in the background —
                        // exactly backwards from "keep working normally
                        // while automation runs." Only the step count
                        // (nothing left to advance to) uses the real
                        // `disabled` attribute now.
                        //
                        // Also deliberately NOT using the native `disabled`
                        // attribute for "step incomplete" — a truly
                        // disabled button can't be clicked at all, so
                        // there'd be no way to tell the person WHY it
                        // won't advance. Instead it only *looks* disabled
                        // (dimmed, not-allowed cursor) while incomplete;
                        // the click still fires and handleNext's own
                        // validateCurrentStep() shows the specific
                        // "please fill in ___" toast.
                        aria-disabled={stepIncomplete}
                        className={`cursor-pointer flex-1 h-9 rounded-lg flex items-center justify-center gap-1.5 text-white transition-all shadow-sm text-[11px] font-bold disabled:opacity-40 disabled:cursor-not-allowed ${
                          stepIncomplete ? 'opacity-40 cursor-not-allowed' : ''
                        }`}
                        style={{ background: activeNav === 'finin-accelerator' ? 'linear-gradient(135deg, #14b8a6, #0f766e)' : 'linear-gradient(135deg, #1D9E75, #0d6e52)' }}
                      >
                        Next
                        <ArrowRight size={14} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <ProjectsPage
                appType={activeNav === 'finin-accelerator' ? 'finin' : 'fabric'}
                onOpenProject={(projectId, projectName) => {
                  // Don't force step 0 here — useSetupStore already restores
                  // this project's last known step (0 for a project that's
                  // never been opened, whatever it left off at otherwise).
                  // Forcing it here would throw away real progress every
                  // time you reopen an in-progress project from the list.
                  setActiveProjectId(projectId);
                  setActiveProjectName(projectName);
                }}
              />
            )
          )}

          {/* AI Mapping stays mounted at all times (just hidden when not
           * active) instead of being conditionally rendered — a mapping job
           * lives in FininApp's local state, and unmounting it (e.g. if the
           * user accidentally clicks away mid-run) would throw that progress
           * away and force the whole thing to restart from scratch. */}
          <div style={{ display: activeNav === 'ai-mapping' ? 'block' : 'none' }}>
            <FininPage
              connections={state.connections}
              projectId={activeProjectId}
              initialConnectionName={aiMappingConnectionName}
              readOnly={aiMappingReadOnly}
              onMappingSaved={() => {
                if (aiMappingConnectionName) {
                  setMappedConnectionNames((prev) => new Set(prev).add(aiMappingConnectionName));
                }
                setAiMappingConnectionName(null);
                setActiveNav(aiMappingReturnNav);
              }}
              onOpenProject={(projectId, projectName) => {
                setActiveProjectId(projectId);
                setActiveProjectName(projectName);
              }}
            />
          </div>

          {activeNav !== 'fabric-accelerator' && activeNav !== 'finin-accelerator' && activeNav !== 'ai-mapping' && (
            <div className="flex items-center justify-center py-20">
              <p className="text-sm text-slate-400">
                {navLabels[activeNav] || (activeNav.charAt(0).toUpperCase() + activeNav.slice(1))} — coming soon
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};