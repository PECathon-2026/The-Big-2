"""A small TTL cache: in-memory plus a JSON file per key on disk, so restarts and rate limits don't hurt.

Also holds the demo-replay store: `data/replay/<key>.json` files are recorded real responses that are served
only when TSUKUYOMI_DEMO_REPLAY=1 and the upstream call fails. Served replay data is always marked as such.
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import settings


@dataclass
class CacheEntry:
    value: Any
    fetched_at: float  # unix seconds
    ttl: float

    @property
    def fresh(self) -> bool:
        return time.time() - self.fetched_at < self.ttl

    @property
    def fetched_dt(self) -> datetime:
        return datetime.fromtimestamp(self.fetched_at, tz=timezone.utc)


class TTLCache:
    def __init__(self, name: str):
        self._mem: dict[str, CacheEntry] = {}
        self._lock = threading.Lock()
        self._dir = settings.data_path / "cache" / name
        self._dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _hash(key: str) -> str:
        return hashlib.sha1(key.encode("utf-8")).hexdigest()

    def _path(self, key: str) -> Path:
        return self._dir / f"{self._hash(key)}.json"

    def get(self, key: str) -> CacheEntry | None:
        """Return the entry if present (fresh or not). The caller decides whether stale is acceptable."""
        with self._lock:
            e = self._mem.get(key)
        if e is not None:
            return e
        p = self._path(key)
        if p.exists():
            try:
                raw = json.loads(p.read_text(encoding="utf-8"))
                e = CacheEntry(raw["value"], raw["fetched_at"], raw["ttl"])
                with self._lock:
                    self._mem[key] = e
                return e
            except Exception:
                return None
        return None

    def set(self, key: str, value: Any, ttl: float) -> CacheEntry:
        e = CacheEntry(value, time.time(), ttl)
        with self._lock:
            self._mem[key] = e
        try:
            self._path(key).write_text(
                json.dumps({"key": key, "value": value, "fetched_at": e.fetched_at, "ttl": ttl}), encoding="utf-8"
            )
        except Exception:
            pass
        return e


_caches: dict[str, TTLCache] = {}


def cache(name: str) -> TTLCache:
    if name not in _caches:
        _caches[name] = TTLCache(name)
    return _caches[name]


def seed_replay_from_repo() -> int:
    """Copy the committed seed recordings (data/replay-seed) into data/replay when the latter is empty.

    The seed is what makes a fresh clone demo-ready offline with TSUKUYOMI_REPLAY_MODE=first.
    """
    import shutil

    src = settings.data_path / "replay-seed"
    dst = settings.data_path / "replay"
    dst.mkdir(parents=True, exist_ok=True)
    if not src.exists() or any(dst.glob("*.json")):
        return 0
    n = 0
    for p in src.glob("*.json"):
        shutil.copy2(p, dst / p.name)
        n += 1
    return n


def replay_get(key: str) -> Any | None:
    p = settings.data_path / "replay" / (TTLCache._hash(key) + ".json")
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))["value"]
        except Exception:
            return None
    return None


def replay_record(key: str, value: Any) -> None:
    """Record a real response for demo replay. Called for every successful provider call, cheap and append-only."""
    d = settings.data_path / "replay"
    d.mkdir(parents=True, exist_ok=True)
    try:
        (d / (TTLCache._hash(key) + ".json")).write_text(json.dumps({"key": key, "value": value}), encoding="utf-8")
    except Exception:
        pass
