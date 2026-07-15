import { useEffect, useState } from "react";
import type { DBCredentials, ProjectMappingParams } from "../../shared/types";
import type { SourceConnection } from "../../../setup/types";

const DEFAULT: DBCredentials = {
  server: "",
  client_id: "",
  client_secret: "",
  tenant_id: "",
  template_db: "Template_lakehouse",
  source_db: "Source_Lakehouse",
  template_table: "dbo.tempfinal",
  source_table: "dbo.source_position",
  min_confidence: 0.72,
  gap_threshold: 0.06,
  name_weight: 0.7,
  context_weight: 0.3,
};

interface Props {
  onTest: (c: DBCredentials) => void;
  onRun: (c: DBCredentials) => void;
  testing: boolean;
  connectionOk: boolean | null;
  connectionMsg: string;
  /** When set, offers "use my logged-in Fabric project" instead of manual entry. */
  projectId?: string | null;
  /** Non-secret info about which identity will be used (fetched by the parent). */
  projectClientId?: string | null;
  /** Fabric source connections for this project — picking one reads column
   * metadata straight out of that connection's SourceInformationSchema table
   * instead of connecting to the live source system. */
  connections?: SourceConnection[];
  connectionName?: string;
  onConnectionNameChange?: (name: string) => void;
  onTestProject?: (body: ProjectMappingParams) => void;
  onRunProject?: (body: ProjectMappingParams) => void;
}

export function ConnectionForm({
  onTest, onRun, testing, connectionOk, connectionMsg,
  projectId, projectClientId, connections = [], connectionName, onConnectionNameChange,
  onTestProject, onRunProject,
}: Props) {
  const [creds, setCreds] = useState<DBCredentials>(DEFAULT);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  // Default to project credentials whenever we're inside a Fabric project — no
  // point re-typing server/tenant/client id/secret you already logged in with.
  const [useProjectCreds, setUseProjectCreds] = useState(!!projectId);

  useEffect(() => {
    setUseProjectCreds(!!projectId);
  }, [projectId]);

  const set = (k: keyof DBCredentials, v: string | number) =>
    setCreds((p) => ({ ...p, [k]: v }));

  const canRun = connectionOk === true;
  const projectReady = !useProjectCreds || !!connectionName;

  const projectBody = (): ProjectMappingParams => ({
    project_id: projectId as string,
    connection_name: connectionName,
    min_confidence: creds.min_confidence,
    gap_threshold: creds.gap_threshold,
    name_weight: creds.name_weight,
    context_weight: creds.context_weight,
  });

  const handleTest = () => (useProjectCreds && onTestProject ? onTestProject(projectBody()) : onTest(creds));
  const handleRun = () => (useProjectCreds && onRunProject ? onRunProject(projectBody()) : onRun(creds));

  return (
    <div className="form-card">
      {projectId && (
        <div className="form-section">
          <label className="mm-select" style={{ display: "flex", alignItems: "center", gap: 8, width: "fit-content", cursor: "pointer" }}>
            <input type="checkbox" checked={useProjectCreds} onChange={(e) => setUseProjectCreds(e.target.checked)} />
            Use my logged-in Fabric project's credentials
          </label>
          {useProjectCreds && (
            <div className="conn-banner ok" style={{ marginTop: 8 }}>
              <span>✓</span> Connecting as {projectClientId ? <code>{projectClientId}</code> : "your project's service principal"} — no need to re-enter server/tenant/secret.
            </div>
          )}
        </div>
      )}

      {!useProjectCreds && (
        <div className="form-section">
          <h3 className="section-label">Azure SQL Connection</h3>
          <div className="field-grid">
            <div className="field">
              <label>Server</label>
              <input
                placeholder="yourserver.database.windows.net"
                value={creds.server}
                onChange={(e) => set("server", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Tenant ID</label>
              <input
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={creds.tenant_id}
                onChange={(e) => set("tenant_id", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Client ID</label>
              <input
                placeholder="Service principal app ID"
                value={creds.client_id}
                onChange={(e) => set("client_id", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Client Secret</label>
              <div className="input-group">
                <input
                  type={showSecret ? "text" : "password"}
                  placeholder="••••••••••••••••"
                  value={creds.client_secret}
                  onChange={(e) => set("client_secret", e.target.value)}
                />
                <button className="toggle-btn" onClick={() => setShowSecret(!showSecret)}>
                  {showSecret ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="form-section">
        <h3 className="section-label">Tables</h3>
        <div className="conn-banner ok" style={{ marginBottom: 12 }}>
          <span>ℹ</span> Template schema is loaded automatically from Finin's local financial template — no database or table name needed.
        </div>
        <div className="field-grid">
          {useProjectCreds ? (
            <div className="field">
              <label>Source Connection</label>
              <select
                className="mm-select"
                value={connectionName || ""}
                onChange={(e) => onConnectionNameChange?.(e.target.value)}
              >
                <option value="">Select Fabric connection…</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              <span style={{ fontSize: 12, color: "var(--text-muted, #667085)", marginTop: 4, display: "block" }}>
                Reads columns from this connection's SourceInformationSchema — no live source connection needed.
              </span>
            </div>
          ) : (
            <>
              <div className="field">
                <label>Source Database</label>
                <input value={creds.source_db} onChange={(e) => set("source_db", e.target.value)} />
              </div>
              <div className="field">
                <label>Source Table</label>
                <input value={creds.source_table} onChange={(e) => set("source_table", e.target.value)} />
              </div>
            </>
          )}
        </div>
      </div>

      <button className="advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
        {showAdvanced ? "▲" : "▼"} Matching Parameters
      </button>

      {showAdvanced && (
        <div className="form-section advanced">
          <div className="param-grid">
            <div className="param">
              <label>Min Confidence <span className="val">{creds.min_confidence}</span></label>
              <input type="range" min="0.5" max="0.99" step="0.01"
                value={creds.min_confidence}
                onChange={(e) => set("min_confidence", parseFloat(e.target.value))} />
            </div>
            <div className="param">
              <label>Gap Threshold <span className="val">{creds.gap_threshold}</span></label>
              <input type="range" min="0.01" max="0.2" step="0.01"
                value={creds.gap_threshold}
                onChange={(e) => set("gap_threshold", parseFloat(e.target.value))} />
            </div>
            <div className="param">
              <label>Name Weight <span className="val">{creds.name_weight}</span></label>
              <input type="range" min="0.1" max="0.9" step="0.05"
                value={creds.name_weight}
                onChange={(e) => set("name_weight", parseFloat(e.target.value))} />
            </div>
            <div className="param">
              <label>Context Weight <span className="val">{creds.context_weight}</span></label>
              <input type="range" min="0.1" max="0.9" step="0.05"
                value={creds.context_weight}
                onChange={(e) => set("context_weight", parseFloat(e.target.value))} />
            </div>
          </div>
        </div>
      )}

      {connectionMsg && (
        <div className={`conn-banner ${connectionOk ? "ok" : "err"}`}>
          <span>{connectionOk ? "✓" : "✗"}</span> {connectionMsg}
        </div>
      )}

      <div className="form-actions">
        <button className="btn-secondary" onClick={handleTest} disabled={testing || !projectReady}>
          {testing ? "Testing…" : "Test Connection"}
        </button>
        <button className="btn-primary" onClick={handleRun} disabled={!canRun || !projectReady}>
          Run Mapping →
        </button>
      </div>
    </div>
  );
}