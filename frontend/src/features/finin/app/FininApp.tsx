import { useEffect, useState } from "react";
import { ConnectionForm } from "../connection/components/ConnectionForm";
import { ProgressPanel } from "../mapping/components/ProgressPanel";
import { StatsDashboard } from "../mapping/components/StatsDashboard";
import { ResultsTable } from "../mapping/components/ResultsTable";
import ManualMapping from "../mapping/components/ManualMapping";
import ChatPanel from "../mapping/components/ChatPanel";
import { UnmappedColumns } from "../mapping/components/UnmappedColumns";
import ErrorBoundary from "../shared/components/ErrorBoundary";
import { useMapping } from "../mapping/hooks/useMapping";
import "../shared/styles/App.css";
import type { SourceConnection } from "../../setup/types";

interface Props {
  connections: SourceConnection[];
  projectId: string | null;
}

export default function FininApp({ connections, projectId }: Props) {
  const {
    job, testing, saving, connectionOk, connectionMsg,
    testConnection, testConnectionForProject, runMapping, runMappingForProject,
    getProjectConnectionInfo, downloadCsv, downloadXlsx, downloadColumnConfig,
    applyOverrides, saveToMetadata, reset, apiBase,
  } = useMapping();

  const [showManual, setShowManual] = useState(false);
  const [connectionName, setConnectionName] = useState(connections[0]?.name || "");
  const [projectClientId, setProjectClientId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) { setProjectClientId(null); return; }
    getProjectConnectionInfo(projectId).then((info) => setProjectClientId(info?.client_id || null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

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

  const handleSaveToMetadata = async () => {
    if (!job?.job_id) return;
    if (!projectId) { alert("Open a Fabric project first (Projects tab) so mappings have a destination."); return; }
    if (!connectionName) { alert("Select a source connection to save into."); return; }
    try {
      const res = await saveToMetadata(job.job_id, projectId, connectionName);
      alert(`Saved ${res.inserted} rows to SourceInformationSchemaMapped (Config_${connectionName}).`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save mapping to metadata.");
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
          </ErrorBoundary>
        )}

        {!showManual && !job && (
          <div className="landing">
            <div className="landing-hero">
              <h1>Map columns with meaning,<br /><em>not just names.</em></h1>
              <p>
                Connect your Azure SQL databases and let semantic embeddings automatically match
                source columns to your financial analytics template — with confidence scores and
                full auditability. Finished mappings save straight into your Fabric Accelerator
                metadata (SourceInformationSchemaMapped).
              </p>
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
                <select value={connectionName} onChange={(e) => setConnectionName(e.target.value)} className="mm-select">
                  <option value="">Select Fabric connection…</option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
                <button className="btn-primary" onClick={handleSaveToMetadata} disabled={saving || !connectionName}>
                  {saving ? "Saving…" : "Save to SourceInformationSchemaMapped"}
                </button>
                <button className="btn-secondary" onClick={() => downloadColumnConfig(job.job_id)}>
                  ↓ Column Config Excel
                </button>
              </div>
            </div>
            <StatsDashboard stats={job.result.stats || ({} as typeof job.result.stats)} />
            <UnmappedColumns data={job.result.unmapped_source_columns || {}} />
            <ResultsTable rows={job.result.rows} jobId={job.job_id} onDownload={(f) => downloadCsv(job.job_id, f)} onDownloadXlsx={(f) => downloadXlsx(job.job_id, f)} />
            <ChatPanel jobId={job.job_id} apiBase={apiBase} />
          </div>
        )}
      </main>
    </div>
    </div>
  );
}