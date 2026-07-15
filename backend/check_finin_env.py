"""
Run this from inside backend/, with your venv active:

    python check_finin_env.py

It bypasses uvicorn entirely and tells you exactly what Finin's config module
sees. No secrets are printed in full.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

print("=" * 60)
print("1. Does the config file even have the new code?")
print("=" * 60)
config_path = Path(__file__).resolve().parent / "app" / "modules" / "finin" / "core" / "config.py"
print(f"Looking at: {config_path}")
if not config_path.exists():
    print("!! FILE DOES NOT EXIST AT THIS PATH. Your backend/ folder layout doesn't")
    print("!! match app/modules/finin/core/config.py — check where app/ actually is.")
    sys.exit(1)

text = config_path.read_text(encoding="utf-8")
if "_find_backend_dir" in text:
    print("OK — this file has the latest fix.")
else:
    print("!! This file is an OLD version — the replacement didn't take.")
    print("!! Re-save the file I gave you to exactly this path and try again.")
    sys.exit(1)

print()
print("=" * 60)
print("2. Importing it and checking what it resolved")
print("=" * 60)
try:
    from app.modules.finin.core.config import settings, BACKEND_DIR, _ENV_FILE
except Exception as e:
    print(f"!! IMPORT FAILED: {type(e).__name__}: {e}")
    sys.exit(1)

print(f"BACKEND_DIR resolved to : {BACKEND_DIR}")
print(f".env expected at        : {_ENV_FILE}")
print(f".env exists?            : {_ENV_FILE.exists()}")
print()
print(f"AZURE_OPENAI_ENDPOINT   : {'SET (' + settings.AZURE_OPENAI_ENDPOINT[:20] + '...)' if settings.AZURE_OPENAI_ENDPOINT else 'EMPTY'}")
print(f"AZURE_OPENAI_DEPLOYMENT : {'SET (' + settings.AZURE_OPENAI_DEPLOYMENT + ')' if settings.AZURE_OPENAI_DEPLOYMENT else 'EMPTY'}")
print(f"AZURE_OPENAI_API_KEY    : {'SET (len=' + str(len(settings.AZURE_OPENAI_API_KEY)) + ')' if settings.AZURE_OPENAI_API_KEY else 'EMPTY'}")
print(f"AZURE_OPENAI_API_VERSION: {settings.AZURE_OPENAI_API_VERSION}")

print()
print("=" * 60)
print("3. Raw .env file contents (if found)")
print("=" * 60)
if _ENV_FILE.exists():
    raw = _ENV_FILE.read_bytes()
    print(f"File size: {len(raw)} bytes")
    print(f"First 4 bytes (hex): {raw[:4].hex()}  <- if this starts with fffe or feff, it's UTF-16, not UTF-8!")
    try:
        content = raw.decode("utf-8")
        for line in content.splitlines():
            if line.strip() and not line.strip().startswith("#"):
                key = line.split("=", 1)[0].strip()
                print(f"  key found: {key!r}")
    except UnicodeDecodeError as e:
        print(f"!! Could not decode as UTF-8: {e}")
        print("!! Re-save backend/.env as UTF-8 (not UTF-16/ANSI).")
else:
    print("No .env file found at that path — nothing to show.")

print()
print("=" * 60)
print("4. Check for OS environment variables silently overriding it")
print("=" * 60)
import os
for k in ("AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_DEPLOYMENT", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_API_VERSION"):
    if k in os.environ:
        print(f"!! {k} is set as a real OS environment variable (value hidden) —")
        print(f"!! this OVERRIDES your .env file. Remove it from Windows env vars.")
    else:
        print(f"  {k}: not set in OS environment (good, .env will be used)")