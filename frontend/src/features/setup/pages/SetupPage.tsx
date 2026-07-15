/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ArrowLeft, ArrowRight, Loader2, SkipBack, SkipForward, Bell, HelpCircle, User } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
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
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => loadPersistedActiveProject(modeOf('fabric-accelerator')).id);
  const [activeProjectName, setActiveProjectName] = useState<string>(() => loadPersistedActiveProject(modeOf('fabric-accelerator')).name);
  // Finin-only: the connection selected in Config when the user is sent to
  // AI Mapping, so that page can pick it up instead of asking again, and so
  // we know where to send them back once the mapping is saved.
  const [aiMappingConnectionName, setAiMappingConnectionName] = useState<string | null>(null);
  const [aiMappingReturnNav, setAiMappingReturnNav] = useState<string>('finin-accelerator');
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
    }
    setActiveNavRaw(nextNav);
  };

  const {
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
    provisionWorkspaceToBackend,
    fetchCredentialsFromBackend,
    saveCredentialsToBackend,
    addConnectionToBackend,
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
    clearError,
  } = useSetupStore(activeProjectId);

  // Load saved credentials when project changes
  useEffect(() => {
    if (activeProjectId) {
      fetchCredentialsFromBackend();
    }
  }, [activeProjectId, fetchCredentialsFromBackend]);

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
          return `Please validate: ${unvalidatedLayers.map((l) => l.label).join(', ')}`;
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

  const handleBack = () => {
    if (activeProjectId && state.currentStep > 0) {
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
            loading={state.loading}
            error={state.error}
            projectId={activeProjectId}
          />
        );
      case 4:
        return (
          <ConfigStep
            connections={state.connections}
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
                    setAiMappingConnectionName(conn?.name || null);
                    setAiMappingReturnNav(activeNav);
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
            onRunItlPipelines={runItlPipelineSequence}
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

  return (
    <div className="min-h-screen bg-[#e8ecf1] font-sans">
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
        className="min-h-screen flex flex-col transition-all duration-300"
        style={{ marginLeft: sidebarWidth }}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-slate-200/80">
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
                    <StepProgressCard currentStep={state.currentStep} />
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
                        disabled={state.currentStep >= 5 || state.loading}
                        className="flex-1 h-9 rounded-lg flex items-center justify-center gap-1.5 text-white transition-all disabled:opacity-40 shadow-sm text-[11px] font-bold"
                        style={{ background: activeNav === 'finin-accelerator' ? 'linear-gradient(135deg, #4F46E5, #3730A3)' : 'linear-gradient(135deg, #1D9E75, #0d6e52)' }}
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