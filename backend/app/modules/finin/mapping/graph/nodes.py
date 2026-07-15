"""LangGraph nodes for the mapping pipeline."""

import time

import pandas as pd
from langchain_core.messages import SystemMessage, HumanMessage

from app.modules.finin.core.config import settings
from app.modules.finin.mapping.service import (
    build_template_dataframe,
    load_template_data,
    load_source_data,
    clean,
    compute_unmapped_source_columns,
    normalize_primary_key_flag,
    find_primary_key_column,
)
from app.modules.finin.core.llm import make_llm, parse_json_safe, invoke_with_retry
from app.modules.finin.shared.job_store import set_progress, update_job
from app.modules.finin.shared.utils import safe_float, safe_mean, safe_round
from app.modules.finin.mapping.prompts.align_tables import ALIGN_SYSTEM, ALIGN_USER
from app.modules.finin.mapping.prompts.map_columns import COL_SYSTEM, COL_USER_CONSTRAINED, COL_USER_FALLBACK
from app.modules.finin.mapping.graph.state import MappingState


def node_load_data(state: MappingState) -> dict:
    """Load template and source data from databases."""
    creds = state["creds"]
    job_id = state["job_id"]

    set_progress(job_id, "Loading template data…")
    tdf = build_template_dataframe(creds.template_rows) if creds.template_rows else load_template_data(creds)

    set_progress(job_id, "Loading source data…")
    sdf = load_source_data(creds)

    tdf.columns = [c.strip() for c in tdf.columns]
    sdf.columns = [c.strip() for c in sdf.columns]

    t_tbl, t_col = tdf.columns[0], tdf.columns[1]
    s_tbl, s_col = sdf.columns[0], sdf.columns[1]
    pk_col = find_primary_key_column(tdf.columns)
    s_dtype = sdf.columns[2] if len(sdf.columns) > 2 else None
    extra_cols = [c for c in sdf.columns if c not in (s_tbl, s_col, s_dtype)]

    # Index source by table
    source_by_table: dict[str, list] = {}
    source_records: list = []
    for _, row in sdf.iterrows():
        rec = {
            "table": clean(row[s_tbl]),
            "column": clean(row[s_col]),
            "datatype": clean(row[s_dtype]) if s_dtype else "",
            "extra": {c: row[c] for c in extra_cols},
        }
        source_records.append(rec)
        source_by_table.setdefault(rec["table"], []).append(rec)

    # Group template by table
    template_by_table: dict[str, list] = {}
    template_primary_keys: dict[str, int] = {}
    for _, row in tdf.iterrows():
        tmpl_table = clean(row[t_tbl])
        tmpl_column = clean(row[t_col])
        template_by_table.setdefault(tmpl_table, []).append(tmpl_column)
        if pk_col:
            template_primary_keys[f"{tmpl_table}.{tmpl_column}"] = normalize_primary_key_flag(row[pk_col])

    total = sum(len(v) for v in template_by_table.values())
    update_job(job_id, total=total)
    set_progress(job_id, f"Loaded {total} template columns across {len(template_by_table)} tables.")

    return {
        "template_by_table": template_by_table,
        "template_primary_keys": template_primary_keys,
        "source_by_table": source_by_table,
        "source_records": source_records,
    }


def node_align_tables(state: MappingState) -> dict:
    """Stage 1: Align template tables to source tables via LLM."""
    creds = state["creds"]
    job_id = state["job_id"]

    set_progress(job_id, "Stage 1 — aligning template tables to source tables…")

    llm = make_llm(temperature=creds.temperature)

    user_msg = ALIGN_USER.format(
        tmpl_tables="\n".join(f"- {t}" for t in sorted(state["template_by_table"])),
        src_tables="\n".join(f"- {t}" for t in sorted(state["source_by_table"])),
    )

    response = invoke_with_retry(llm, [
        SystemMessage(content=ALIGN_SYSTEM),
        HumanMessage(content=user_msg),
    ])

    parsed = parse_json_safe(response.content)
    table_map = parsed.get("table_map", {}) if isinstance(parsed, dict) else {}

    print(f"📋 Table alignment:\n{table_map}")
    set_progress(job_id, f"Table alignment done — {len(table_map)} tables mapped.")

    return {"table_map": table_map}


def _map_one_table(
    llm,
    tmpl_table: str,
    tmpl_cols: list[str],
    aligned_src_tbl: str,
    source_by_table: dict,
    source_records: list,
) -> list[dict]:
    """Call LLM for a single template table. Returns list of raw LLM rows."""
    if aligned_src_tbl != "NO_MATCH" and aligned_src_tbl in source_by_table:
        src_cols_text = "\n".join(
            f"- {s['column']}" + (f" ({s['datatype']})" if s.get("datatype") else "")
            for s in source_by_table[aligned_src_tbl]
        )
        user_msg = COL_USER_CONSTRAINED.format(
            tmpl_table=tmpl_table,
            src_table=aligned_src_tbl,
            tmpl_cols="\n".join(f"- {c}" for c in tmpl_cols),
            src_cols=src_cols_text,
        )
    else:
        src_cols_text = "\n".join(
            f"- {s['table']}.{s['column']}" + (f" ({s['datatype']})" if s.get("datatype") else "")
            for s in source_records
        )
        user_msg = COL_USER_FALLBACK.format(
            tmpl_table=tmpl_table,
            tmpl_cols="\n".join(f"- {c}" for c in tmpl_cols),
            src_cols=src_cols_text,
        )

    response = invoke_with_retry(llm, [
        SystemMessage(content=COL_SYSTEM),
        HumanMessage(content=user_msg),
    ])
    parsed = parse_json_safe(response.content)
    if isinstance(parsed, dict):
        return parsed.get("mappings", [])
    return []


def node_map_columns(state: MappingState) -> dict:
    """Stage 2: Map columns for each template table via LLM."""
    creds = state["creds"]
    job_id = state["job_id"]
    table_map = state["table_map"]
    template_by_table = state["template_by_table"]
    template_primary_keys = state.get("template_primary_keys", {})
    source_by_table = state["source_by_table"]
    source_records = state["source_records"]
    min_conf = creds.min_confidence

    llm = make_llm(temperature=creds.temperature)
    all_rows = []
    processed = 0

    table_items = list(template_by_table.items())
    for idx, (tmpl_table, tmpl_cols) in enumerate(table_items):
        aligned = table_map.get(tmpl_table, "NO_MATCH")
        set_progress(
            job_id,
            f"Stage 2 — mapping '{tmpl_table}' → '{aligned}' ({processed}/{state.get('total', 0)})",
            processed,
        )

        # Throttle: pause between successive LLM calls so a large template
        # (e.g. 50 tables) doesn't fire dozens of requests back-to-back and
        # trip Azure OpenAI's TPM/RPM rate limit. invoke_with_retry() below
        # additionally backs off and retries if a 429 slips through anyway.
        if idx > 0 and settings.LLM_CALL_DELAY_SECONDS > 0:
            time.sleep(settings.LLM_CALL_DELAY_SECONDS)

        try:
            llm_rows = _map_one_table(
                llm, tmpl_table, tmpl_cols, aligned, source_by_table, source_records
            )
        except Exception as e:
            print(f"⚠️ Column mapping failed for '{tmpl_table}': {e}")
            llm_rows = []

        llm_lookup = {r.get("template_column", ""): r for r in llm_rows}

        for col in tmpl_cols:
            hit = llm_lookup.get(col, {})
            m_tbl = hit.get("mapped_source_table", "NO_MATCH")
            m_col = hit.get("mapped_source_column", "NO_MATCH")
            conf = safe_float(hit.get("confidence", 0))
            reason = hit.get("reason", "")

            # Enforce table constraint from stage 1
            if aligned != "NO_MATCH" and m_tbl not in ("NO_MATCH", aligned):
                m_tbl = aligned
                conf = min(conf, 0.70)
                reason = f"[table enforced] {reason}"

            # Resolve to actual source record
            best_src = None
            if m_tbl != "NO_MATCH" and m_col != "NO_MATCH":
                for s in source_by_table.get(m_tbl, []):
                    if s["column"] == m_col:
                        best_src = s
                        break

            accepted = best_src is not None and conf >= min_conf

            row = {
                "template_table": tmpl_table,
                "template_column": col,
                "is_primary_key": normalize_primary_key_flag(template_primary_keys.get(f"{tmpl_table}.{col}", 0)),
                "mapped_source_table": best_src["table"] if accepted else "NO_MATCH",
                "mapped_source_column": best_src["column"] if accepted else "NO_MATCH",
                "mapped_source_datatype": best_src["datatype"] if accepted else "",
                "mapping_score": safe_round(conf, 3),
                "name_similarity": safe_round(conf, 3),
                "context_similarity": safe_round(conf, 3),
                "gap": 0.0,
                "status": "matched" if accepted else "unmatched",
                "reason": reason or f"confidence={safe_round(conf, 3)}",
            }
            if accepted and best_src:
                for k, v in best_src["extra"].items():
                    row[f"source_{k}"] = v

            all_rows.append(row)
            processed += 1
            update_job(job_id, progress=processed)

    return {"mapped_rows": all_rows}


def node_aggregate(state: MappingState) -> dict:
    """Compute final stats and write to job store."""
    job_id = state["job_id"]
    creds = state["creds"]
    rows = state["mapped_rows"]
    source_by_table = state["source_by_table"]

    df = pd.DataFrame(rows)
    matched = df[df["status"] == "matched"]
    unmatched = df[df["status"] == "unmatched"]
    total = len(rows)

    source_columns_by_table = {}
    source_column_datatypes: dict[str, dict] = {}
    for table_name, records in source_by_table.items():
        columns = sorted({str(rec["column"]).strip() for rec in records if rec.get("column")})
        if columns:
            source_columns_by_table[table_name] = columns
        source_column_datatypes[table_name] = {
            str(rec.get("column", "")).strip(): rec.get("datatype", "")
            for rec in records
            if str(rec.get("column", "")).strip()
        }

    # Reverse of table_map: which template table (if any) a given source
    # table was aligned to in Stage 1.
    table_map = state["table_map"]

    unmapped_source_columns = compute_unmapped_source_columns(rows, source_column_datatypes, table_map)

    result = {
        "stats": {
            "total_templates": total,
            "matched": len(matched),
            "unmatched": len(unmatched),
            "match_rate": round(len(matched) / total * 100, 1) if total else 0,
            "avg_score": safe_round(safe_mean(matched["mapping_score"]), 3),
            "template_tables": df["template_table"].nunique(),
            "score_distribution": {
                "high": int((matched["mapping_score"] >= 0.85).sum()),
                "medium": int(((matched["mapping_score"] >= 0.72) & (matched["mapping_score"] < 0.85)).sum()),
            },
            "model_used": settings.AZURE_OPENAI_DEPLOYMENT,
            "table_alignment": table_map,
            "template_lakehouse": creds.template_lakehouse,
            "template_db": creds.template_db,
            "source_lakehouse": creds.source_lakehouse,
            "source_db": creds.source_db,
        },
        "rows": rows,
        "source_columns_by_table": source_columns_by_table,
        "source_column_datatypes": source_column_datatypes,
        "unmapped_source_columns": unmapped_source_columns,
    }

    update_job(job_id, status="done", message="Mapping complete.", result=result)
    set_progress(job_id, "Done.", total)

    return {"final_result": result}