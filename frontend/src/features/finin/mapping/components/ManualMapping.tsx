import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import type { MappingRow } from "../../shared/types";
import { SelectDropdown } from "../../../../shared/components/selectdropdown";

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
  // null = no filter applied (all tables in sequence). Once the user picks
  // specific tables, only those are shown, in original order, one by one.
  const [selectedTables, setSelectedTables] = useState<Set<string> | null>(null);
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const tablePickerRef = useRef<HTMLDivElement>(null);


  // Group rows by template table
  const tableGroups = useMemo(() => {
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

  const allTableNames = useMemo(() => tableGroups.map(([name]) => name), [tableGroups]);

  // The sequence actually navigated: every table, or just the ones the
  // user picked in the table filter (still walked one by one, in order).
  const filteredTableGroups = useMemo(() => {
    if (!selectedTables || selectedTables.size === 0) return tableGroups;
    return tableGroups.filter(([name]) => selectedTables.has(name));
  }, [tableGroups, selectedTables]);

  const totalTables = filteredTableGroups.length;

  useEffect(() => {
    if (totalTables === 0) {
      setTableIndex(0);
      return;
    }
    setTableIndex((prev) => Math.min(Math.max(prev, 0), totalTables - 1));
  }, [totalTables]);

  // Close the table picker on outside click.
  useEffect(() => {
    if (!tablePickerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (tablePickerRef.current && !tablePickerRef.current.contains(e.target as Node)) {
        setTablePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [tablePickerOpen]);

  const toggleTableSelection = useCallback((name: string) => {
    setSelectedTables((prev) => {
      const base = prev ? new Set(prev) : new Set(allTableNames);
      if (base.has(name)) base.delete(name);
      else base.add(name);
      return base;
    });
    setTableIndex(0);
  }, [allTableNames]);

  const selectAllTables = useCallback(() => {
    setSelectedTables(null);
    setTableIndex(0);
  }, []);

  const isTableSelected = useCallback(
    (name: string) => !selectedTables || selectedTables.has(name),
    [selectedTables]
  );

  const selectedCountLabel =
    !selectedTables || selectedTables.size === allTableNames.length
      ? "All tables"
      : selectedTables.size === 0
      ? "No tables"
      : `${selectedTables.size} of ${allTableNames.length} tables`;

  const sourceOptions = useMemo<Record<string, string[]>>(() => {
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

  // Only overrides with BOTH a source table AND a source column filled in
  // are valid to send to the backend or count as "matched". Selecting only
  // the table (source_column still "") must NOT count — that's the bug:
  // picking just the table was flipping the row to "Matched" and making it
  // vanish from the Unmatched filter before a column could even be chosen,
  // and sending that incomplete override to Save had nothing valid for the
  // backend to persist, so nothing was ever actually saved for that row.
  const completeOverrides = useMemo(() => {
    const out: Record<string, { source_table: string; source_column: string }> = {};
    for (const [k, v] of Object.entries(overrides)) {
      if (v?.source_table && v?.source_column) out[k] = v;
    }
    return out;
  }, [overrides]);
  const incompleteOverrideCount = overrideCount - Object.keys(completeOverrides).length;

  const goToPage = useCallback((index: number) => {
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

  // A manual override only counts as "matched" once BOTH the source table
  // AND source column are set — not the instant *any* override object
  // exists (which setTable() creates right away, with source_column: "",
  // the moment a table is picked, before a column is chosen).
  const isRowMatched = useCallback((row: MappingRow) => {
    const ov = getOverride(row);
    if (ov) return !!ov.source_table && !!ov.source_column;
    return row.status === "matched" && row.mapped_source_column !== "NO_MATCH";
  }, [getOverride]);

  const setTable = useCallback((row: MappingRow, table: string) => {
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

  // Shared by both Save buttons: only ever sends *complete* overrides
  // (both source_table and source_column set). If some overrides are
  // still incomplete, ask before silently dropping them from this save so
  // it's clear why a row didn't end up persisted.
  const confirmAndSave = useCallback(async () => {
    if (incompleteOverrideCount > 0) {
      const completeCount = Object.keys(completeOverrides).length;
      const proceed = window.confirm(
        `${incompleteOverrideCount} override${incompleteOverrideCount === 1 ? "" : "s"} ` +
        `still ${incompleteOverrideCount === 1 ? "is" : "are"} missing a source column and won't be saved. ` +
        `Save the ${completeCount} complete override${completeCount === 1 ? "" : "s"} now?`
      );
      if (!proceed) return false;
    }
    await onSave(completeOverrides);
    return true;
  }, [incompleteOverrideCount, completeOverrides, onSave]);

  if (allTableNames.length === 0) {
    return (
      <div className="mm-wrap">
        <div className="mm-empty">
          <p>No mapping data available.</p>
          <button className="btn-ghost" onClick={onBack}>← Back</button>
        </div>
      </div>
    );
  }

  if (totalTables === 0) {
    return (
      <div className="mm-wrap">
        <div className="mm-empty">
          <p>No tables selected.</p>
          <button className="btn-ghost" onClick={selectAllTables}>Show all tables</button>
        </div>
      </div>
    );
  }

  const safeIndex = Math.min(Math.max(tableIndex, 0), totalTables - 1);
  const currentGroup = filteredTableGroups[safeIndex];

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
        <div className="mm-stats-bar" role="group" aria-label="Filter by mapping status">
          <div className="mm-stats-bar-left">
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

          <div className="mm-table-picker" ref={tablePickerRef}>
            <button
              type="button"
              className={`mm-table-picker-trigger ${tablePickerOpen ? "open" : ""}`}
              onClick={() => setTablePickerOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={tablePickerOpen}
            >
              <span className="mm-table-picker-icon" aria-hidden="true">▤</span>
              <span className="mm-table-picker-label">{selectedCountLabel}</span>
              <span className={`mm-table-picker-chevron ${tablePickerOpen ? "open" : ""}`} aria-hidden="true">
                ▾
              </span>
            </button>

            {tablePickerOpen && (
              <div className="mm-table-picker-menu" role="listbox" aria-multiselectable="true">
                <div className="mm-table-picker-menu-header">
                  <span>Select tables</span>
                  <button
                    type="button"
                    className="mm-table-picker-selectall"
                    onClick={selectAllTables}
                    disabled={!selectedTables}
                  >
                    Select all
                  </button>
                </div>
                <div className="mm-table-picker-list">
                  {tableGroups.map(([name, groupRows]) => {
                    const checked = isTableSelected(name);
                    return (
                      <label
                        key={`pick-${name}`}
                        className={`mm-table-picker-item ${checked ? "checked" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTableSelection(name)}
                        />
                        <span className="mm-table-picker-checkbox" aria-hidden="true" />
                        <span className="mm-table-picker-name">{name}</span>
                        <span className="mm-table-picker-count">{groupRows.length}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
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
                        <SelectDropdown
                          value={selectedTable}
                          options={sourceTables}
                          placeholder="Select source table…"
                          onChange={(val) => {
                            setTable(row, val);
                          }}
                        />
                      </td>
                      <td className="mm-td-select">
                        <div className="mm-td-select-row">
                          <SelectDropdown
                            key={`col-${selectedTable}-${rowKey(row)}`}
                            value={safeCol}
                            options={colOptions}
                            placeholder={selectedTable ? "Select source column…" : "Select table first…"}
                            disabled={!selectedTable}
                            onChange={(val) => {
                              setColumn(row, val);
                            }}
                          />
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
            goToPage(safeIndex - 1);
          }}
        >
          ← Prev
        </button>

        <div className="mm-nav-pages">
          {filteredTableGroups.map(([name], idx) => (
            <button
              key={`dot-${idx}`}
              className={`mm-page-dot ${idx === safeIndex ? "active" : ""}`}
              onClick={() => {
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
                void confirmAndSave();
              }}
            >
              Save{overrideCount > 0 ? ` (${overrideCount})` : ""}
            </button>

            <button
              className="btn-primary mm-nav-btn"
              onClick={() => {
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
              setIsSaving(true);
              setSavedDone(false);
              try {
                const didSave = await confirmAndSave();
                if (!didSave) {
                  setIsSaving(false);
                  return;
                }
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