import base64
import httpx
import json
import logging
import os

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, hmac as crypto_hmac, padding as sym_padding
from cryptography.hazmat.primitives.asymmetric import padding as asym_padding
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicNumbers
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from app.modules.fabric.services.auth import FABRIC_API_BASE

logger = logging.getLogger(__name__)
_TIMEOUT = httpx.Timeout(60.0, connect=10.0)
 

def list_gateways(token: str) -> list[dict]:
    """Return all on-premises data gateways visible to the service principal."""
    url = f"{FABRIC_API_BASE}/gateways"
    headers = {"Authorization": f"Bearer {token}"}
    resp = httpx.get(url, headers=headers, timeout=_TIMEOUT)
    resp.raise_for_status()
    raw = resp.json()
    logger.info("Raw gateways response: %s", raw)
    gateways = raw.get("value", [])
    results = []
    for gw in gateways:
        gw_id = gw["id"]
        gw_type = gw.get("type", "")
        # Try multiple possible name fields from the API
        name = (
            gw.get("displayName")
            or gw.get("name")
            or gw.get("gatewayAnnotation")
            or ""
        )
        # If no top-level name, try to fetch individual gateway details
        if not name:
            try:
                detail_resp = httpx.get(
                    f"{FABRIC_API_BASE}/gateways/{gw_id}",
                    headers=headers,
                    timeout=_TIMEOUT,
                )
                if detail_resp.is_success:
                    detail = detail_resp.json()
                    name = (
                        detail.get("displayName")
                        or detail.get("name")
                        or detail.get("gatewayAnnotation")
                        or ""
                    )
                    # Check memberGateways in detail response
                    if not name:
                        for member in detail.get("memberGateways", []):
                            name = member.get("displayName") or member.get("name") or ""
                            if name:
                                break
            except Exception:
                pass
        # Last resort: use ID as display name
        if not name:
            name = gw_id
        results.append({"id": gw_id, "name": name, "type": gw_type})
    return results


def list_connections(token: str) -> list[dict]:
    """Return every connection visible to the caller across the whole
    tenant — same set shown in Fabric's "Manage connections and
    gateways" page, not just connections created from this app/project.
    """
    url = f"{FABRIC_API_BASE}/connections"
    headers = {"Authorization": f"Bearer {token}"}
    resp = httpx.get(url, headers=headers, timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json().get("value", [])


def get_gateway_id(token: str, gateway_name: str) -> str:
    url = f"{FABRIC_API_BASE}/gateways"
    headers = {"Authorization": f"Bearer {token}"}
    resp = httpx.get(url, headers=headers, timeout=_TIMEOUT)
    resp.raise_for_status()
    gateways = resp.json().get("value", [])
    for gw in gateways:
        gw_display = gw.get("displayName") or gw.get("name") or ""
        if gw_display == gateway_name or gw.get("id") == gateway_name:
            return gw["id"]
    available = [g.get("displayName") or g.get("name") or g.get("id") for g in gateways]
    raise ValueError(f"Gateway '{gateway_name}' not found. Available: {available or 'None'}")


def _get_gateway_public_key(token: str, gateway_id: str) -> dict:
    """Fetch the gateway's public key for credential encryption."""
    url = f"{FABRIC_API_BASE}/gateways/{gateway_id}"
    headers = {"Authorization": f"Bearer {token}"}
    resp = httpx.get(url, headers=headers, timeout=_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    pk = data.get("publicKey", {})
    return {"exponent": pk.get("exponent", ""), "modulus": pk.get("modulus", "")}


def _encrypt_credentials(username: str, password: str, modulus_b64: str, exponent_b64: str) -> str:
    """Encrypt credentials using the Power BI gateway encryption scheme.

    Uses AES-256-CBC + HMAC-SHA256 for data, RSA-OAEP (SHA-256) for key wrapping.
    """
    modulus_bytes = base64.b64decode(modulus_b64)
    exponent_bytes = base64.b64decode(exponent_b64)
    modulus_int = int.from_bytes(modulus_bytes, "big")
    exponent_int = int.from_bytes(exponent_bytes, "big")
    public_key = RSAPublicNumbers(exponent_int, modulus_int).public_key(default_backend())

    # Serialize credentials
    cred_data = {"credentialData": [{"name": "username", "value": username}, {"name": "password", "value": password}]}
    plain_text_bytes = json.dumps(cred_data, separators=(",", ":")).encode("utf-8")

    # Generate ephemeral keys
    AES_KEY_SIZE = 32
    HMAC_KEY_SIZE = 64
    key_enc = os.urandom(AES_KEY_SIZE)
    key_mac = os.urandom(HMAC_KEY_SIZE)

    # Authenticated Encryption (AES-256-CBC + HMAC-SHA256)
    iv = os.urandom(16)
    padder = sym_padding.PKCS7(algorithms.AES.block_size).padder()
    padded_data = padder.update(plain_text_bytes) + padder.finalize()
    cipher = Cipher(algorithms.AES(key_enc), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    cipher_text = encryptor.update(padded_data) + encryptor.finalize()

    # HMAC over [algorithm_choices, iv, cipher_text]
    algorithm_choices = bytearray([0, 0])  # AES256CbcPkcs7=0, HMACSHA256=0
    tag_data = bytearray(len(algorithm_choices) + len(iv) + len(cipher_text))
    offset = 0
    tag_data[0:len(algorithm_choices)] = algorithm_choices
    offset += len(algorithm_choices)
    tag_data[offset:offset + len(iv)] = iv
    offset += len(iv)
    tag_data[offset:offset + len(cipher_text)] = cipher_text

    hmac_instance = crypto_hmac.HMAC(key_mac, hashes.SHA256(), backend=default_backend())
    hmac_instance.update(bytes(tag_data))
    mac = hmac_instance.finalize()

    # Build AE output: algorithm_choices + mac + iv + cipher_text
    ae_output = bytearray(len(algorithm_choices) + len(mac) + len(iv) + len(cipher_text))
    offset = 0
    ae_output[0:len(algorithm_choices)] = algorithm_choices
    offset += len(algorithm_choices)
    ae_output[offset:offset + len(mac)] = mac
    offset += len(mac)
    ae_output[offset:offset + len(iv)] = iv
    offset += len(iv)
    ae_output[offset:offset + len(cipher_text)] = cipher_text

    # Encrypt ephemeral keys with RSA-OAEP (SHA-256)
    keys = bytearray(2 + AES_KEY_SIZE + HMAC_KEY_SIZE)
    keys[0] = 0  # KEY_LENGTH_32
    keys[1] = 1  # KEY_LENGTH_64
    keys[2:2 + AES_KEY_SIZE] = key_enc
    keys[2 + AES_KEY_SIZE:2 + AES_KEY_SIZE + HMAC_KEY_SIZE] = key_mac

    encrypted_keys = public_key.encrypt(
        bytes(keys),
        asym_padding.OAEP(mgf=asym_padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None),
    )

    # Final: base64(encrypted_keys) + base64(ae_output)
    return base64.b64encode(encrypted_keys).decode() + base64.b64encode(bytes(ae_output)).decode()


def create_source_connection(
    token: str,
    conn_name: str,
    db_type: str,
    server: str,
    database: str | None,
    username: str | None = None,
    password: str | None = None,
    is_on_prem: bool = False,
    gateway_name: str | None = None,
    auth_type: str = "Basic",
    tenant_id: str | None = None,
    client_id: str | None = None,
    client_secret: str | None = None,
) -> dict:
    url = f"{FABRIC_API_BASE}/connections"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    type_map = {
        "sql server": "SQL",
        "azure sql": "SQL",
        "mysql": "MySql",
        "oracle": "Oracle",
        "postgres": "PostgreSQL",
        "postgresql": "PostgreSQL",
        "azure blob": "AzureBlobs",
    }
    conn_type = type_map.get(db_type.lower(), "SQL")

    if is_on_prem and not gateway_name:
        raise ValueError("gateway_name is required when is_on_prem=True")

    # Azure Blob uses the provided URL and Service Principal credentials
    if conn_type == "AzureBlobs":
        # Extract account name and domain from URL if provided as URL
        cleaned_server = server.replace("https://", "").replace("http://", "").strip("/")
        if "." in cleaned_server:
            blob_account = cleaned_server.split(".")[0]
            blob_domain = cleaned_server.split(".", 1)[1]
        else:
            blob_account = cleaned_server
            blob_domain = "blob.core.windows.net"
            
        params = [
            {"dataType": "Text", "name": "account", "value": blob_account},
            {"dataType": "Text", "name": "domain", "value": blob_domain}
        ]
        use_gateway = False
    else:
        params = [{"dataType": "Text", "name": "server", "value": server}]
        # Oracle doesn't use a separate "database" parameter — the server field
        # should contain host:port/service_name. Only add database for SQL-based types.
        if database and conn_type != "Oracle":
            params.append({"dataType": "Text", "name": "database", "value": database})
        use_gateway = is_on_prem and bool(gateway_name)

    payload = {
        "connectivityType": "OnPremisesGateway" if use_gateway else "ShareableCloud",
        "displayName": conn_name,
        "description": f"Source connection - {db_type} ({server}/{database or ''})" if conn_type != "AzureBlobs" else f"Source connection - Azure Blob ({blob_account})",
        "connectionDetails": {
            "type": conn_type,
            "creationMethod": conn_type,
            "parameters": params,
        },
        "privacyLevel": "Organizational",
    }

    if conn_type == "AzureBlobs":
        payload["credentialDetails"] = {
            "singleSignOnType": "None",
            "connectionEncryption": "NotEncrypted",
            "credentials": {
                "credentialType": "ServicePrincipal",
                "servicePrincipalClientId": client_id,
                "servicePrincipalSecret": client_secret,
                "tenantId": tenant_id,
            },
        }
    elif use_gateway:
        gateway_id = get_gateway_id(token, gateway_name)
        payload["gatewayId"] = gateway_id

        # Confirmed via API validation error ("The Values field is required"):
        # OnPremisesGateway connections require the RSA-encrypted "values" array
        # regardless of credentialType — plain username/password is rejected.
        pub_key = _get_gateway_public_key(token, gateway_id)
        logger.info(
            "Gateway public key lengths - modulus: %d chars, exponent: %d chars",
            len(pub_key.get("modulus") or ""), len(pub_key.get("exponent") or ""),
        )
        encrypted_creds = _encrypt_credentials(
            username or "", password or "", pub_key["modulus"], pub_key["exponent"]
        )
        payload["credentialDetails"] = {
            "singleSignOnType": "None",
            "connectionEncryption": "Any",
            "skipTestConnection": False,
            "credentials": {
                "credentialType": "Basic",
                "values": [{"gatewayId": gateway_id, "encryptedCredentials": encrypted_creds}],
            },
        }
    elif auth_type == "ServicePrincipal" and conn_type == "PostgreSQL":
        payload["credentialDetails"] = {
            "singleSignOnType": "None",
            "connectionEncryption": "NotEncrypted",
            "credentials": {
                "credentialType": "ServicePrincipal",
                "servicePrincipalClientId": client_id,
                "servicePrincipalSecret": client_secret,
                "servicePrincipalTenantId": tenant_id,
            },
        }
    elif auth_type == "OAuth" and conn_type == "PostgreSQL":
        payload["credentialDetails"] = {
            "singleSignOnType": "None",
            "connectionEncryption": "NotEncrypted",
            "credentials": {
                "credentialType": "OAuth2",
                "servicePrincipalClientId": client_id,
                "servicePrincipalTenantId": tenant_id,
            },
        }
    else:
        payload["credentialDetails"] = {
            "singleSignOnType": "None",
            "connectionEncryption": "NotEncrypted",
            "credentials": {
                "credentialType": "Basic",
                "username": username,
                "password": password,
            },
        }

    logger.info("Creating connection with payload: %s", {k: v for k, v in payload.items() if k != "credentialDetails"})
    resp = httpx.post(url, headers=headers, json=payload, timeout=_TIMEOUT)
    if not resp.is_success:
        detail = resp.text
        logger.error("Fabric connection creation failed (%s): %s", resp.status_code, detail)
        raise RuntimeError(f"Connection creation failed ({resp.status_code}): {detail}")
    
    data = resp.json()
    logger.info("Connection created: %s", data.get("id"))

    return data


def assign_role_to_connection(
    token: str, connection_id: str, user_object_id: str, role: str = "Owner"
) -> dict:
    url = f"{FABRIC_API_BASE}/connections/{connection_id}/roleAssignments"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {
        "principal": {"id": user_object_id.strip(), "type": "User"},
        "role": role,
    }
    resp = httpx.post(url, headers=headers, json=payload, timeout=_TIMEOUT)
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Role assignment failed ({resp.status_code}): {resp.text}")
    try:
        return resp.json()
    except Exception:
        return {}