import { useEffect, useState, useRef, useCallback } from "react";
import { env } from "../../../../config/env";
import { isTokenExpired, refreshAccessToken, redirectToLogin } from "../../../../shared/utils/tokenManager";

const API = `${env.apiUrl.replace(/\/+$/, "")}/finin`;

/** Ensure a non-expired access token before an authenticated call, refreshing if needed. */
const authHeaders = async (): Promise<Record<string, string>> => {
  let token = localStorage.getItem("access_token");
  if (!token || isTokenExpired(token)) {
    token = await refreshAccessToken();
    if (!token) {
      redirectToLogin();
      throw new Error("Session expired. Please log in again.");
    }
  }
  return { Authorization: `Bearer ${token}` };
};

/** AI Mapping runs as a backend job the browser polls — the job itself
 * already survives backend restarts (see shared/job_store.py), but the
 * frontend only ever kept the job_id in React state. A page reload lost
 * track of it entirely, making an in-progress (or just-finished) mapping
 * look like it needs to start over. Persisting the job_id here, keyed per
 * project+connection, lets the hook reattach to it on mount. */
const jobStorageKey = (projectId?: string | null, connectionName?: string | null) =>
  projectId && connectionName ? `finin_mapping_job:${projectId}:${connectionName}` : null;

interface Override {
  source_table: string;
  source_column: string;
}

import type { Stats } from "../../shared/types";

interface JobResult {
  rows: any[];
  stats: Stats;
  source_columns_by_table?: Record<string, string[]>;
  unmapped_source_columns?: Record<string, any>;
  total_templates?: number;
  template_tables?: number;
}

interface Job {
  job_id: string;
  status: "queued" | "running" | "done" | "error";
  progress: number;
  total: number;
  message: string;
  result: JobResult | null;
}

export function useMapping(projectId?: string | null, connectionName?: string | null) {
  const [job, setJob] = useState<Job | null>(null);
  const [testing, setTesting] = useState(false);
  const [connectionOk, setConnectionOk] = useState<boolean | null>(null);
  const [connectionMsg, setConnectionMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollJob = useCallback(
    (jobId: string) => {
      stopPolling();
      const key = jobStorageKey(projectId, connectionName);
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${API}/api/job/${jobId}`);
          const data = await res.json();
          setJob(data);
          if (key) localStorage.setItem(key, jobId);
          if (data.status === "done" || data.status === "error") {
            stopPolling();
          }
        } catch {
          stopPolling();
        }
      }, 1200);
    },
    [stopPolling, projectId, connectionName]
  );

  const testConnection = async (creds: Record<string, any>) => {
    setTesting(true);
    setConnectionOk(null);
    setConnectionMsg("");
    try {
      const res = await fetch(`${API}/api/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });
      const data = await res.json();
      if (res.ok) {
        setConnectionOk(true);
        setConnectionMsg(data.message);
      } else {
        setConnectionOk(false);
        setConnectionMsg(data.detail || "Connection failed.");
      }
    } catch {
      setConnectionOk(false);
      setConnectionMsg("Could not reach the Finin backend.");
    } finally {
      setTesting(false);
    }
  };

  /** Same as testConnection, but resolves credentials from the logged-in
   * user's Fabric project server-side — no secret ever reaches the browser. */
  const testConnectionForProject = async (body: Record<string, any>) => {
    setTesting(true);
    setConnectionOk(null);
    setConnectionMsg("");
    try {
      const res = await fetch(`${API}/api/test-connection-for-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setConnectionOk(true);
        setConnectionMsg(data.message);
      } else {
        setConnectionOk(false);
        setConnectionMsg(data.detail || "Connection failed.");
      }
    } catch {
      setConnectionOk(false);
      setConnectionMsg("Could not reach the Finin backend.");
    } finally {
      setTesting(false);
    }
  };

  const runMapping = async (creds: Record<string, any>) => {
    setJob({ job_id: "", status: "queued", progress: 0, total: 0, message: "Starting...", result: null });
    const res = await fetch(`${API}/api/run-mapping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creds),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail);
    const key = jobStorageKey(projectId, connectionName);
    if (key) localStorage.setItem(key, data.job_id);
    pollJob(data.job_id);
  };

  /** Same as runMapping, using the logged-in user's Fabric project credentials. */
  const runMappingForProject = async (body: Record<string, any>) => {
    setJob({ job_id: "", status: "queued", progress: 0, total: 0, message: "Starting...", result: null });
    const res = await fetch(`${API}/api/run-mapping-for-project`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail);
    const key = jobStorageKey(projectId, connectionName);
    if (key) localStorage.setItem(key, data.job_id);
    pollJob(data.job_id);
  };

  /** Non-secret info (which client_id will be used) for a given Fabric project. */
  const getProjectConnectionInfo = async (projectId: string) => {
    const res = await fetch(`${API}/api/project-connection-info/${projectId}`, {
      headers: await authHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as { client_id: string; tenant_id: string; has_credentials: boolean };
  };

  const downloadCsv = (jobId: string, filter: string) => {
    window.open(`${API}/api/download/${jobId}?filter=${filter}`, "_blank");
  };

  const downloadXlsx = (jobId: string, filter: string) => {
    window.open(`${API}/api/download-xlsx/${jobId}?filter=${filter}`, "_blank");
  };

  const downloadColumnConfig = (jobId: string) => {
    window.open(`${API}/api/download-column-config/${jobId}`, "_blank");
  };

  const applyOverrides = async (jobId: string, overrides: Record<string, Override>) => {
    const res = await fetch(`${API}/api/apply-overrides/${jobId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overrides }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.detail || "Failed to apply overrides");
    }
  };

  /** Persist the current job's mapping into SourceInformationSchemaMapped. */
  const saveToMetadata = async (jobId: string, projectId: string, connectionName: string) => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/save-to-metadata/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ project_id: projectId, connection_name: connectionName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || "Failed to save mapping to metadata");
      const key = jobStorageKey(projectId, connectionName);
      if (key) localStorage.removeItem(key);
      return data as { status: string; inserted: number; table: string };
    } finally {
      setSaving(false);
    }
  };

  const jobRef = useRef(job);
  jobRef.current = job;

  // Reattach to whatever job was in flight (or just finished) for this
  // project+connection when the hook mounts — including after a page
  // reload, which previously lost track of job_id entirely and made an
  // in-progress mapping look like it needed to start over.
  useEffect(() => {
    const key = jobStorageKey(projectId, connectionName);
    if (!key) return;
    const savedJobId = localStorage.getItem(key);
    if (!savedJobId) return;
    (async () => {
      try {
        const res = await fetch(`${API}/api/job/${savedJobId}`);
        if (!res.ok) {
          // Job no longer exists server-side (pruned, or a different backend
          // instance) — nothing to resume, drop the stale reference.
          localStorage.removeItem(key);
          return;
        }
        const data = await res.json();
        setJob(data);
        if (data.status === "queued" || data.status === "running") {
          pollJob(savedJobId);
        }
      } catch {
        /* backend unreachable right now — leave the key in place, try again next mount */
      }
    })();
    // Only re-run when we're pointed at a different project/connection —
    // pollJob/stopPolling are stable via useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, connectionName]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent;
      const detail = ce.detail;
      if (!detail) return;

      const currentJob = jobRef.current;
      if (!currentJob?.result) return;

      setJob((prev) => {
        if (!prev?.result) return prev;
        return {
          ...prev,
          result: { ...prev.result, rows: detail.rows ?? prev.result.rows, stats: detail.stats ?? prev.result.stats },
        };
      });
    };

    window.addEventListener("manual-overrides-applied", handler);
    return () => window.removeEventListener("manual-overrides-applied", handler);
  }, []);

  const reset = () => {
    stopPolling();
    setJob(null);
    setConnectionOk(null);
    setConnectionMsg("");
    const key = jobStorageKey(projectId, connectionName);
    if (key) localStorage.removeItem(key);
  };

  return {
    job,
    testing,
    saving,
    connectionOk,
    connectionMsg,
    testConnection,
    testConnectionForProject,
    runMapping,
    runMappingForProject,
    getProjectConnectionInfo,
    downloadCsv,
    downloadXlsx,
    downloadColumnConfig,
    applyOverrides,
    saveToMetadata,
    reset,
    apiBase: API,
  };
}