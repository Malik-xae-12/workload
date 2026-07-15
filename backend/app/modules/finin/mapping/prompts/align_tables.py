"""Stage 1: Table alignment prompts."""

ALIGN_SYSTEM = (
    "You are a financial-data schema alignment expert. "
    "Respond with valid JSON only — no markdown, no explanation. "
    'Return a single object with key "table_map".'
)

ALIGN_USER = """Align each TEMPLATE TABLE to the single best SOURCE TABLE.

TEMPLATE TABLES:
{tmpl_tables}

SOURCE TABLES:
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
