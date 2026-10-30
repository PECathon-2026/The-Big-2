"""Request guards for a public demo server: per-client rate limits, request-size limits and a few safe headers.

Pure ASGI (no extra dependency, no response buffering). Limits are token buckets keyed by client IP and tier:
a generous general tier, because a whole venue can sit behind one NAT address and a single page load fans out
into ~10 API calls (plus Lens polling), and tight tiers for the endpoints that cost real CPU or write state.
A refused request gets a JSON 429 with Retry-After, shaped like the API's other errors so the frontend shows it.
"""
from __future__ import annotations

import json
import logging
import math
import re
import time
from dataclasses import dataclass

from .config import settings

log = logging.getLogger("tsukuyomi")

@dataclass(frozen=True)
class Tier:
    name: str
    burst: float  # bucket size
    per_s: float  # refill rate


GENERAL = Tier("general", burst=400, per_s=8.0)
HEAVY = Tier("heavy", burst=40, per_s=0.5)  # CPU-bound reads and slow upstream fan-outs
WRITE = Tier("write", burst=30, per_s=0.5)  # ledger, alerts
UPLOAD = Tier("upload", burst=8, per_s=0.1)  # new Lens jobs: one every 10 s after the burst
COMPUTE = Tier("compute", burst=5, per_s=1 / 15)  # benchmarks, plate solves, image subtraction

# (method or "*", path regex, tier); first match wins.
RULES: list[tuple[str, re.Pattern[str], Tier]] = [
    ("POST", re.compile(r"^/api/lens/jobs/?$"), UPLOAD),
    ("POST", re.compile(r"^/api/lens/jobs/[^/]+/(benchmark|solve)$"), COMPUTE),
    ("POST", re.compile(r"^/api/transients/"), COMPUTE),
    ("POST", re.compile(r"^/api/(planner|horizon)/"), HEAVY),
    ("POST", re.compile(r"^/api/(honor|alerts)/"), WRITE),
    ("DELETE", re.compile(r"^/api/(honor|alerts)/"), WRITE),
    ("GET", re.compile(r"^/api/(scroll/(events|eclipses|calendar|launches)|watchtower/spots|horizon/|planner/|spectra/|transients/(near|field))"), HEAVY),
]
EXEMPT = re.compile(r"^/api/health$")

MAX_UPLOAD_BYTES = 61 * 1024 * 1024  # the Lens router enforces its own 60 MB on the file itself
MAX_BODY_BYTES = 256 * 1024
UPLOAD_PATHS = re.compile(r"^/api/lens/jobs/?$")

SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"no-referrer"),
    (b"x-frame-options", b"DENY"),
]


def tier_for(method: str, path: str) -> Tier | None:
    if method == "OPTIONS" or EXEMPT.match(path) or not path.startswith("/api/"):
        return None
    for m, rx, tier in RULES:
        if (m == "*" or m == method) and rx.match(path):
            return tier
    return GENERAL


def client_ip(scope: dict) -> str:
    """The address the nearest proxy saw. Behind Cloudflare / a PaaS router every request arrives from the proxy,
    so its forwarding header is the only way to tell users apart; the right-most X-Forwarded-For entry is the one
    that proxy appended (left-most entries are whatever the client claimed)."""
    headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers") or []}
    if settings.trust_proxy_headers:
        cf = headers.get("cf-connecting-ip", "").strip()
        if cf:
            return cf
        xff = [p.strip() for p in headers.get("x-forwarded-for", "").split(",") if p.strip()]
        if xff:
            return xff[-1]
    client = scope.get("client")
    return client[0] if client else "unknown"


class _Buckets:
    def __init__(self) -> None:
        self._b: dict[tuple[str, str], tuple[float, float]] = {}  # key -> (tokens, last refill time)
        self._last_sweep = time.monotonic()

    def take(self, key: tuple[str, str], tier: Tier) -> float:
        """Spend one token. Returns 0 when allowed, else the seconds until one is available."""
        now = time.monotonic()
        tokens, last = self._b.get(key, (tier.burst, now))
        tokens = min(tier.burst, tokens + (now - last) * tier.per_s)
        if tokens >= 1:
            self._b[key] = (tokens - 1, now)
            wait = 0.0
        else:
            self._b[key] = (tokens, now)
            wait = (1 - tokens) / tier.per_s
        if now - self._last_sweep > 300:  # forget clients whose buckets have long been full again
            self._last_sweep = now
            self._b = {k: v for k, v in self._b.items() if now - v[1] < 600}
        return wait

    def clear(self) -> None:
        self._b.clear()


buckets = _Buckets()


async def _send_json(send, status: int, body: dict, extra: list[tuple[bytes, bytes]] | None = None) -> None:
    raw = json.dumps(body).encode()
    headers = [(b"content-type", b"application/json"), (b"content-length", str(len(raw)).encode()), *SECURITY_HEADERS, *(extra or [])]
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": raw})


class GuardMiddleware:
    """Mount inside CORSMiddleware, so refusals still carry CORS headers and the browser can read them."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        method, path = scope["method"], scope["path"]

        if method in ("POST", "PUT", "PATCH"):
            length = next((v for k, v in scope.get("headers") or [] if k.lower() == b"content-length"), None)
            limit = MAX_UPLOAD_BYTES if UPLOAD_PATHS.match(path) else MAX_BODY_BYTES
            if length is not None:
                try:
                    n = int(length)
                except ValueError:
                    return await _send_json(send, 400, {"error": "bad_request", "detail": "invalid Content-Length"})
                if n > limit:
                    return await _send_json(send, 413, {"error": "too_large", "detail": f"request body over {limit // 1024} KB"})
            else:
                receive = _capped(receive, limit)

        tier = tier_for(method, path) if settings.rate_limit else None
        if tier is not None:
            wait = buckets.take((client_ip(scope), tier.name), tier)
            if wait > 0:
                secs = max(1, math.ceil(wait))
                return await _send_json(
                    send, 429,
                    {"error": "rate_limited", "detail": f"Too many requests. Please wait {secs} s and try again.", "retry_after": secs},
                    [(b"retry-after", str(secs).encode())],
                )

        started = False

        async def send_with_headers(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
                message = {**message, "headers": [*message.get("headers", []), *SECURITY_HEADERS]}
            await send(message)

        try:
            await self.app(scope, receive, send_with_headers)
        except BodyTooLarge as e:
            if started:
                raise
            await _send_json(send, 413, {"error": "too_large", "detail": str(e)})
        except Exception:
            # Never leak a traceback or library internals; the server log keeps the details. Handled here, inside
            # CORS, so the page can read the error instead of seeing a CORS failure.
            log.exception("unhandled error on %s %s", method, path)
            if started:
                raise
            await _send_json(send, 500, {"error": "internal_error", "detail": "Something went wrong on our side. Please try again."})


class BodyTooLarge(Exception):
    pass


def _capped(receive, limit: int):
    """A chunked body without Content-Length: stop reading past the limit."""
    seen = 0

    async def wrapped():
        nonlocal seen
        msg = await receive()
        if msg["type"] == "http.request":
            seen += len(msg.get("body", b""))
            if seen > limit:
                raise BodyTooLarge(f"request body over {limit // 1024} KB")
        return msg

    return wrapped
