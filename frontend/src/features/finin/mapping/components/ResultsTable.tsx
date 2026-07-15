import { useEffect, useMemo, useState } from "react";
import type { MappingRow } from "../../shared/types";


interface Props {
  rows: MappingRow[];
  jobId: string;
  onDownload: (filter: "all" | "matched" | "unmatched") => void;
  onDownloadXlsx?: (filter: "all" | "matched" | "unmatched") => void;
} 


const PAGE_SIZE = 20;

type Overrides = Record<string, { source_table: string; source_column: string }>;

const overrideKey = (row: MappingRow) => `${row.template_table}.${row.template_column}`;


export function ResultsTable({ rows, onDownload, onDownloadXlsx }: Props) {
  const [filter, setFilter] = useState<"all" | "matched" | "unmatched">("all");
  const [search, setSearch] = useState("");
  const [tableFilter, setTableFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<keyof MappingRow>("mapping_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Local manual overrides (applied immediately)
  const [overrides, setOverrides] = useState<Overrides>({});

  // Derive available source tables + columns from current result rows
  const sourceOptions = useMemo(() => {
    const tableMap: Record<string, Set<string>> = {};
    for (const row of rows) {
      const t = row.mapped_source_table;
      const c = row.mapped_source_column;
      if (
        t && t !== "NO_MATCH" &&
        c && c !== "NO_MATCH"
      ) {
        if (!tableMap[t]) tableMap[t] = new Set();
        tableMap[t].add(c);
      }
    }
    return tableMap;
  }, [rows]);

  const sourceTables = useMemo(() => Object.keys(sourceOptions).sort(), [sourceOptions]);

  // When new results come in, reset overrides
  useEffect(() => {
    setOverrides({});
  }, [rows]);

  const getOverride = (row: MappingRow) => overrides[overrideKey(row)];

  const getSelectedSourceTable = (row: MappingRow) => {
    const ov = getOverride(row);
    if (ov?.source_table) return ov.source_table;
    if (row.mapped_source_table && row.mapped_source_table !== "NO_MATCH") return row.mapped_source_table;
    return "";
  };

  const getSelectedSourceColumn = (row: MappingRow) => {
    const ov = getOverride(row);
    if (ov?.source_column) return ov.source_column;
    if (row.mapped_source_column && row.mapped_source_column !== "NO_MATCH") return row.mapped_source_column;
    return "";
  };

  const setRowOverride = (row: MappingRow, patch: Partial<{ source_table: string; source_column: string }>) => {
    const k = overrideKey(row);
    setOverrides((prev) => {
      const current = prev[k] ?? { source_table: "", source_column: "" };
      const next = { ...current, ...patch };
      return {
        ...prev,
        [k]: next,
      };
    });
  };

  const getColumnOptionsForTable = (t: string) => Array.from(sourceOptions[t] ?? new Set<string>()).sort();

  const applyManualOverridesImmediately = () => {

    // Build nextRows by applying all local overrides to the incoming `rows` prop.
    const nextRows = rows.map((r) => {
      const k = overrideKey(r);
      const ov = overrides[k];
      if (!ov) return r;

      const mapped_source_table = ov.source_table;
      const mapped_source_column = ov.source_column;

      const isValid =
        mapped_source_table &&
        mapped_source_column &&
        mapped_source_column !== "NO_MATCH";

      return {
        ...r,
        mapped_source_table,
        mapped_source_column,
        status: isValid ? "matched" : "unmatched",
        reason: isValid ? "manual override" : r.reason,
      };
    });

    const matched = nextRows.filter((x) => x.status === "matched").length;
    const unmatched = nextRows.length - matched;
    const match_rate = nextRows.length ? matched / nextRows.length : 0;
    const template_tables = new Set(nextRows.map((x) => x.template_table)).size;
    const score_distribution = {
      high: nextRows.filter((x) => x.status === "matched" && x.mapping_score >= 0.85).length,
      medium: nextRows.filter(
        (x) => x.status === "matched" && x.mapping_score >= 0.72 && x.mapping_score < 0.85
      ).length,
    };

    window.dispatchEvent(
      new CustomEvent("manual-overrides-applied", {
        detail: {
          rows: nextRows,
          stats: {
            matched,
            unmatched,
            match_rate,
            total_templates: nextRows.length,
            template_tables,
            score_distribution,
          },
        },
      })
    );
  };



  const tables = useMemo(() => {

    const set = new Set(rows.map((r) => r.template_table));
    return ["all", ...Array.from(set).sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    let r = rows;
    if (filter !== "all") r = r.filter((x) => x.status === filter);
    if (tableFilter !== "all") r = r.filter((x) => x.template_table === tableFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(
        (x) =>
          x.template_column.toLowerCase().includes(q) ||
          x.mapped_source_column.toLowerCase().includes(q) ||
          x.template_table.toLowerCase().includes(q) ||
          x.mapped_source_table.toLowerCase().includes(q)
      );
    }
    return [...r].sort((a, b) => {
      const av = a[sortKey] as string | number;
      const bv = b[sortKey] as string | number;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, filter, tableFilter, search, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const sort = (k: keyof MappingRow) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
    setPage(1);
  };

  const arrow = (k: keyof MappingRow) =>
    sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="results-section">
      <div className="results-toolbar">
        <div className="filter-tabs">
          {(["all", "matched", "unmatched"] as const).map((f) => (
            <button
              key={f}
              className={`tab ${filter === f ? "active" : ""}`}
              onClick={() => { setFilter(f); setPage(1); }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div className="toolbar-right">
          <select value={tableFilter} onChange={(e) => { setTableFilter(e.target.value); setPage(1); }}>
            {tables.map((t) => (
              <option key={t} value={t}>{t === "all" ? "All template tables" : t}</option>
            ))}
          </select>
          <input
            className="search-input"
            placeholder="Search columns…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <div className="download-group">
            <button className="btn-download" onClick={() => onDownload("matched")}>↓ Matched CSV</button>
            <button className="btn-download" onClick={() => onDownload("unmatched")}>↓ Unmatched CSV</button>
            <button className="btn-download primary" onClick={() => onDownload("all")}>↓ All CSV</button>

            <div className="download-divider" />

            <button
              className="btn-download"
              onClick={() => onDownloadXlsx?.("matched")}
              disabled={!onDownloadXlsx}
            >
              ↓ Matched Excel
            </button>
            <button
              className="btn-download"
              onClick={() => onDownloadXlsx?.("unmatched")}
              disabled={!onDownloadXlsx}
            >
              ↓ Unmatched Excel
            </button>
            <button
              className="btn-download primary"
              onClick={() => onDownloadXlsx?.("all")}
              disabled={!onDownloadXlsx}
            >
              ↓ All Excel
            </button>
          </div>

        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th onClick={() => sort("status")}>Status{arrow("status")}</th>
              <th onClick={() => sort("template_table")}>Template Table{arrow("template_table")}</th>
              <th onClick={() => sort("template_column")}>Template Column{arrow("template_column")}</th>
              <th onClick={() => sort("mapped_source_table")}>Source Table{arrow("mapped_source_table")}</th>
              <th onClick={() => sort("mapped_source_column")}>Source Column{arrow("mapped_source_column")}</th>
              <th onClick={() => sort("mapped_source_datatype")}>Source Type{arrow("mapped_source_datatype")}</th>
              <th onClick={() => sort("mapping_score")}>Score{arrow("mapping_score")}</th>
              <th onClick={() => sort("gap")}>Gap{arrow("gap")}</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={i} className={row.status}>
                <td>
                  <span className={`status-pill ${row.status}`}>
                    {row.status === "matched" ? "✓ Matched" : "✗ No Match"}
                  </span>
                </td>
                <td className="mono dim">{row.template_table}</td>
                <td className="mono">{row.template_column}</td>
                <td className="mono dim">
                  {
                    row.status !== "unmatched" ? (
                      <select
                        className="mm-select"
                        value={getSelectedSourceTable(row)}
                        onChange={(e) => {
                          const t = e.target.value;
                          // When changing table, reset column
                          setRowOverride(row, { source_table: t, source_column: "" });
                        }}
                        onBlur={() => applyManualOverridesImmediately()}
                      >
                        <option value="">—</option>
                        {sourceTables.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        className="mm-select"
                        value={getSelectedSourceTable(row)}
                        onChange={(e) => {
                          const t = e.target.value;
                          setRowOverride(row, { source_table: t, source_column: "" });
                        }}
                        onBlur={() => applyManualOverridesImmediately()}
                      >
                        <option value="">—</option>
                        {sourceTables.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    )
                  }

                </td>
                <td className="mono">
                  {
                    row.status !== "unmatched" ? (
                      (() => {
                        const selectedTable = getSelectedSourceTable(row);
                        const options = selectedTable ? getColumnOptionsForTable(selectedTable) : [];
                        return (
                          <select
                            className="mm-select"
                            value={getSelectedSourceColumn(row)}
                            onChange={(e) => {
                              const c = e.target.value;
                              setRowOverride(row, { source_column: c });
                            }}
                            onBlur={() => applyManualOverridesImmediately()}
                            disabled={!getSelectedSourceTable(row)}
                          >
                            <option value="">—</option>
                            {options.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        );
                      })()
                    ) : (
                      (() => {
                        const selectedTable = getSelectedSourceTable(row);
                        const options = selectedTable ? getColumnOptionsForTable(selectedTable) : [];
                        return (
                          <select
                            className="mm-select"
                            value={getSelectedSourceColumn(row)}
                            onChange={(e) => {
                              const c = e.target.value;
                              setRowOverride(row, { source_column: c });
                            }}
                            onBlur={() => applyManualOverridesImmediately()}
                            disabled={!getSelectedSourceTable(row)}
                          >
                            <option value="">—</option>
                            {options.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        );
                      })()
                    )
                  }
                </td>


                <td className="mono dim small">{row.mapped_source_datatype || "—"}</td>
                <td>
                  <span
                    className="score-chip"
                    style={{
                      background:
                        row.mapping_score >= 0.85
                          ? "var(--score-high-bg)"
                          : row.mapping_score >= 0.72
                          ? "var(--score-med-bg)"
                          : "var(--score-low-bg)",
                      color:
                        row.mapping_score >= 0.85
                          ? "var(--score-high)"
                          : row.mapping_score >= 0.72
                          ? "var(--score-med)"
                          : "var(--score-low)",
                    }}
                  >
                    {row.mapping_score}
                  </span>
                </td>
                <td className="mono dim small">{row.gap}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <span className="page-info">{filtered.length} rows</span>
        <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
        <span>Page {page} of {totalPages || 1}</span>
        <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
      </div>

    </div>
  );
}

