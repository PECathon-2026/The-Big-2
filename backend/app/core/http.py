"""Provider adapter base: one function to fetch JSON (or bytes) with caching, stale fallback and demo replay."""
from __future__ import annotations

import asyncio
import base64
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

import httpx

from .cache import cache, replay_get, replay_record
from .config import settings
from .envelope import Provenance


class ProviderError(Exception):
    def __init__(self, source: str, message: str):
        super().__init__(f"{source}: {message}")
        self.source = source
        self.message = message


@dataclass
class Fetched:
    data: Any
    provenance: Provenance


_client: httpx.AsyncClient | None = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=settings.http_timeout_s,
            headers={"User-Agent": settings.user_agent, "Accept": "application/json, */*"},
            follow_redirects=True,
        )
    return _client


async def fetch(
    source: str,
    url: str,
    *,
    params: dict[str, Any] | None = None,
    ttl: float = 900,
    method: str = "GET",
    data: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    binary: bool = False,
    cache_name: str | None = None,
    retries: int = 2,
    timeout: float | None = None,
    validate: Callable[[Any], bool] | None = None,
) -> Fetched:
    """Fetch with cache. Order: fresh cache → live call (retries) → stale cache → demo replay → ProviderError.

    `validate` receives the decoded payload (parsed JSON, or raw bytes when `binary`) and says whether it is usable.
    A 200 that fails it is treated exactly like a failed call: not cached, not recorded, retried, then stale cache,
    replay, ProviderError. The same check guards everything served from the cache or a recording, so a bad file on
    disk is dropped rather than served.
    """
    c = cache(cache_name or source)
    key = f"{method} {url} {sorted((params or {}).items())} {sorted((data or {}).items())}"
    mode = settings.effective_replay_mode

    def usable(stored: Any) -> bool:
        if validate is None:
            return True
        try:
            return bool(validate(_decode(stored, binary)))
        except Exception:  # noqa: BLE001 - a validator that chokes on the payload has answered the question
            return False

    if mode == "first":  # demo mode: a recording wins over the network, so the demo is fast and deterministic
        rep = replay_get(key)
        if rep is not None and usable(rep):
            return Fetched(_decode(rep, binary), Provenance(source="replay", url=url, note=f"recorded response for {source} (replay mode: first)"))
    entry = c.get(key)
    if entry is not None and not usable(entry.value):
        c.delete(key)  # a poisoned or corrupted entry must not outlive this request
        entry = None
    if entry is not None and entry.fresh:
        return Fetched(_decode(entry.value, binary), Provenance(source=source, url=url, fetched_at=entry.fetched_dt, cached=True))

    last_err: Exception | None = None
    for attempt in range(retries + 1):
        try:
            kw = {"timeout": timeout} if timeout else {}
            if method == "GET":
                r = await client().get(url, params=params, headers=headers, **kw)
            else:
                r = await client().post(url, params=params, data=data, headers=headers, **kw)
            if r.status_code == 429:
                if attempt < retries:  # rate limited: wait longer before trying again
                    await asyncio.sleep(2.0 * (attempt + 1))
                raise ProviderError(source, "HTTP 429")
            if r.status_code >= 500:
                raise ProviderError(source, f"HTTP {r.status_code}")
            r.raise_for_status()
            value = base64.b64encode(r.content).decode("ascii") if binary else r.json()
            if not usable(value):
                raise ProviderError(source, "HTTP 200 but the payload failed validation (error page, partial or empty reply); not cached")
            c.set(key, value, ttl)
            replay_record(key, value)
            return Fetched(_decode(value, binary), Provenance(source=source, url=url, fetched_at=datetime.now(timezone.utc)))
        except Exception as e:  # noqa: BLE001
            last_err = e if str(e) else RuntimeError(type(e).__name__)
            if attempt < retries:
                await asyncio.sleep(0.6 * (attempt + 1))

    if entry is not None:
        return Fetched(
            _decode(entry.value, binary),
            Provenance(source=source, url=url, fetched_at=entry.fetched_dt, stale=True, cached=True, note=f"upstream failed: {last_err}"),
        )
    if mode in ("fallback", "first"):
        rep = replay_get(key)
        if rep is not None and usable(rep):
            return Fetched(_decode(rep, binary), Provenance(source="replay", url=url, note=f"recorded response for {source}; upstream failed: {last_err}"))
    raise ProviderError(source, str(last_err))


def _decode(value: Any, binary: bool) -> Any:
    return base64.b64decode(value) if binary else value
