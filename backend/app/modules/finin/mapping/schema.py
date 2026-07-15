"""Pydantic request/response models for the mapping module."""

from pydantic import BaseModel


class DBCredentials(BaseModel):
    server: str
    client_id: str
    client_secret: str
    tenant_id: str
    template_lakehouse: str = "Template_lakehouse"
    template_db: str = "Template_lakehouse"
    source_lakehouse: str = "Source_Lakehouse"
    source_db: str = "Source_Lakehouse"
    template_table: str = "dbo.polltemplate"
    source_table: str = "dbo.source_position"
    min_confidence: float = 0.72
    batch_size: int = 10
    temperature: float = 0.1
    # Legacy: only used if template_rows is empty (manual/no-project mode).
    # If the Template item lives in a different Fabric workspace than `server`
    # points at, set this to its SQL endpoint. Empty = same server as source.
    template_server: str = ""
    # Template schema read from app.db (see mapping/repository.py). When set,
    # this is used instead of a live ODBC call to Template_lakehouse — avoids
    # cross-workspace auth failures since the Template item can live anywhere.
    template_rows: list[dict] = []


class ProjectMappingRequest(BaseModel):
    """Same as DBCredentials but without server/client_id/client_secret/tenant_id —
    those are resolved server-side from the logged-in user's Fabric project so the
    service-principal secret never has to touch the browser.

    source_db/source_table are also no longer something the user has to know or
    type: pass connection_name and Finin reads the source column list straight out
    of that connection's already-populated [Config_<name>].[SourceInformationSchema]
    metadata table instead of connecting to the live source system. Only pass
    source_db/source_table explicitly if you want to override that."""
    project_id: str
    connection_name: str | None = None
    template_lakehouse: str = "Template_lakehouse"
    template_db: str = "Template_lakehouse"
    source_lakehouse: str = "Source_Lakehouse"
    source_db: str | None = None
    template_table: str = "dbo.polltemplate"
    source_table: str | None = None
    min_confidence: float = 0.72
    batch_size: int = 10
    temperature: float = 0.1