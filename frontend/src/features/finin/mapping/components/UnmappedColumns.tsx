import { useState } from "react";

const CHIP_PREVIEW_LIMIT = 12;

interface SourceCol {
  source_table: string;
  source_column: string;
  datatype?: string;
}

function ExtTable({ extName, payload }: { extName: string; payload: { columns: SourceCol[] } }) {
  const [expanded, setExpanded] = useState(false);
  const columns = payload.columns;
  const visible = expanded ? columns : columns.slice(0, CHIP_PREVIEW_LIMIT);
  const hiddenCount = columns.length - visible.length;

  return (
    <div className="ext-table">
      <div className="ext-table-head">
        <span className="ext-table-badge">{extName}</span>
        <span className="ext-table-count">{columns.length} column{columns.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="ext-chip-list">
        {visible.map((col, i) => (
          <span key={`${col.source_table}.${col.source_column}-${i}`} className="ext-chip" title={col.datatype || undefined}>
            <span className="ext-chip-table">{col.source_table}.</span>
            {col.source_column}
          </span>
        ))}
      </div>
      {hiddenCount > 0 && (
        <button className="ext-chip-more" onClick={() => setExpanded(true)}>{`+${hiddenCount} more`}</button>
      )}
      {expanded && columns.length > CHIP_PREVIEW_LIMIT && (
        <button className="ext-chip-more" onClick={() => setExpanded(false)}>Show less</button>
      )}
    </div>
  );
}

// export function UnmappedColumns({ data }: { data: Record<string, { columns: SourceCol[] }> }) {
//   const [collapsed, setCollapsed] = useState(true);
//   const entries = Object.entries(data || {});

//   if (entries.length === 0) return null;

//   const totalColumns = entries.reduce((sum, [, v]) => sum + v.columns.length, 0);

//   return (
//     <div className="ext-section">
//       <button className="ext-header" onClick={() => setCollapsed(!collapsed)}>
//         <div className="ext-header-title">
//           <h3 className="section-label">Unmapped Source Columns</h3>
//           <span className="ext-header-sub">
//             {totalColumns} column{totalColumns !== 1 ? "s" : ""} across {entries.length} extension table{entries.length !== 1 ? "s" : ""} — columns that never matched a template column
//           </span>
//         </div>
//         <span className="ext-toggle">{collapsed ? "▼" : "▲"}</span>
//       </button>
//       {collapsed && (
//         <div className="ext-overview">
//           {entries.map(([extName, payload]) => (
//             <span key={extName} className="ext-overview-chip">
//               {extName}<span className="ext-overview-count">{payload.columns.length}</span>
//             </span>
//           ))}
//         </div>
//       )}
//       {!collapsed && (
//         <div className="ext-body">
//           {entries.map(([extName, payload]) => (
//             <ExtTable key={extName} extName={extName} payload={payload} />
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }
