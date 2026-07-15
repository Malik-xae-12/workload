"""Stage 2: Column mapping prompts."""

COL_SYSTEM = (
    "You are a precise financial-data column mapping assistant. "
    "Respond with valid JSON only — no markdown, no explanation. "
    'Return a single object with key "mappings".'
)

COL_USER_CONSTRAINED = """Map each TEMPLATE column to the best column in SOURCE TABLE "{src_table}".

Template table "{tmpl_table}" has been aligned to source table "{src_table}".
You may ONLY pick columns listed under "{src_table}" below.

TEMPLATE COLUMNS:
{tmpl_cols}

SOURCE COLUMNS in "{src_table}":
{src_cols}

Rules:
- One entry per template column — every template column MUST appear in output.
- ONLY use "{src_table}" as mapped_source_table — never another table.
- For shared audit columns (CreatedBy, CreatedDate, ModifiedBy etc.),
  map them to the same-named column in "{src_table}" if it exists.
- Confidence 0.0 and "NO_MATCH" only when genuinely no match exists.

Return JSON:
{{
  "mappings": [
    {{
      "template_table": "{tmpl_table}",
      "template_column": "<col>",
      "mapped_source_table": "{src_table}",
      "mapped_source_column": "<col or NO_MATCH>",
      "confidence": <0.0-1.0>,
      "reason": "<one sentence>"
    }}
  ]
}}"""

COL_USER_FALLBACK = """Map each TEMPLATE column to the best column across ALL source tables.

TEMPLATE TABLE: {tmpl_table}

TEMPLATE COLUMNS:
{tmpl_cols}

ALL SOURCE COLUMNS (table.column):
{src_cols}

Rules:
- One entry per template column — every template column MUST appear in output.
- Prefer columns from the source table whose name best matches "{tmpl_table}".
- For audit columns (CreatedBy, CreatedDate), prefer the table matching "{tmpl_table}".
- Confidence 0.0 and "NO_MATCH" if no reasonable match exists.

Return JSON:
{{
  "mappings": [
    {{
      "template_table": "{tmpl_table}",
      "template_column": "<col>",
      "mapped_source_table": "<table or NO_MATCH>",
      "mapped_source_column": "<col or NO_MATCH>",
      "confidence": <0.0-1.0>,
      "reason": "<one sentence>"
    }}
  ]
}}"""
