"""Workspace provisioning: create workspace, add SP admin, assign capacity."""

import logging

import httpx
import jwt as pyjwt

from app.modules.fabric.services.auth import FABRIC_API_BASE

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(60.0, connect=10.0)


def _resolve_user_oid_from_email(token: str, email: str) -> str | None:
    """Resolve a user's object ID from their email/UPN via Microsoft Graph API."""
    graph_url = f"https://graph.microsoft.com/v1.0/users/{email}"
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = httpx.get(graph_url, headers=headers, timeout=_TIMEOUT)
        if resp.status_code == 200:
            return resp.json().get("id")
    except Exception as e:
        logger.warning("Graph API user lookup failed for %s: %s", email, e)
    return None


def _get_sp_object_id(token: str) -> str:
    """Extract the service principal object ID from its access token."""
    claims = pyjwt.decode(token, options={"verify_signature": False})
    oid = claims.get("oid")
    if not oid:
        raise RuntimeError("Could not extract service principal object ID from token")
    return oid


def create_workspace(
    token: str,
    display_name: str,
    capacity_id: str | None = None,
) -> dict:
    """Create a new Fabric workspace, optionally assigning capacity at creation time."""
    url = f"{FABRIC_API_BASE}/workspaces"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload: dict = {"displayName": display_name}
    if capacity_id:
        payload["capacityId"] = capacity_id

    resp = httpx.post(url, headers=headers, json=payload, timeout=_TIMEOUT)
    if resp.status_code == 201:
        return resp.json()
    raise RuntimeError(f"Failed to create workspace: {resp.status_code} – {resp.text}")


def assign_workspace_to_capacity(
    token: str,
    workspace_id: str,
    capacity_id: str,
) -> bool:
    """Assign a workspace to a Fabric capacity. Returns True on success."""
    url = f"{FABRIC_API_BASE}/workspaces/{workspace_id}/assignToCapacity"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {"capacityId": capacity_id}

    resp = httpx.post(url, headers=headers, json=payload, timeout=_TIMEOUT)
    if resp.status_code in (200, 202):
        return True
    logger.warning(
        "Could not assign capacity %s to workspace %s: %s – %s",
        capacity_id, workspace_id, resp.status_code, resp.text,
    )
    return False


def add_workspace_role_assignment(
    token: str,
    workspace_id: str,
    principal_id: str | None = None,
    principal_type: str = "ServicePrincipal",
    role: str = "Admin",
    user_email: str | None = None,
) -> dict:
    """Add a role assignment (e.g. Admin) to a Fabric workspace.

    The Fabric API requires `principal.id` (object ID UUID). If only user_email
    is available, we attempt to resolve the OID via MS Graph.
    """
    url = f"{FABRIC_API_BASE}/workspaces/{workspace_id}/roleAssignments"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Resolve principal_id from email via MS Graph if not provided
    if not principal_id and user_email and principal_type == "User":
        principal_id = _resolve_user_oid_from_email(token, user_email)
        if not principal_id:
            raise RuntimeError(
                f"Could not resolve object ID for user '{user_email}'. "
                "Ensure the user exists in Microsoft Entra ID."
            )

    if not principal_id:
        raise RuntimeError("principal_id is required for role assignment")

    principal: dict = {"id": principal_id, "type": principal_type}
    payload = {
        "principal": principal,
        "role": role,
    }

    resp = httpx.post(url, headers=headers, json=payload, timeout=_TIMEOUT)
    if resp.status_code == 201:
        return resp.json()
    # 409 = already assigned, treat as success
    if resp.status_code == 409:
        logger.info("Role assignment already exists for principal %s", principal_id)
        return {"id": principal_id, "role": role}
    raise RuntimeError(
        f"Failed to add role assignment: {resp.status_code} – {resp.text}"
    )


def provision_workspace(
    token: str,
    display_name: str,
    capacity_id: str | None = None,
    user_azure_oid: str | None = None,
    user_fabric_token: str | None = None,
    user_email: str | None = None,
) -> dict:
    """Full provisioning flow: create workspace with capacity → add user as Admin.

    Uses the Service Principal token for all operations (SP has all required scopes).
    Returns dict with workspace_id, sp_object_id, and capacity_assigned flag.
    """
    # Step 1: Create workspace with capacity using SP token
    capacity_assigned = False
    if capacity_id:
        try:
            ws = create_workspace(token, display_name, capacity_id)
            capacity_assigned = True
            logger.info("Created workspace '%s' with capacity %s via SP token", display_name, capacity_id)
        except RuntimeError as e:
            # If name already exists, don't retry — surface the error
            if "WorkspaceNameAlreadyExists" in str(e) or "409" in str(e):
                raise RuntimeError(
                    f"A workspace named '{display_name}' already exists in your Fabric tenant. "
                    "Choose a different name, or delete the existing workspace first."
                )
            logger.warning("Workspace creation with capacity failed, retrying without: %s", e)
            ws = create_workspace(token, display_name)
            logger.info("Created workspace '%s' without capacity via SP token", display_name)
    else:
        ws = create_workspace(token, display_name)
        logger.info("Created workspace '%s' via SP token", display_name)

    workspace_id = ws["id"]

    # Step 2: SP is already Admin (it created the workspace). Ensure explicitly.
    sp_oid = _get_sp_object_id(token)
    try:
        add_workspace_role_assignment(
            token, workspace_id, sp_oid, "ServicePrincipal", "Admin"
        )
        logger.info("Added SP %s as Admin to workspace %s", sp_oid, workspace_id)
    except RuntimeError as e:
        logger.warning("SP role assignment note (likely already admin): %s", e)

    # Step 3: Add the logged-in user as Admin so they can see the workspace
    user_oid = user_azure_oid
    # If no stored OID, extract from user's Fabric token
    if not user_oid and user_fabric_token:
        try:
            user_claims = pyjwt.decode(user_fabric_token, options={"verify_signature": False})
            user_oid = user_claims.get("oid")
        except Exception:
            pass

    if user_oid:
        try:
            add_workspace_role_assignment(
                token, workspace_id, user_oid, "User", "Admin"
            )
            logger.info("Added user %s as Admin to workspace %s", user_oid, workspace_id)
        except RuntimeError as e:
            logger.warning("User role assignment failed: %s", e)
    elif user_email:
        try:
            add_workspace_role_assignment(
                token, workspace_id, user_email=user_email, principal_type="User", role="Admin"
            )
            logger.info("Added user %s as Admin to workspace %s", user_email, workspace_id)
        except RuntimeError as e:
            logger.warning("User role assignment failed: %s", e)

    # Step 4: If capacity wasn't assigned at creation, try separately via SP
    if not capacity_assigned and capacity_id:
        capacity_assigned = assign_workspace_to_capacity(
            token, workspace_id, capacity_id
        )
        if capacity_assigned:
            logger.info("Assigned capacity %s via SP token to workspace %s", capacity_id, workspace_id)
        else:
            logger.warning(
                "Capacity assignment failed — SP may not have Capacity Admin on %s.",
                capacity_id,
            )

    return {
        "workspace_id": workspace_id,
        "workspace_name": ws.get("displayName", display_name),
        "sp_object_id": sp_oid,
        "capacity_assigned": capacity_assigned,
    }
