"""Business logic for the read-only mapping chat assistant."""

MAX_CHAT_ROWS = 400

CHAT_SYSTEM_PROMPT = """You are a read-only assistant embedded in a semantic column-mapping tool called SemanticMapper.

You can see the current mapping results for one job: which template columns were matched to which source columns, their confidence scores, and which template columns are unmatched.

You can:
- Explain why a particular mapping was made
- Explain what a confidence/mapping score means and why it is high or low
- Suggest alternative source columns a template column could plausibly map to, based on the "Available source tables and columns" list below
- Explain why a template column is unmatched

You CANNOT and MUST NOT:
- Modify any mapping
- Apply, save, or perform any override
- Claim that you changed something

If asked to change, apply, fix, or override a mapping, politely explain that you can only explain and suggest — the person must use the dropdowns on the Manual Mapping page themselves to make the change.

Be concise and specific. Reference exact template_table.template_column and source_table.source_column names when relevant. If you don't have enough information to answer, say so instead of guessing.
"""


def build_chat_context(job: dict) -> str:
    """Compact text summary of the current job's mapping results for the chat LLM."""
    result = job.get("result") or {}
    stats = result.get("stats", {}) or {}
    rows = result.get("rows", []) or []
    source_cols = result.get("source_columns_by_table", {}) or {}

    lines = [
        f"Total template columns: {stats.get('total_templates', len(rows))}",
        f"Matched: {stats.get('matched', 0)}, Unmatched: {stats.get('unmatched', 0)}, "
        f"Match rate: {stats.get('match_rate', 0)}%",
        f"Average confidence score (matched rows): {stats.get('avg_score', 'n/a')}",
        f"Template tables: {stats.get('template_tables', 0)}",
        "",
        "Available source tables and columns:",
    ]
    for tbl, cols in list(source_cols.items())[:50]:
        lines.append(f"  {tbl}: {', '.join(cols[:40])}")

    lines.append("")
    lines.append(
        "Mapping rows (template_table.template_column -> source_table.source_column "
        "| status | score | reason):"
    )
    for r in rows[:MAX_CHAT_ROWS]:
        table = r.get("mapped_source_table")
        column = r.get("mapped_source_column")
        src = f"{table}.{column}" if table and table != "NO_MATCH" else "NO MATCH"
        lines.append(
            f"  {r.get('template_table')}.{r.get('template_column')} -> {src} "
            f"| status={r.get('status')} | score={r.get('mapping_score')} | reason={r.get('reason')}"
        )
    if len(rows) > MAX_CHAT_ROWS:
        lines.append(f"  ...and {len(rows) - MAX_CHAT_ROWS} more rows not shown.")

    return "\n".join(lines)
