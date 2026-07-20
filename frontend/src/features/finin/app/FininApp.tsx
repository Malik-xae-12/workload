import { useEffect, useRef, useState } from "react";
import { ConnectionForm } from "../connection/components/ConnectionForm";
import { ProgressPanel } from "../mapping/components/ProgressPanel";
import { StatsDashboard } from "../mapping/components/StatsDashboard";
import { ResultsTable } from "../mapping/components/ResultsTable";
import ManualMapping from "../mapping/components/ManualMapping";
import ChatPanel from "../mapping/components/ChatPanel";
import ErrorBoundary from "../shared/components/ErrorBoundary";
import { useMapping } from "../mapping/hooks/useMapping";
import "../shared/styles/App.css";
import type { SourceConnection } from "../../setup/types";

interface Props {
  connections: SourceConnection[];
  projectId: string | null;
  /** When arriving here via the Config step's "AI Mapping" redirect, this is
   * the connection the user had selected there — preselect it and carry on
   * instead of making them pick it again. */
  initialConnectionName?: string | null;
  /** Called once the mapping has been saved to SourceInformationSchemaMapped,
   * so the Config step can pull the user back to finish Bronze/Silver. */
  onMappingSaved?: () => void;
}

export default function FininApp({ connections, projectId, initialConnectionName, onMappingSaved }: Props) {
  const [connectionName, setConnectionName] = useState(initialConnectionName || connections[0]?.name || "");

  const {
    job, testing, saving, connectionOk, connectionMsg,
    testConnection, testConnectionForProject, runMapping, runMappingForProject,
    getProjectConnectionInfo, downloadCsv, downloadXlsx, downloadColumnConfig,
    applyOverrides, saveToMetadata, reset, apiBase,
  } = useMapping(projectId, connectionName);

  const [showManual, setShowManual] = useState(false);
  const [projectClientId, setProjectClientId] = useState<string | null>(null);
  const [savedToMetadata, setSavedToMetadata] = useState(false);
  const [excelDownloaded, setExcelDownloaded] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);

  useEffect(() => {
    if (!projectId) { setProjectClientId(null); return; }
    getProjectConnectionInfo(projectId).then((info) => setProjectClientId(info?.client_id || null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Arrived here from the Config step with a connection already chosen —
  // pick it up and immediately test it so the user just has to hit Run.
  // Keyed to *which* connection, not just "has this ever run": if the user
  // comes back for the same connection they left mid-mapping, we leave
  // everything alone so they resume where they left off. If they come back
  // for a *different* connection (e.g. finished saving Source A, switched
  // to Source B in Config, clicked "Go to AI Mapping" again), the stale
  // job/result from Source A must be cleared instead of just being shown.
  const lastAutoConnRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialConnectionName || !projectId) return;
    if (lastAutoConnRef.current === initialConnectionName) return; // same source — resume as-is
    const isSwitchingSource = lastAutoConnRef.current !== null;
    lastAutoConnRef.current = initialConnectionName;
    if (isSwitchingSource) {
      reset();
      setShowManual(false);
    }
    setConnectionName(initialConnectionName);
    testConnectionForProject({ project_id: projectId, connection_name: initialConnectionName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConnectionName, projectId]);

  const isDone = job?.status === "done";
  const isActive = job && !isDone && job.status !== "error";

  useEffect(() => {
    const onOpen = () => setShowManual(true);
    window.addEventListener("open-manual-mapping", onOpen as EventListener);
    return () => window.removeEventListener("open-manual-mapping", onOpen as EventListener);
  }, []);

  const handleManualSave = async (overrides: Record<string, { source_table: string; source_column: string }>) => {
    if (!job?.job_id) { setShowManual(false); return; }
    try {
      await applyOverrides(job.job_id, overrides);
    } catch (e) {
      console.error(e);
    }
    setShowManual(false);
  };

  useEffect(() => {
    setSavedToMetadata(false);
    setExcelDownloaded(false);
  }, [job?.job_id]);

  const handleSaveToMetadata = async () => {
    if (!job?.job_id) return;
    if (!projectId) { alert("Open a Fabric project first (Projects tab) so mappings have a destination."); return; }
    if (!connectionName) { alert("Select a source connection to save into."); return; }
    try {
      const res = await saveToMetadata(job.job_id, projectId, connectionName);
      setSavedToMetadata(true);
      alert(`Saved ${res.inserted} rows to SourceInformationSchemaMapped (Config_${connectionName}).`);
      if (onMappingSaved) onMappingSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save mapping to metadata.");
    }
  };

  const handleDownloadExcel = async () => {
    if (!job?.job_id) return;
    setDownloadingExcel(true);
    try {
      await downloadColumnConfig(job.job_id);
      setExcelDownloaded(true);
    } finally {
      setDownloadingExcel(false);
    }
  };

  return (
    <div className="finin-app">
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <div className="logo-mark"><span>F</span></div>
            <div>
              <span className="logo-title">Finin</span>
              <span className="logo-sub">Column Mapping Intelligence</span>
            </div>
          </div>
          {job && <button className="btn-ghost" onClick={reset}>← New Mapping</button>}
        </div>
      </header>

      <main className="app-main">
        {showManual && isDone && job?.result && (
          <ErrorBoundary>
            <ManualMapping
              rows={job.result.rows}
              sourceColumnsByTable={job.result.source_columns_by_table}
              onSave={handleManualSave}
              onBack={() => setShowManual(false)}
              onDownloadXlsx={(f) => downloadXlsx(job.job_id, f)}
            />
            <ChatPanel jobId={job.job_id} apiBase={apiBase} />
          </ErrorBoundary>
        )}

        {!showManual && !job && (
          <div className="landing">
            <div className="landing-hero">
              <span className="eyebrow"><span className="eyebrow-dot" />AI-Powered Column Mapping</span>
              <h1>Map columns with meaning,<br /><em>not just names.</em></h1>
              <p>
                Connect your Azure SQL databases and let semantic embeddings automatically match
                source columns to your financial analytics template — with confidence scores and
                full auditability. Finished mappings save straight into your Fabric Accelerator
                metadata (SourceInformationSchemaMapped).
              </p>
              <ol className="hero-steps">
                <li>
                  <span className="hero-step-num">1</span>
                  <div>
                    <strong>Connect</strong>
                    <span>Pick a source connection or enter Azure SQL credentials directly.</span>
                  </div>
                </li>
                <li>
                  <span className="hero-step-num">2</span>
                  <div>
                    <strong>Match</strong>
                    <span>Semantic embeddings score every column against the financial template.</span>
                  </div>
                </li>
                <li>
                  <span className="hero-step-num">3</span>
                  <div>
                    <strong>Save</strong>
                    <span>Review, adjust, and commit results to SourceInformationSchemaMapped.</span>
                  </div>
                </li>
              </ol>
            </div>
            <ConnectionForm
              onTest={testConnection}
              onRun={runMapping}
              testing={testing}
              connectionOk={connectionOk}
              connectionMsg={connectionMsg}
              projectId={projectId}
              projectClientId={projectClientId}
              connections={connections}
              connectionName={connectionName}
              onConnectionNameChange={setConnectionName}
              onTestProject={testConnectionForProject}
              onRunProject={runMappingForProject}
            />
          </div>
        )}

        {isActive && (
          <div className="running-view">
            <h2>Running Semantic Mapping</h2>
            <ProgressPanel job={job} />
          </div>
        )}

        {job?.status === "error" && (
          <div className="running-view">
            <h2>Mapping Failed</h2>
            <ProgressPanel job={job} />
          </div>
        )}

        {showManual ? null : isDone && job?.result && (
          <div className="results-view">
            <div className="results-header">
              <div>
                <h2>Mapping Complete</h2>
                <p className="results-sub">
                  Processed {job.result.stats?.total_templates ?? job.result.rows.length} template columns
                  across {job.result.stats?.template_tables ?? new Set(job.result.rows.map((r) => r.template_table)).size} template tables.
                </p>
              </div>
              <div className="form-actions">
                <button className="btn-manual" onClick={() => setShowManual(true)}>
                  ✎ Manual Mapping
                </button>
              </div>
            </div>

            <div className="se-card">
              <div className="se-card-header">Save & Export</div>

              {/* Step 1: Save to metadata */}
              <div className="se-step">
                <div className={`se-num ${savedToMetadata ? 'se-num--done' : ''}`}>1</div>
                <div className="se-step-info">
                  <div className="se-step-title">Save to SourceInformationSchemaMapped</div>
                  <div className="se-step-sub">Writes mapping rows into Config_{connectionName || '…'}</div>
                </div>
                <select
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  className="se-select"
                >
                  <option value="">Select Fabric connection…</option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
                <div className="se-actions">
                  <button
                    className={`se-btn ${savedToMetadata ? 'se-btn--done' : ''}`}
                    onClick={handleSaveToMetadata}
                    disabled={saving || !connectionName || savedToMetadata}
                  >
                    {savedToMetadata ? 'Saved' : saving ? 'Saving...' : 'Save'}
                  </button>
                  {savedToMetadata && (
                    <button
                      className="se-btn se-btn--ghost"
                      onClick={handleSaveToMetadata}
                      disabled={saving || !connectionName}
                    >
                      Re-save
                    </button>
                  )}
                </div>
              </div>

              {/* Step 2: Download Column Config Excel */}
              <div className="se-step">
                <div className={`se-num ${excelDownloaded ? 'se-num--done' : ''}`}>2</div>
                <div className="se-step-info">
                  <div className="se-step-title">Download Column Config Excel</div>
                  <div className="se-step-sub">Full mapping export for this run</div>
                </div>
                <div className="se-actions">
                  <button
                    className={`se-btn ${excelDownloaded ? 'se-btn--done' : ''}`}
                    onClick={handleDownloadExcel}
                    disabled={downloadingExcel || excelDownloaded}
                  >
                    {excelDownloaded ? 'Downloaded' : downloadingExcel ? 'Downloading...' : 'Download'}
                  </button>
                  {excelDownloaded && (
                    <button
                      className="se-btn se-btn--ghost"
                      onClick={handleDownloadExcel}
                      disabled={downloadingExcel}
                    >
                      Re-download
                    </button>
                  )}
                </div>
              </div>
            </div>

            <StatsDashboard stats={job.result.stats || ({} as typeof job.result.stats)} />
            <ResultsTable rows={job.result.rows} jobId={job.job_id} onDownload={(f) => downloadCsv(job.job_id, f)} onDownloadXlsx={(f) => downloadXlsx(job.job_id, f)} />
          </div>
        )}
      </main>
    </div>
    </div>
  );
}