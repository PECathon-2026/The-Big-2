"""Sends one Web Push message. Kept tiny and injectable so tests can replace it."""
from __future__ import annotations

import json
from typing import Any, Callable

from pywebpush import WebPushException, webpush

from . import vapid

CLAIMS = {"sub": "mailto:tsukuyomi-watch@example.com"}


class PushGone(Exception):
    """The push service says this subscription no longer exists (404/410)."""


def send(subscription: dict[str, Any], payload: dict[str, Any], ttl: int = 3600) -> None:
    try:
        webpush(
            subscription_info=subscription,
            data=json.dumps(payload),
            vapid_private_key=str(vapid.private_key_path()),
            vapid_claims=dict(CLAIMS),
            ttl=ttl,
        )
    except WebPushException as e:
        status = getattr(getattr(e, "response", None), "status_code", None)
        if status in (404, 410):
            raise PushGone(str(e)) from e
        raise


# The worker and the router call through this so tests can swap the sender.
Sender = Callable[[dict[str, Any], dict[str, Any]], None]
current: Sender = send
