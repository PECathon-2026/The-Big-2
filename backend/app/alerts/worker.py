"""Background delivery loop: every POLL_SECONDS, send the alerts whose time has come."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from . import sender, store

log = logging.getLogger("tsukuyomi.alerts")
POLL_SECONDS = 30


def deliver_due(now: datetime | None = None) -> dict[str, int]:
    """Synchronous one-shot delivery; the worker calls it in a thread, tests call it directly."""
    sent = failed = gone = 0
    for a in store.due(now):
        payload = {"title": a["title"], "body": a["body"], "url": a.get("url"), "event_id": a.get("event_id"), "alert_id": a["id"]}
        try:
            sender.current(a["subscription"], payload)
            store.mark(a["id"], "sent")
            sent += 1
        except sender.PushGone as e:
            store.mark(a["id"], "failed", f"subscription gone: {e}")
            store.delete_subscription(a["endpoint"])
            gone += 1
        except Exception as e:  # noqa: BLE001
            store.mark(a["id"], "failed", str(e)[:500])
            failed += 1
            log.warning("push failed for alert %s: %s", a["id"], e)
    return {"sent": sent, "failed": failed, "gone": gone}


async def run_forever() -> None:
    while True:
        try:
            await asyncio.to_thread(deliver_due)
        except Exception as e:  # noqa: BLE001
            log.warning("alert worker tick failed: %s", e)
        await asyncio.sleep(POLL_SECONDS)
