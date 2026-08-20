"""
@license
SPDX-License-Identifier: Apache-2.0

Lists tables directly from a SOURCE connection's own database — used by
the Source step's "Tables to move to Bronze" picker so a person can pick
tables BEFORE the OTL config-creation notebook has ever run for that
connection (that notebook is what creates the
WH_MetaData.Config_<name>.OneTimeConfigETL table the *other* table-
selection endpoints in metadata.py read/write — this module doesn't
touch Fabric or that table at all, it queries the source database's own
system catalogs).

Supported source types: Azure SQL, SQL Server (pyodbc), MySQL (pymysql),
PostgreSQL (psycopg2), Oracle (oracledb). Each connector library is
imported lazily so a missing optional driver only affects that one
db_type, with a clear install hint instead of an ImportError traceback.
"""

from app.modules.fabric.services.list_databases import _resolve_driver, _escape_odbc_value

SQL_SERVER_TYPES = {"Azure SQL", "SQL Server"}
MYSQL_TYPES = {"MySQL"}
POSTGRES_TYPES = {"PostgreSQL", "Postgres"}
ORACLE_TYPES = {"Oracle"}

SUPPORTED_TYPES = SQL_SERVER_TYPES | MYSQL_TYPES | POSTGRES_TYPES | ORACLE_TYPES

_TIMEOUT_SECONDS = 8


def _split_host_port(server: str, default_port: int) -> tuple[str, int]:
    """'host,1433' / 'host:5432' / plain 'host' -> (host, port)."""
    server = (server or "").strip()
    for sep in (",", ":"):
        if sep in server:
            host, _, port_str = server.rpartition(sep)
            try:
                return host.strip(), int(port_str.strip())
            except ValueError:
                break
    return server, default_port


def _list_sqlserver_tables(server, database, username, password) -> list[dict]:
    import pyodbc

    driver_name = _resolve_driver()
    conn_str = (
        f"DRIVER={{{driver_name}}};"
        f"SERVER={server};"
        f"DATABASE={database};"
        "Encrypt=yes;"
        "TrustServerCertificate=no;"
        f"Connection Timeout={_TIMEOUT_SECONDS};"
        f"UID={_escape_odbc_value(username)};"
        f"PWD={_escape_odbc_value(password)};"
    )
    conn = pyodbc.connect(conn_str, timeout=_TIMEOUT_SECONDS)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
            "WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA <> 'sys' "
            "ORDER BY TABLE_SCHEMA, TABLE_NAME"
        )
        return [
            {"schema_name": row.TABLE_SCHEMA, "table_name": row.TABLE_NAME}
            for row in cursor.fetchall()
        ]
    finally:
        conn.close()


def _list_mysql_tables(server, database, username, password) -> list[dict]:
    try:
        import pymysql
    except ImportError:
        raise ValueError(
            "MySQL support isn't installed on the server — add the 'pymysql' "
            "package to the backend (pip install pymysql) and retry."
        )
    host, port = _split_host_port(server, 3306)
    conn = pymysql.connect(
        host=host, port=port, user=username, password=password,
        database=database, connect_timeout=_TIMEOUT_SECONDS,
    )
    try:
        with conn.cursor() as cursor:
            # In MySQL the "schema" IS the database, so use the database
            # name as the schema for consistent "schema.table" keys.
            cursor.execute(
                "SELECT TABLE_SCHEMA, TABLE_NAME FROM information_schema.TABLES "
                "WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = %s "
                "ORDER BY TABLE_NAME",
                (database,),
            )
            return [
                {"schema_name": r[0], "table_name": r[1]} for r in cursor.fetchall()
            ]
    finally:
        conn.close()


def _list_postgres_tables(server, database, username, password) -> list[dict]:
    try:
        import psycopg2
    except ImportError:
        raise ValueError(
            "PostgreSQL support isn't installed on the server — add the "
            "'psycopg2-binary' package to the backend and retry."
        )
    host, port = _split_host_port(server, 5432)
    conn = psycopg2.connect(
        host=host, port=port, dbname=database, user=username,
        password=password, connect_timeout=_TIMEOUT_SECONDS,
    )
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT table_schema, table_name FROM information_schema.tables "
                "WHERE table_type = 'BASE TABLE' "
                "AND table_schema NOT IN ('pg_catalog', 'information_schema', 'sys') "
                "ORDER BY table_schema, table_name"
            )
            return [
                {"schema_name": r[0], "table_name": r[1]} for r in cursor.fetchall()
            ]
    finally:
        conn.close()


def _list_oracle_tables(server, database, username, password) -> list[dict]:
    try:
        import oracledb
    except ImportError:
        raise ValueError(
            "Oracle support isn't installed on the server — add the 'oracledb' "
            "package to the backend (pip install oracledb) and retry."
        )
    host, port = _split_host_port(server, 1521)
    # `database` holds the service name / SID for Oracle connections.
    dsn = oracledb.makedsn(host, port, service_name=database) if database else f"{host}:{port}"
    conn = oracledb.connect(user=username, password=password, dsn=dsn)
    try:
        cursor = conn.cursor()
        # ALL_TABLES scoped to the connecting user's visible schemas, minus
        # Oracle-internal ones.
        cursor.execute(
            "SELECT OWNER, TABLE_NAME FROM ALL_TABLES "
            "WHERE OWNER NOT IN ("
            "'SYS','SYSTEM','OUTLN','XDB','CTXSYS','MDSYS','ORDSYS','DBSNMP',"
            "'APPQOSSYS','WMSYS','GSMADMIN_INTERNAL','OJVMSYS','DVSYS','LBACSYS',"
            "'AUDSYS','OLAPSYS','REMOTE_SCHEDULER_AGENT','DBSFWUSER'"
            ") ORDER BY OWNER, TABLE_NAME"
        )
        return [
            {"schema_name": r[0], "table_name": r[1]} for r in cursor.fetchall()
        ]
    finally:
        conn.close()


def list_tables_for_source_connection(
    db_type: str,
    server: str,
    database: str,
    username: str | None,
    password: str | None,
) -> list[dict]:
    """Return every user table (schema + name) in the source database
    itself, via that connection's own stored Basic-auth credentials.

    Service Principal / OAuth-authenticated source connections aren't
    supported here (those secrets live only in Fabric, not on the local
    SourceConnection row) — Basic-auth covers Azure SQL / SQL Server /
    MySQL / Oracle / PostgreSQL, which are all handled below.
    """
    if db_type not in SUPPORTED_TYPES:
        raise ValueError(
            f"Listing tables directly from the source isn't supported for '{db_type}' "
            "connections yet."
        )
    if not (username and password):
        raise ValueError(
            "This connection doesn't have Basic-auth credentials stored, so its tables "
            "can't be listed directly from the source database."
        )
    if "::" in (username or ""):
        raise ValueError(
            "This connection was created with Service Principal authentication — "
            "listing tables directly from the source requires a username/password "
            "(Basic) connection."
        )

    if db_type in SQL_SERVER_TYPES:
        return _list_sqlserver_tables(server, database, username, password)
    if db_type in MYSQL_TYPES:
        return _list_mysql_tables(server, database, username, password)
    if db_type in POSTGRES_TYPES:
        return _list_postgres_tables(server, database, username, password)
    return _list_oracle_tables(server, database, username, password)


def list_distinct_schemas_for_source_connection(
    db_type: str,
    server: str,
    database: str,
    username: str | None,
    password: str | None,
) -> list[str]:
    """Distinct schema names available on the source ('sys' always
    excluded — see list_tables_for_source_connection, which already
    filters it out at the query level for every db_type)."""
    tables = list_tables_for_source_connection(db_type, server, database, username, password)
    schemas = sorted({t["schema_name"] for t in tables if t["schema_name"] and t["schema_name"].lower() != "sys"})
    return schemas
