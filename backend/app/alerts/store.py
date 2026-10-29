"""SQLite store for push subscriptions and scheduled alerts (data/alerts.db)."""
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
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT UNIQUE NOT NULL,
  subscription TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT,
  event_id TEXT,
  fire_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TEXT NOT NULL,
  sent_at TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS alerts_due ON alerts(status, fire_at);
"""


def _db() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        path = settings.data_path / "alerts.db"
        _conn = sqlite3.connect(path, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA foreign_keys = ON")
        _conn.executescript(SCHEMA)
    return _conn


def reset_for_tests(path_override: str | None = None) -> None:
    """Tests call this with their own data dir already configured."""
    global _conn
    with _lock:
        if _conn is not None:
            _conn.close()
        _conn = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def upsert_subscription(subscription: dict[str, Any], user_agent: str | None = None) -> dict[str, Any]:
    endpoint = subscription["endpoint"]
    with _lock:
        db = _db()
        db.execute(
            "INSERT INTO subscriptions(endpoint, subscription, user_agent, created_at) VALUES (?,?,?,?) "
            "ON CONFLICT(endpoint) DO UPDATE SET subscription=excluded.subscription, user_agent=excluded.user_agent",
            (endpoint, json.dumps(subscription), user_agent, _now()),
        )
        db.commit()
        row = db.execute("SELECT id, endpoint, created_at FROM subscriptions WHERE endpoint=?", (endpoint,)).fetchone()
    return dict(row)


def get_subscription(endpoint: str) -> dict[str, Any] | None:
    with _lock:
        row = _db().execute("SELECT * FROM subscriptions WHERE endpoint=?", (endpoint,)).fetchone()
    if row is None:
        return None
    d = dict(row)
    d["subscription"] = json.loads(d["subscription"])
    return d


def delete_subscription(endpoint: str) -> int:
    with _lock:
        db = _db()
        cur = db.execute("DELETE FROM subscriptions WHERE endpoint=?", (endpoint,))
        db.commit()
        return cur.rowcount


def schedule(subscription_id: int, title: str, body: str, fire_at: datetime, url: str | None = None, event_id: str | None = None) -> dict[str, Any]:
    with _lock:
        db = _db()
        cur = db.execute(
            "INSERT INTO alerts(subscription_id, title, body, url, event_id, fire_at, status, created_at) VALUES (?,?,?,?,?,?, 'scheduled', ?)",
            (subscription_id, title, body, url, event_id, fire_at.astimezone(timezone.utc).isoformat(), _now()),
        )
        db.commit()
        row = db.execute("SELECT * FROM alerts WHERE id=?", (cur.lastrowid,)).fetchone()
    return dict(row)


def get_alert(alert_id: int) -> dict[str, Any] | None:
    with _lock:
        row = _db().execute("SELECT * FROM alerts WHERE id=?", (alert_id,)).fetchone()
    return dict(row) if row else None


def list_alerts(endpoint: str, include_sent: bool = False) -> list[dict[str, Any]]:
    q = "SELECT a.* FROM alerts a JOIN subscriptions s ON s.id=a.subscription_id WHERE s.endpoint=?"
    if not include_sent:
        q += " AND a.status='scheduled'"
    q += " ORDER BY a.fire_at"
    with _lock:
        rows = _db().execute(q, (endpoint,)).fetchall()
    return [dict(r) for r in rows]


def cancel(alert_id: int, endpoint: str) -> int:
    with _lock:
        db = _db()
        cur = db.execute(
            "UPDATE alerts SET status='cancelled' WHERE id=? AND status='scheduled' AND subscription_id=(SELECT id FROM subscriptions WHERE endpoint=?)",
            (alert_id, endpoint),
        )
        db.commit()
        return cur.rowcount


def due(now: datetime | None = None, limit: int = 50) -> list[dict[str, Any]]:
    """Scheduled alerts whose fire_at has passed, each with its subscription JSON attached."""
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat()
    with _lock:
        rows = _db().execute(
            "SELECT a.*, s.subscription AS subscription_json, s.endpoint AS endpoint FROM alerts a "
            "JOIN subscriptions s ON s.id=a.subscription_id WHERE a.status='scheduled' AND a.fire_at<=? ORDER BY a.fire_at LIMIT ?",
            (now, limit),
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["subscription"] = json.loads(d.pop("subscription_json"))
        out.append(d)
    return out


def mark(alert_id: int, status: str, error: str | None = None) -> None:
    with _lock:
        db = _db()
        db.execute("UPDATE alerts SET status=?, sent_at=?, error=? WHERE id=?", (status, _now() if status == "sent" else None, error, alert_id))
        db.commit()


def stats() -> dict[str, int]:
    with _lock:
        db = _db()
        subs = db.execute("SELECT COUNT(*) FROM subscriptions").fetchone()[0]
        rows = db.execute("SELECT status, COUNT(*) FROM alerts GROUP BY status").fetchall()
    return {"subscriptions": subs, **{r[0]: r[1] for r in rows}}
