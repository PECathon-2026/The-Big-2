"""VAPID application-server keys for Web Push, generated once and kept in data/vapid/."""
from __future__ import annotations

import base64
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid

from ..core.config import settings


def key_dir() -> Path:
    d = settings.data_path / "vapid"
    d.mkdir(parents=True, exist_ok=True)
    return d


def private_key_path() -> Path:
    return key_dir() / "private_key.pem"


def load_or_create() -> Vapid:
    p = private_key_path()
    if p.exists():
        return Vapid.from_file(str(p))
    v = Vapid()
    v.generate_keys()
    v.save_key(str(p))
    return v


def public_key_b64url() -> str:
    """The uncompressed P-256 point, base64url without padding: what `pushManager.subscribe` expects."""
    v = load_or_create()
    raw = v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
