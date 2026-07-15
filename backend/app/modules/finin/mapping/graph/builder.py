"""Assemble the LangGraph state machine."""

from langgraph.graph import StateGraph, END
from app.modules.finin.mapping.graph.state import MappingState
from app.modules.finin.mapping.graph.nodes import (
    node_load_data,
    node_align_tables,
    node_map_columns,
    node_aggregate,
)


def build_graph() -> StateGraph:
    """Build and compile the mapping pipeline graph."""
    g = StateGraph(MappingState)

    g.add_node("load_data", node_load_data)
    g.add_node("align_tables", node_align_tables)
    g.add_node("map_columns", node_map_columns)
    g.add_node("aggregate", node_aggregate)

    g.set_entry_point("load_data")
    g.add_edge("load_data", "align_tables")
    g.add_edge("align_tables", "map_columns")
    g.add_edge("map_columns", "aggregate")
    g.add_edge("aggregate", END)

    return g.compile()


# Singleton instance
MAPPING_GRAPH = build_graph()
