import httpx

from app.modules.fabric.services.auth import FABRIC_API_BASE

_TIMEOUT = httpx.Timeout(60.0, connect=10.0)


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def create_folder(token: str, workspace_id: str, name: str, parent_id: str | None = None) -> dict:
    url = f"{FABRIC_API_BASE}/workspaces/{workspace_id}/folders"
    payload: dict = {"displayName": name}
    if parent_id:
        payload["parentFolderId"] = parent_id
    resp = httpx.post(url, headers=_headers(token), json=payload, timeout=_TIMEOUT)
    if resp.status_code == 409:
        # Folder already exists, look it up
        folder_id = get_folder_id(token, workspace_id, name, parent_id)
        if folder_id:
            return {"id": folder_id, "displayName": name}
        raise RuntimeError(f"Folder '{name}' conflict but could not find existing folder")
    if not resp.is_success:
        # If folders API not supported, try to find existing or return a virtual folder
        folder_id = get_folder_id(token, workspace_id, name, parent_id)
        if folder_id:
            return {"id": folder_id, "displayName": name}
        raise RuntimeError(f"Folder creation failed ({resp.status_code}): {resp.text}")
    return resp.json()


def get_folder_id(token: str, workspace_id: str, name: str, parent_id: str | None = None) -> str | None:
    url = f"{FABRIC_API_BASE}/workspaces/{workspace_id}/folders"
    resp = httpx.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=_TIMEOUT)
    if resp.status_code == 200:
        for f in resp.json().get("value", []):
            if f.get("displayName") == name:
                if parent_id is None or f.get("parentFolderId") == parent_id:
                    return f["id"]
    return None


def _get_item_id(token: str, workspace_id: str, item_type: str, name: str) -> str | None:
    endpoint = "lakehouses" if item_type == "lakehouse" else "warehouses"
    url = f"{FABRIC_API_BASE}/workspaces/{workspace_id}/{endpoint}"
    resp = httpx.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=_TIMEOUT)
    if resp.status_code == 200:
        for item in resp.json().get("value", []):
            if item.get("displayName") == name:
                return item.get("id")
    return None


def create_item(
    token: str,
    workspace_id: str,
    item_type: str,
    name: str,
    description: str,
    folder_id: str | None = None,
    schema_enabled: bool = True,
) -> dict:
    """Create a warehouse/lakehouse and reliably return its id.
 
    Fabric may return 202 Accepted while provisioning asynchronously; in that case,
    `resp.json()` might not contain an `id` yet. We poll until the item becomes visible.
    """
    # FIX 1: Use the Core Items endpoint to natively support 'folderId'
    url = f"{FABRIC_API_BASE}/workspaces/{workspace_id}/items"
    
    # Capitalize item type to match Core API requirements ('Lakehouse' / 'Warehouse')
    formatted_type = "Lakehouse" if item_type.lower() == "lakehouse" else "Warehouse"
    
    payload: dict = {
        "displayName": name, 
        "description": description,
        "type": formatted_type
    }
    
    if folder_id:
        payload["folderId"] = folder_id
        
    # FIX 2: Apply creationPayload ONLY to Lakehouses to prevent Warehouse API failures
    if formatted_type == "Lakehouse" and schema_enabled:
        payload["creationPayload"] = {"enableSchemas": True}
 
    resp = httpx.post(url, headers=_headers(token), json=payload, timeout=_TIMEOUT)
    
    if resp.status_code == 409:
        # Item already exists, look it up
        item_id = _get_item_id(token, workspace_id, item_type, name)
        if item_id:
            return {"id": item_id, "displayName": name}
        raise RuntimeError(f"Item '{name}' conflict but could not find existing item")
   
    if resp.status_code not in (200, 201, 202):
        raise RuntimeError(f"Item creation failed ({resp.status_code}): {resp.text}")
 
    try:
        data = resp.json()
    except Exception:
        data = {}
 
    # Happy path when id is present
    if isinstance(data, dict) and data.get("id"):
        return data
 
    # Provisioning path (202 / id missing): poll until item becomes visible
    for _ in range(20):
        item_id = _get_item_id(token, workspace_id, item_type, name)
        if item_id:
            return {"id": item_id, "displayName": name}
        # ~10s total delay (20 * 0.5s)
        import time
 
        time.sleep(0.5)
 
    # Still no item id — return what we got for debugging
    return data or {"id": None, "displayName": name}

def setup_medallion_architecture(
    token: str,
    workspace_id: str,
    bronze_is_lakehouse: bool = True,
    silver_is_lakehouse: bool = True,
    gold_is_lakehouse: bool = False,
    schema_enabled: bool = True,
    bronze_name: str = "Bronze_Layer",
    silver_name: str = "Silver_Layer",
    gold_name: str = "Gold_Layer",
) -> dict:
    """Create medallion folder structure and Lakehouse/Warehouse items in Fabric.

    Returns a dict with the Fabric item IDs for bronze, silver, gold.
    """
    med = create_folder(token, workspace_id, "01_Medallion Architecture")
    med_id = med["id"]

    b_folder = create_folder(token, workspace_id, "Bronze", med_id)
    s_folder = create_folder(token, workspace_id, "Silver", med_id)
    g_folder = create_folder(token, workspace_id, "Gold", med_id)

    b_id = b_folder.get("id") or get_folder_id(token, workspace_id, "Bronze")
    s_id = s_folder.get("id") or get_folder_id(token, workspace_id, "Silver")
    g_id = g_folder.get("id") or get_folder_id(token, workspace_id, "Gold")

    bronze = create_item(
        token, workspace_id,
        "lakehouse" if bronze_is_lakehouse else "warehouse",
        bronze_name, "Raw data layer", b_id, schema_enabled,
    )
    silver = create_item(
        token, workspace_id,
        "lakehouse" if silver_is_lakehouse else "warehouse",
        silver_name, "Cleansed & conformed data", s_id, schema_enabled,
    )
    gold = create_item(
        token, workspace_id,
        "lakehouse" if gold_is_lakehouse else "warehouse",
        gold_name, "Business-ready analytics", g_id, schema_enabled,
    )

    # Guard: ensure all three items were created and IDs retrieved successfully
    if not bronze or not bronze.get("id"):
        raise RuntimeError(f"Failed to create or retrieve Bronze item '{bronze_name}'")
    if not silver or not silver.get("id"):
        raise RuntimeError(f"Failed to create or retrieve Silver item '{silver_name}'")
    if not gold or not gold.get("id"):
        raise RuntimeError(f"Failed to create or retrieve Gold item '{gold_name}'")

    return {
        "bronze_item_id": bronze.get("id"),
        "silver_item_id": silver.get("id"),
        "gold_item_id": gold.get("id"),
    }