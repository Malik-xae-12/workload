import httpx
import msal

FABRIC_API_BASE = "https://api.fabric.microsoft.com/v1"
SCOPE = ["https://api.fabric.microsoft.com/.default"]
ONELAKE_SCOPE = ["https://storage.azure.com/.default"]


def get_fabric_token(client_id: str, client_secret: str, tenant_id: str) -> str:
    app = msal.ConfidentialClientApplication(
        client_id=client_id,
        client_credential=client_secret,
        authority=f"https://login.microsoftonline.com/{tenant_id}",
    )
    result = app.acquire_token_for_client(scopes=SCOPE)
    if "access_token" in result:
        return result["access_token"]
    raise RuntimeError(
        f"Failed to acquire Fabric token: {result.get('error_description', result)}"
    )


def get_onelake_token(client_id: str, client_secret: str, tenant_id: str) -> str:
    """Acquire a token scoped for OneLake / ADLS Gen2 DFS operations."""
    app = msal.ConfidentialClientApplication(
        client_id=client_id,
        client_credential=client_secret,
        authority=f"https://login.microsoftonline.com/{tenant_id}",
    )
    result = app.acquire_token_for_client(scopes=ONELAKE_SCOPE)
    if "access_token" in result:
        return result["access_token"]
    raise RuntimeError(
        f"Failed to acquire OneLake token: {result.get('error_description', result)}"
    )