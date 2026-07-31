"""
Blob Structure Discovery Script
================================
Scans the Azure Blob Storage container `raw` (account: fabricaccelerator)
under the `Data/` prefix, discovers all folders and files, and generates
`blob_config.json` at the project root.

Usage:
    python -m commands.discover_blob_structure                 # full run
    python -m commands.discover_blob_structure --dry-run       # preview only
    python -m commands.discover_blob_structure --prefix Data/Sales/  # scan a subtree
"""

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from azure.identity import ClientSecretCredential
from azure.storage.blob import ContainerClient
from dotenv import load_dotenv

# ── Paths ────────────────────────────────────────────────────────────

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_PROJECT_ROOT = _BACKEND_DIR.parent
_ENV_FILE = _BACKEND_DIR / ".env"
_OUTPUT_FILE = _PROJECT_ROOT / "blob_config.json"

# ── Helpers ──────────────────────────────────────────────────────────

_FORMAT_EXTENSIONS = {
    ".csv": "csv",
    ".tsv": "tsv",
    ".parquet": "parquet",
    ".json": "json",
    ".jsonl": "json",
    ".xlsx": "excel",
    ".xls": "excel",
    ".xml": "xml",
    ".avro": "avro",
    ".orc": "orc",
    ".txt": "text",
}


def _detect_format(filenames: list[str]) -> str:
    """Detect the dominant file format from a list of filenames."""
    counts: dict[str, int] = defaultdict(int)
    for name in filenames:
        ext = os.path.splitext(name)[1].lower()
        fmt = _FORMAT_EXTENSIONS.get(ext, "unknown")
        counts[fmt] += 1
    if not counts:
        return "unknown"
    # Return the most common format; if mixed, return "mixed"
    top = max(counts, key=counts.get)  # type: ignore[arg-type]
    if len(counts) > 1:
        return "mixed"
    return top


def _get_container_client(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    account_url: str,
    container_name: str,
) -> ContainerClient:
    """Build an authenticated ContainerClient using Service Principal."""
    credential = ClientSecretCredential(
        tenant_id=tenant_id,
        client_id=client_id,
        client_secret=client_secret,
    )
    return ContainerClient(
        account_url=account_url,
        container_name=container_name,
        credential=credential,
    )


def discover_blob_structure(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    account_url: str,
    container_name: str,
    prefix: str = "Data/",
    archive_root: str = "Archive/",
) -> dict:
    """
    Scan the blob container under `prefix` and return a config dict
    describing every discovered folder + its files.

    Returns a dict ready to be serialised as blob_config.json.
    """
    container = _get_container_client(
        tenant_id=tenant_id,
        client_id=client_id,
        client_secret=client_secret,
        account_url=account_url,
        container_name=container_name,
    )

    # ── List all blobs under the prefix ───────────────────────────────
    # Group blobs by their "parent folder" (everything except the filename)
    folder_files: dict[str, list[str]] = defaultdict(list)
    all_blob_names: set[str] = set()

    blobs = container.list_blobs(name_starts_with=prefix)
    blob_list = list(blobs)

    # Collect all blob names first to detect virtual directories
    for blob in blob_list:
        all_blob_names.add(blob.name)

    for blob in blob_list:
        name: str = blob.name  # e.g. "Data/Sales/Invoices/inv001.csv"
        # Skip "directory marker" blobs (zero-byte blobs whose name ends with /)
        if name.endswith("/"):
            continue
        # Skip virtual directory markers: blobs with no extension whose name
        # (with a trailing /) is a prefix of other blobs (i.e. it's a folder)
        _, ext = os.path.splitext(name)
        if not ext:
            dir_prefix = name + "/"
            if any(n.startswith(dir_prefix) for n in all_blob_names):
                continue
        # Also skip zero-byte blobs that look like directory placeholders
        if hasattr(blob, "size") and blob.size == 0 and not ext:
            continue

        parts = name.rsplit("/", 1)
        if len(parts) == 2:
            folder, filename = parts
            folder_files[folder + "/"].append(filename)
        else:
            # File sits directly under root (unlikely but handle it)
            folder_files[prefix].append(name)

    # ── Build sources list ─────────────────────────────────────────────
    sources: list[dict] = []
    for folder_path in sorted(folder_files.keys()):
        files = sorted(folder_files[folder_path])
        # Compute the mirrored archive path
        # e.g. "Data/Sales/Invoices/" → "Archive/Sales/Invoices/"
        relative = folder_path
        if relative.startswith(prefix):
            relative = relative[len(prefix) :]
        archive_path = archive_root + relative

        sources.append(
            {
                "source_path": folder_path,
                "archive_path": archive_path,
                "files": files,
                "file_count": len(files),
                "file_format": _detect_format(files),
            }
        )

    # Extract account name from URL (e.g. https://accountname.blob.core.windows.net)
    account_name = account_url.replace("https://", "").replace("http://", "").split(".")[0]

    # ── Assemble full config ──────────────────────────────────────────
    config = {
        "description": (
            "Auto-generated blob structure config. "
            "Describes the folder hierarchy under Data/ in Azure Blob Storage. "
            "Used by the Fabric pipeline to load data and archive processed files."
        ),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "storage": {
            "account_name": account_name,
            "container": container_name,
            "endpoint": account_url,
        },
        "auth": {
            "method": "service_principal",
            "tenant_id": "${env:AZURE_TENANT_ID}",
            "client_id": "${env:AZURE_CLIENT_ID}",
            "client_secret": "${env:AZURE_CLIENT_SECRET}",
        },
        "data_root": prefix,
        "archive_root": archive_root,
        "sources": sources,
        "summary": {
            "total_folders": len(sources),
            "total_files": sum(s["file_count"] for s in sources),
        },
        "archive_rule": {
            "action": "move",
            "description": (
                "After successful load to Lakehouse, copy files from Data/ to Archive/ "
                "preserving folder structure, then delete originals from Data/."
            ),
        },
    }
    return config


# ── CLI ──────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Discover Azure Blob folder structure and generate blob_config.json"
    )
    parser.add_argument(
        "--prefix",
        default="Data/",
        help="Blob prefix to scan (default: Data/)",
    )
    parser.add_argument(
        "--archive-root",
        default="Archive/",
        help="Archive root path (default: Archive/)",
    )
    parser.add_argument(
        "--output",
        default=str(_OUTPUT_FILE),
        help=f"Output file path (default: {_OUTPUT_FILE})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the config to stdout without writing to file",
    )
    args = parser.parse_args()

    # Load .env
    load_dotenv(_ENV_FILE)

    # Validate required env vars
    required = ["FABRIC_TENANT_ID", "FABRIC_CLIENT_ID", "FABRIC_CLIENT_SECRET"]
    missing = [v for v in required if not os.environ.get(v)]
    if missing:
        print(f"[ERROR] Missing environment variables: {', '.join(missing)}", file=sys.stderr)
        print(f"   Make sure they are set in {_ENV_FILE}", file=sys.stderr)
        sys.exit(1)

    print(f"[SCAN] Scanning blob container: {os.environ.get('BLOB_ACCOUNT_NAME', 'fabricaccelerator')}/{os.environ.get('BLOB_CONTAINER_NAME', 'raw')}")
    print(f"   Prefix: {args.prefix}")
    print()

    try:
        config = discover_blob_structure(
            prefix=args.prefix,
            archive_root=args.archive_root,
        )
    except Exception as e:
        print(f"[ERROR] Discovery failed: {e}", file=sys.stderr)
        sys.exit(1)

    output_json = json.dumps(config, indent=2, ensure_ascii=False)

    if args.dry_run:
        print("-- DRY RUN (not writing to file) --")
        print(output_json)
    else:
        output_path = Path(args.output)
        output_path.write_text(output_json, encoding="utf-8")
        print(f"[OK] Config written to {output_path}")

    print()
    print(f"   Discovered {config['summary']['total_folders']} folder(s)")
    print(f"   Containing  {config['summary']['total_files']} file(s)")

    if config["sources"]:
        print()
        print("   Sources:")
        for src in config["sources"]:
            print(f"     - {src['source_path']}  ({src['file_count']} files, {src['file_format']})")


if __name__ == "__main__":
    main()
