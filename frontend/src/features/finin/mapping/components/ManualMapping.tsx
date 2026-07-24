import { useState, useMemo, useEffect, useCallback } from "react";
import type { MappingRow } from "../../shared/types";

interface Props {
  rows: MappingRow[];
  sourceColumnsByTable?: Record<string, string[]>;
  onSave: (overrides: Record<string, { source_table: string; source_column: string }>) => void;
  onBack: () => void;
  onDownloadXlsx?: (filter: "all" | "matched" | "unmatched") => void;
  /** True when this is a revisit of an already-saved mapping (reached via
   * Config's "View Mapping" button). Save is disabled so a read-only
   * revisit can't silently overwrite the mapping Bronze/Silver may already
   * be reading from. */
  readOnly?: boolean;
}

export default function ManualMapping({
  rows,
  sourceColumnsByTable,
  onSave,
  onBack,
  onDownloadXlsx,
  readOnly,
}: Props) {
  const [overrides, setOverrides] = useState<
    Record<string, { source_table: string; source_column: string }>
  >({});
  const [tableIndex, setTableIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [savedDone, setSavedDone] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "matched" | "unmatched">("all");

  // DEFENSIVE: Log props on every render
  console.log("[ManualMapping] render — rows.length:", rows?.length, "showManual active");

  // Group rows by template table
  const tableGroups = useMemo(() => {
    console.log("[ManualMapping] rebuilding tableGroups");
    const map = new Map<string, MappingRow[]>();
    if (!Array.isArray(rows)) {
      console.error("[ManualMapping] FATAL: rows is not an array!", rows);
      return [];
    }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || typeof row !== "object") {
        console.error(`[ManualMapping] FATAL: rows[${i}] is invalid:`, row);
        continue;
      }
      const t = row.template_table ?? "unknown";
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(row);
    }
    return Array.from(map.entries());
  }, [rows]);

  const totalTables = tableGroups.length;

  useEffect(() => {
    console.log("[ManualMapping] clamp effect — totalTables:", totalTables);
    if (totalTables === 0) {
      setTableIndex(0);
      return;
    }
    setTableIndex((prev) => Math.min(Math.max(prev, 0), totalTables - 1));
  }, [totalTables]);

  const sourceOptions = useMemo<Record<string, string[]>>(() => {
    console.log("[ManualMapping] rebuilding sourceOptions");
    const map: Record<string, Set<string>> = {};

    if (sourceColumnsByTable && typeof sourceColumnsByTable === "object") {
      for (const [tbl, cols] of Object.entries(sourceColumnsByTable)) {
        if (!Array.isArray(cols)) continue;
        const valid = cols.filter((c) => c && String(c).trim());
        if (valid.length > 0) map[tbl] = new Set(valid);
      }
    }

    for (let i = 0; i < (rows?.length ?? 0); i++) {
      const row = rows[i];
      if (!row) continue;
      const t = row.mapped_source_table;
      const c = row.mapped_source_column;
      if (t && t !== "NO_MATCH" && c && c !== "NO_MATCH") {
        if (!map[t]) map[t] = new Set();
        map[t].add(String(c));
      }
    }

    const result: Record<string, string[]> = {};
    for (const [tbl, set] of Object.entries(map)) {
      result[tbl] = Array.from(set).sort();
    }
    return result;
  }, [rows, sourceColumnsByTable]);

  const sourceTables = useMemo(() => Object.keys(sourceOptions).sort(), [sourceOptions]);
  const overrideCount = Object.keys(overrides).length;

  const goToPage = useCallback((index: number) => {
    console.log("[ManualMapping] goToPage called:", index);
    if (totalTables === 0) return;
    setTableIndex(Math.min(Math.max(index, 0), totalTables - 1));
    setStatusFilter("all");
  }, [totalTables]);

  const rowKey = useCallback((row: MappingRow) => {
    if (!row || typeof row !== "object") {
      console.error("[ManualMapping] rowKey called with invalid row:", row);
      return "invalid.invalid";
    }
    return `${row.template_table ?? "unknown"}.${row.template_column ?? "unknown"}`;
  }, []);

  const getOverride = useCallback((row: MappingRow) => {
    try {
      return overrides[rowKey(row)];
    } catch (e) {
      console.error("[ManualMapping] getOverride crashed:", e);
      return undefined;
    }
  }, [overrides, rowKey]);

  // A manual override always counts as "matched" for filtering purposes,
  // even if the row's original auto-match status was unmatched.
  const isRowMatched = useCallback((row: MappingRow) => {
    if (getOverride(row)) return true;
    return row.status === "matched" && row.mapped_source_column !== "NO_MATCH";
  }, [getOverride]);

  const setTable = useCallback((row: MappingRow, table: string) => {
    console.log("[ManualMapping] setTable called:", table);
    try {
      const k = rowKey(row);
      setOverrides((prev) => ({
        ...prev,
        [k]: { source_table: table, source_column: "" },
      }));
    } catch (e) {
      console.error("[ManualMapping] setTable crashed:", e);
    }
  }, [rowKey]);

  const setColumn = useCallback((row: MappingRow, col: string) => {
    console.log("[ManualMapping] setColumn called:", col);
    try {
      const k = rowKey(row);
      setOverrides((prev) => {
        const existing = prev[k];
        if (!existing) {
          console.warn("[ManualMapping] setColumn: no existing override for", k);
          return prev;
        }
        return { ...prev, [k]: { ...existing, source_column: col } };
      });
    } catch (e) {
      console.error("[ManualMapping] setColumn crashed:", e);
    }
  }, [rowKey]);

  const clearOverride = useCallback((row: MappingRow) => {
    console.log("[ManualMapping] clearOverride called");
    try {
      const k = rowKey(row);
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
    } catch (e) {
      console.error("[ManualMapping] clearOverride crashed:", e);
    }
  }, [rowKey]);

  if (totalTables === 0) {
    return (
      <div className="mm-wrap">
        <div className="mm-empty">
          <p>No mapping data available.</p>
          <button className="btn-ghost" onClick={onBack}>← Back</button>
        </div>
      </div>
    );
  }

  const safeIndex = Math.min(Math.max(tableIndex, 0), totalTables - 1);
  const currentGroup = tableGroups[safeIndex];

  if (!currentGroup) {
    console.error("[ManualMapping] FATAL: currentGroup is undefined at index", safeIndex);
    return (
      <div className="mm-wrap">
        <div className="mm-empty">
          <p>Error: Could not load table data.</p>
          <button className="btn-ghost" onClick={onBack}>← Back</button>
        </div>
      </div>
    );
  }

  const [tableName, tableRows] = currentGroup;

  const matchedCount = tableRows.filter((r) => isRowMatched(r)).length;
  const unmatchedCount = tableRows.length - matchedCount;
  const visibleRows = tableRows.filter((r) => {
    if (statusFilter === "all") return true;
    return statusFilter === "matched" ? isRowMatched(r) : !isRowMatched(r);
  });

  return (
    <div className="mm-wrap">
      <div className="mm-page-header">
        <button className="btn-ghost" onClick={onBack}>← Back to Results</button>
        <div className="mm-page-title">
          <h2>Manual Mapping</h2>
          <span className="mm-page-sub">
            Table {safeIndex + 1} of {totalTables}
            {overrideCount > 0 && (
              <span className="mm-badge">
                {overrideCount} override{overrideCount !== 1 ? "s" : ""}
              </span>
            )}
          </span>
        </div>
      </div>

      {readOnly && (
        <div className="mm-readonly-banner">
          <span className="mm-readonly-dot" />
          Viewing a saved mapping — this connection is already mapped, so Save is disabled here.
        </div>
      )}

      <div className="mm-card">
        <div className="mm-stats-bar" style={{ padding: "12px 24px", borderBottom: "1px solid var(--border)" }} role="group" aria-label="Filter by mapping status">
          <button
            type="button"
            className={`mm-stat-tab ${statusFilter === "all" ? "active" : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            All
            <span className="mm-stat-count">{tableRows.length}</span>
          </button>
          <button
            type="button"
            className={`mm-stat-tab ${statusFilter === "matched" ? "active" : ""}`}
            onClick={() => setStatusFilter("matched")}
          >
            Matched
            <span className="mm-stat-count">{matchedCount}</span>
          </button>
          <button
            type="button"
            className={`mm-stat-tab ${statusFilter === "unmatched" ? "active" : ""}`}
            onClick={() => setStatusFilter("unmatched")}
          >
            Unmatched
            <span className="mm-stat-count">{unmatchedCount}</span>
          </button>
        </div>

        {visibleRows.length === 0 ? (
          <div className="mm-empty-filter">
            No {statusFilter} columns in <strong>{tableName}</strong>.{" "}
            <button className="mm-empty-filter-reset" onClick={() => setStatusFilter("all")}>
              Show all
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Template Table</th>
                  <th>Template Column</th>
                  <th>Source Table</th>
                  <th>Source Column</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, idx) => {
                  if (!row || typeof row !== "object") {
                    console.error(`[ManualMapping] Invalid row at index ${idx}:`, row);
                    return null;
                  }

                  let ov;
                  try {
                    ov = getOverride(row);
                  } catch (e) {
                    console.error("[ManualMapping] getOverride failed in render:", e);
                    ov = undefined;
                  }

                  // Auto-matched rows start the dropdowns pre-filled with
                  // their current match (instead of a blank "Select…"), so
                  // the table always shows what's actually mapped right now
                  // — an override only replaces that starting point.
                  const autoTable =
                    row.status === "matched" && row.mapped_source_table !== "NO_MATCH"
                      ? row.mapped_source_table
                      : "";
                  const autoCol =
                    row.status === "matched" && row.mapped_source_column !== "NO_MATCH"
                      ? row.mapped_source_column
                      : "";

                  const selectedTable = ov?.source_table ?? autoTable;
                  const selectedCol = ov?.source_column ?? autoCol;
                  const colOptions = selectedTable ? (sourceOptions[selectedTable] ?? []) : [];
                  const safeCol = selectedCol && colOptions.includes(selectedCol) ? selectedCol : "";

                  const isOverridden = !!ov;
                  const matched = isRowMatched(row);

                  return (
                    <tr
                      key={`${row.template_table ?? "t"}-${row.template_column ?? "c"}-${idx}`}
                      className={isOverridden ? "mm-row--overridden" : matched ? "" : "mm-row--unmatched"}
                    >
                      <td>
                        <span className={`status-pill ${matched ? "matched" : "unmatched"}`}>
                          {matched ? "✓ Matched" : "✗ No Match"}
                        </span>
                        {isOverridden && (
                          <span className="mm-score-chip mm-score-chip--manual" style={{ marginLeft: 6 }}>
                            manual
                          </span>
                        )}
                      </td>
                      <td className="mono dim">{row.template_table ?? "—"}</td>
                      <td className="mono">{row.template_column ?? "—"}</td>
                      <td className="mm-td-select">
                        <select
                          className="mm-select"
                          value={selectedTable}
                          onChange={(e) => {
                            console.log("[ManualMapping] table select onChange:", e.target.value);
                            setTable(row, e.target.value);
                          }}
                        >
                          <option value="">Select source table…</option>
                          {sourceTables.map((table) => (
                            <option key={`tbl-${table}`} value={table}>
                              {table}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="mm-td-select">
                        <div className="mm-td-select-row">
                          <select
                            key={`col-${selectedTable}-${rowKey(row)}`}
                            className="mm-select"
                            value={safeCol}
                            disabled={!selectedTable}
                            onChange={(e) => {
                              console.log("[ManualMapping] column select onChange:", e.target.value);
                              setColumn(row, e.target.value);
                            }}
                          >
                            <option value="">
                              {selectedTable ? "Select source column…" : "Select table first…"}
                            </option>
                            {colOptions.map((column) => (
                              <option key={`opt-${column}`} value={column}>
                                {column}
                              </option>
                            ))}
                          </select>
                          {isOverridden && (
                            <button
                              className="mm-clear-btn mm-clear-btn--inline"
                              onClick={() => clearOverride(row)}
                              title="Clear override"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mm-nav">
        <button
          className="btn-secondary mm-nav-btn"
          disabled={safeIndex === 0}
          onClick={() => {
            console.log("[ManualMapping] Prev clicked");
            goToPage(safeIndex - 1);
          }}
        >
          ← Prev
        </button>

        <div className="mm-nav-pages">
          {tableGroups.map(([name], idx) => (
            <button
              key={`dot-${idx}`}
              className={`mm-page-dot ${idx === safeIndex ? "active" : ""}`}
              onClick={() => {
                console.log("[ManualMapping] page dot clicked:", idx);
                goToPage(idx);
              }}
              title={name}
            />
          ))}
        </div>

        {safeIndex < totalTables - 1 ? (
          // Not last page — show plain Save + Next
          <>
            <button
              className="btn-secondary mm-nav-btn"
              disabled={overrideCount === 0 || readOnly}
              title={readOnly ? "Save is disabled — viewing a saved mapping" : undefined}
              onClick={() => {
                console.log("[ManualMapping] Save clicked");
                onSave(overrides);
              }}
            >
              Save{overrideCount > 0 ? ` (${overrideCount})` : ""}
            </button>

            <button
              className="btn-primary mm-nav-btn"
              onClick={() => {
                console.log("[ManualMapping] Next clicked");
                goToPage(safeIndex + 1);
              }}
            >
              Next →
            </button>
          </>
        ) : (
          // Last page — show Save & Download Excel
          <button
            className={`btn-save-excel mm-nav-btn${isSaving ? " mm-saving" : ""}${savedDone ? " mm-saved" : ""}`}
            disabled={isSaving || readOnly}
            title={readOnly ? "Save is disabled — viewing a saved mapping" : undefined}
            onClick={async () => {
              console.log("[ManualMapping] Save & Download Excel clicked");
              setIsSaving(true);
              setSavedDone(false);
              try {
                await onSave(overrides);
                setSavedDone(true);
                // Small delay so backend has written the file before download
                setTimeout(() => {
                  onDownloadXlsx?.("all");
                  setIsSaving(false);
                }, 600);
              } catch (e) {
                console.error("[ManualMapping] Save failed:", e);
                setIsSaving(false);
              }
            }}
          >
            {isSaving ? (
              <>
                <span className="testing-spinner btn-save-excel-spinner" />
                Saving…
              </>
            ) : savedDone ? (
              "✓ Saved!"
            ) : (
              "💾 Save & Download Excel"
            )}
          </button>
        )}
      </div>
    </div>
  );
}