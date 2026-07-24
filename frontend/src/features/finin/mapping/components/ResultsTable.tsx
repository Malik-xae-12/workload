import { useMemo, useState } from "react";
import type { MappingRow } from "../../shared/types";


interface Props {
  rows: MappingRow[];
  jobId: string;
  onDownload: (filter: "all" | "matched" | "unmatched") => void;
  onDownloadXlsx?: (filter: "all" | "matched" | "unmatched") => void;
} 


const PAGE_SIZE = 20;


export function ResultsTable({ rows, onDownload, onDownloadXlsx }: Props) {
  const [filter, setFilter] = useState<"all" | "matched" | "unmatched">("all");
  const [search, setSearch] = useState("");
  const [tableFilter, setTableFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<keyof MappingRow>("mapping_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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
              <option key={t} value={t}>{t === "all" ? "All Tables" : t}</option>
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
                <td className="mono dim">{row.mapped_source_table && row.mapped_source_table !== "NO_MATCH" ? row.mapped_source_table : "—"}</td>
                <td className="mono">{row.mapped_source_column && row.mapped_source_column !== "NO_MATCH" ? row.mapped_source_column : "—"}</td>


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