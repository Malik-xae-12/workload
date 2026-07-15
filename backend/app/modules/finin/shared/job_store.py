"""Job storage for Finin mapping runs — backed by a local SQLite file so jobs
survive `uvicorn --reload` restarts (an in-memory dict does not: every reload
wipes it, which made "Save to Metadata" 404 with "Job not ready" right after
any backend restart).
"""

import json
import sqlite3
import time
from pathlib import Path

from app.modules.finin.shared.utils import sanitize_for_json


def _find_backend_dir(start: Path) -> Path:
    for candidate in (start, *start.parents):
        if (candidate / "requirements.txt").exists() or (candidate / ".env").exists():
            return candidate
    return start.parents[4]  # fallback guess


_DB_PATH = _find_backend_dir(Path(__file__).resolve().parent) / ".finin_jobs.sqlite3"

# Jobs older than this are pruned lazily on write, so the file doesn't grow forever.
_MAX_JOB_AGE_SECONDS = 7 * 24 * 60 * 60  # 7 days


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(_DB_PATH), timeout=10, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS jobs (job_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at REAL NOT NULL)"
    )
    return conn


def get_job(job_id: str) -> dict | None:
    """Retrieve a job by ID."""
    with _connect() as conn:
        row = conn.execute("SELECT data FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    return json.loads(row[0]) if row else None


def create_job(job_id: str) -> dict:
    """Initialize a new job entry."""
    job = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "total": 0,
        "message": "Job queued.",
        "result": None,
    }
    _write(job_id, job)
    return job


def update_job(job_id: str, **fields) -> None:
    """Update job fields."""
    job = get_job(job_id)
    if job is None:
        return
    job.update(fields)
    _write(job_id, job)


def set_progress(job_id: str, message: str, progress: int | None = None) -> None:
    """Update job progress message and optionally progress count."""
    job = get_job(job_id)
    if job is None:
        return
    job["message"] = message
    if progress is not None:
        job["progress"] = progress
    _write(job_id, job)


def all_jobs() -> dict[str, dict]:
    """Return all jobs (for admin/debug)."""
    with _connect() as conn:
        rows = conn.execute("SELECT job_id, data FROM jobs").fetchall()
    return {job_id: json.loads(data) for job_id, data in rows}


def _write(job_id: str, job: dict) -> None:
    safe = sanitize_for_json(job)
    now = time.time()
    with _connect() as conn:
        conn.execute(
            "INSERT INTO jobs (job_id, data, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(job_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
            (job_id, json.dumps(safe), now),
        )
        conn.execute("DELETE FROM jobs WHERE updated_at < ?", (now - _MAX_JOB_AGE_SECONDS,))