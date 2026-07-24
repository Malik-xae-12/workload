import httpx
import msal

FABRIC_API_BASE = "https://api.fabric.microsoft.com/v1"
SCOPE = ["https://api.fabric.microsoft.com/.default"]
ONELAKE_SCOPE = ["https://storage.azure.com/.default"]
GRAPH_SCOPE = ["https://graph.microsoft.com/.default"]
GRAPH_API_BASE = "https://graph.microsoft.com/v1.0"


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


def get_graph_token(client_id: str, client_secret: str, tenant_id: str) -> str:
    """Acquire an app-only (client-credentials) token for Microsoft Graph.

    Requires the app registration to have the 'Mail.Send' *Application*
    permission (admin-consented once, tenant-wide). Unlike the Office365Outlook
    connector, this needs no interactive per-project/per-workspace sign-in —
    the same service principal already used for Fabric/OneLake works here too.
    """
    app = msal.ConfidentialClientApplication(
        client_id=client_id,
        client_credential=client_secret,
        authority=f"https://login.microsoftonline.com/{tenant_id}",
    )
    result = app.acquire_token_for_client(scopes=GRAPH_SCOPE)
    if "access_token" in result:
        return result["access_token"]
    raise RuntimeError(
        f"Failed to acquire Graph token: {result.get('error_description', result)}"
    )


def send_mail_via_graph(
    client_id: str,
    client_secret: str,
    tenant_id: str,
    sender_upn: str,
    to: list[str],
    subject: str,
    body: str,
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
) -> None:
    """Send mail via Microsoft Graph app-only auth, as a drop-in replacement
    for the Office365Outlook connector activity used by 06_PL_MailTrigger.

    sender_upn: the mailbox to send *from* (e.g. 'noreply@yourtenant.com').
    The app registration needs 'Mail.Send' application permission, and ideally
    an application access policy scoping it to just this mailbox.
    """
    token = get_graph_token(client_id, client_secret, tenant_id)

    def _recipients(addresses: list[str] | None):
        return [{"emailAddress": {"address": a}} for a in (addresses or [])]

    payload = {
        "message": {
            "subject": subject,
            "body": {"contentType": "Text", "content": body},
            "toRecipients": _recipients(to),
            "ccRecipients": _recipients(cc),
            "bccRecipients": _recipients(bcc),
        },
        "saveToSentItems": "false",
    }

    resp = httpx.post(
        f"{GRAPH_API_BASE}/users/{sender_upn}/sendMail",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
        timeout=30,
    )
    if resp.status_code >= 300:
        raise RuntimeError(f"Graph sendMail failed ({resp.status_code}): {resp.text}")
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