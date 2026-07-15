"""LangGraph shared state definition."""

from typing import Optional, TypedDict, Annotated
import operator
from app.modules.finin.mapping.schema import DBCredentials


class MappingState(TypedDict):
    # Inputs (set once)
    creds: DBCredentials
    job_id: str

    # Loaded data
    template_by_table: dict              # {tmpl_table -> [col, ...]}
    template_primary_keys: dict          # {"tmpl_table.tmpl_column" -> 0|1}
    source_by_table: dict                # {src_table -> [{column, datatype, extra}]}
    source_records: list                 # flat list of all source records

    # Stage-1 output
    table_map: dict                      # {tmpl_table -> src_table | "NO_MATCH"}

    # Stage-2 output — operator.add merges lists from parallel branches
    mapped_rows: Annotated[list, operator.add]

    # Final
    final_result: Optional[dict]
    error: Optional[str]
