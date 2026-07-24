"""Stage 1: Table alignment prompts."""

ALIGN_SYSTEM = (
    "You are a financial-data schema alignment expert. "
    "Respond with valid JSON only — no markdown, no explanation. "
    'Return a single object with key "table_map".'
)

ALIGN_USER = """Align each TEMPLATE TABLE to the single best SOURCE TABLE.
Each table below is listed with a few of its column names as context —
use these alongside the table name itself to judge the match, especially
when table names alone are ambiguous.

TEMPLATE TABLES (with sample columns):
{tmpl_tables}

SOURCE TABLES (with sample columns):
{src_tables}

Rules:
- Match based on business entity semantics (e.g. "Broker" → "tbl_Broker").
- A source table may be used by multiple template tables if appropriate.
- Use "NO_MATCH" only when nothing is remotely close.

Return JSON:
{{
  "table_map": {{
    "<TemplateTable>": "<SourceTable or NO_MATCH>"
  }}
}}"""