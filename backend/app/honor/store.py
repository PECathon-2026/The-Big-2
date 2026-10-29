"""SQLite ledger of observations per anonymous user (data/honor.db)."""
from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Any

from ..core.config import settings

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  event_id TEXT,
  title TEXT NOT NULL,
  note TEXT,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  claimed_at TEXT NOT NULL,
  verified INTEGER NOT NULL,
  reason TEXT NOT NULL,
  evidence TEXT NOT NULL,
  points INTEGER NOT NULL,
  photo_job_id TEXT,
  conditions TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS obs_user ON observations(user_id, claimed_at);
"""


def _db() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(settings.data_path / "honor.db", check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.executescript(SCHEMA)
    return _conn


def reset_for_tests() -> None:
    global _conn
    with _lock:
        if _conn is not None:
            _conn.close()
        _conn = None


def add(user_id: str, **f: Any) -> dict[str, Any]:
    with _lock:
        db = _db()
        cur = db.execute(
            "INSERT INTO observations(user_id, kind, event_id, title, note, lat, lon, claimed_at, verified, reason, evidence, points, photo_job_id, conditions, created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                user_id, f["kind"], f.get("event_id"), f["title"], f.get("note"), f["lat"], f["lon"], f["claimed_at"],
                1 if f["verified"] else 0, f["reason"], json.dumps(f.get("evidence") or {}), f["points"], f.get("photo_job_id"),
                json.dumps(f.get("conditions")) if f.get("conditions") is not None else None, datetime.now(timezone.utc).isoformat(),
            ),
        )
        db.commit()
        row = db.execute("SELECT * FROM observations WHERE id=?", (cur.lastrowid,)).fetchone()
    return _row(row)


def ledger(user_id: str) -> list[dict[str, Any]]:
    with _lock:
        rows = _db().execute("SELECT * FROM observations WHERE user_id=? ORDER BY claimed_at DESC", (user_id,)).fetchall()
    return [_row(r) for r in rows]


def total_points(user_id: str) -> int:
    with _lock:
        v = _db().execute("SELECT COALESCE(SUM(points),0) FROM observations WHERE user_id=?", (user_id,)).fetchone()[0]
    return int(v)


def _row(r: sqlite3.Row) -> dict[str, Any]:
    d = dict(r)
    d["verified"] = bool(d["verified"])
    d["evidence"] = json.loads(d["evidence"]) if d.get("evidence") else {}
    d["conditions"] = json.loads(d["conditions"]) if d.get("conditions") else None
    return d
