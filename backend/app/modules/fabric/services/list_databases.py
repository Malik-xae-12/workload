import re

import pyodbc


class DatabaseAccessRestricted(Exception):
    """Raised when the login connected successfully (credentials are
    correct) but isn't permitted to browse the database list — e.g. a
    scoped/contained Azure SQL login that only has access to its own
    database, not `master`. This is fundamentally different from bad
    credentials and must never be reported as a login failure.
    """


def _resolve_driver() -> str:
    drivers = pyodbc.drivers()
    driver_name = "ODBC Driver 18 for SQL Server"
    if driver_name not in drivers:
        driver_name = "ODBC Driver 17 for SQL Server"
        if driver_name not in drivers:
            raise RuntimeError(
                "No suitable ODBC driver found. Install 'ODBC Driver 17 for SQL Server' or '18'."
            )
    return driver_name


def _escape_odbc_value(value: str) -> str:
    """Safely wrap a connection-string value (e.g. UID/PWD) so characters
    like ';', '{', '}' don't corrupt the connection string.

    Without this, a password such as "P@ss;word" gets silently truncated
    at the ';' — pyodbc then sends a wrong/partial password to the
    server, which looks exactly like an invalid credential ("login
    failed") even though what the person typed is correct. Any value
    containing a special character is wrapped in braces per the ODBC
    driver's own escaping rules, with any literal '}' doubled.
    """
    if any(c in value for c in (";", "{", "}", "=")):
        return "{" + value.replace("}", "}}") + "}"
    return value


def list_sql_server_databases(
    server: str,
    username: str | None,
    password: str | None,
    auth_type: str = "Basic",
    tenant_id: str | None = None,
    client_id: str | None = None,
    client_secret: str | None = None,
) -> tuple[list[str], str | None]:
    """Connect to `master` on the given server and return every user
    database name (system databases excluded), for the Source
    Connections step's "pick a database" dropdown.

    A login that can't open `master` (common for scoped/contained Azure
    SQL logins) can never enumerate other databases via direct SQL —
    that's an Azure SQL platform restriction, not something retrying
    around. In that case DatabaseAccessRestricted is raised so the
    caller can tell the person clearly ("valid login, but it can't
    browse the database list") instead of a misleading "wrong
    credentials" message.
    """
    driver_name = _resolve_driver()

    def _build_conn_str(database: str | None) -> str:
        base = (
            f"DRIVER={{{driver_name}}};"
            f"SERVER={server};"
            + (f"DATABASE={database};" if database else "")
            + "Encrypt=yes;"
            "TrustServerCertificate=no;"
            "Connection Timeout=8;"
        )
        if auth_type == "ServicePrincipal":
            if not (tenant_id and client_id and client_secret):
                raise ValueError("Tenant ID, Client ID, and Client Secret are required for Service Principal auth.")
            uid = f"{tenant_id}::{client_id}"
            return (
                base
                + "Authentication=ActiveDirectoryServicePrincipal;"
                + f"UID={_escape_odbc_value(uid)};"
                + f"PWD={_escape_odbc_value(client_secret)};"
            )
        if not (username and password):
            raise ValueError("Username and password are required.")
        return base + f"UID={_escape_odbc_value(username)};" + f"PWD={_escape_odbc_value(password)};"

    def _connect(database: str | None):
        return pyodbc.connect(_build_conn_str(database), timeout=8)

    try:
        conn = _connect("master")
    except pyodbc.Error as e:
        # Detect this by the driver's own SQLSTATE/native error code
        # (42000 / native code 4060 = "cannot open database ... requested
        # by the login"), not by matching English wording — the message
        # format varies by driver version/locale, but the codes don't.
        #
        # Note: on Azure SQL, omitting DATABASE= from the connection
        # string does NOT fall back to the login's own database — Azure
        # SQL still targets `master`. So a login that can't open master
        # can never enumerate databases via direct SQL, full stop; only
        # a login with access to master (or an admin) can. There is no
        # retry that gets around this — it must be reported honestly.
        sqlstate = e.args[0] if e.args else ""
        msg = str(e)
        is_master_access_denied = sqlstate == "42000" and bool(re.search(r"\b4060\b", msg))
        if is_master_access_denied:
            raise DatabaseAccessRestricted(
                "This login connected successfully, but it doesn't have permission to "
                "browse the list of databases on this server (it's scoped to a single "
                "database). Please enter the database name directly, or use a login "
                "with access to 'master'."
            )
        raise RuntimeError(msg)

    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name FROM sys.databases "
            "WHERE database_id > 4 AND state = 0 "  # exclude system DBs + offline DBs
            "ORDER BY name"
        )
        return [row[0] for row in cursor.fetchall()], None
    finally:
        conn.close()