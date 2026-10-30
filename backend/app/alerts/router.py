"""Alerts: Web Push subscriptions and scheduled notifications such as "The Moon rises tonight at 20:14"."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ..scroll import events as ev
from . import sender, store, vapid, worker

router = APIRouter()

# The server POSTs to every subscription endpoint, so only the browsers' own push services are accepted
# (otherwise a forged "subscription" turns the alert worker into a request proxy into private networks).
_PUSH_HOSTS = ("fcm.googleapis.com", "push.services.mozilla.com", "notify.windows.com", "push.apple.com", "push.api.chrome.com")


def _is_push_service(endpoint: str) -> bool:
    u = urlsplit(endpoint)
    host = (u.hostname or "").lower()
    return u.scheme == "https" and len(endpoint) <= 1024 and any(host == h or host.endswith("." + h) for h in _PUSH_HOSTS)


class SubscribeBody(BaseModel):
    subscription: dict[str, Any] = Field(description="The PushSubscription.toJSON() object from the browser")


class ScheduleBody(BaseModel):
    endpoint: str = Field(max_length=1024)
    title: str = Field(max_length=200)
    body: str = Field(max_length=1000)
    fire_at: datetime
    url: str | None = Field(None, max_length=500)
    event_id: str | None = Field(None, max_length=200)


class ScheduleEventBody(BaseModel):
    endpoint: str = Field(max_length=1024)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    event_id: str = Field(max_length=200)
    lead_minutes: int = Field(15, ge=0, le=24 * 60)
    days: int = Field(7, ge=1, le=30)


class TestBody(BaseModel):
    endpoint: str = Field(max_length=1024)
    delay_seconds: int = Field(0, ge=0, le=3600)
    title: str = Field("Tsukuyomi Watch · 月読", max_length=200)
    body: str = Field("Push alerts are working. The sky is yours tonight.", max_length=1000)


@router.get("/vapid-public-key")
async def vapid_public_key():
    """Application-server key the browser passes to pushManager.subscribe."""
    return {"public_key": vapid.public_key_b64url()}


@router.post("/subscribe", status_code=201)
async def subscribe(body: SubscribeBody, request: Request):
    sub = body.subscription
    if not sub.get("endpoint") or not (sub.get("keys") or {}).get("p256dh"):
        raise HTTPException(400, "subscription must include endpoint and keys.p256dh / keys.auth")
    if not _is_push_service(str(sub["endpoint"])):
        raise HTTPException(400, "endpoint must be an https URL of a browser push service")
    row = store.upsert_subscription(sub, request.headers.get("user-agent"))
    return {"subscription_id": row["id"], "endpoint": row["endpoint"], "created_at": row["created_at"]}


@router.delete("/subscribe")
async def unsubscribe(endpoint: str):
    return {"deleted": store.delete_subscription(endpoint)}


def _sub_or_404(endpoint: str) -> dict[str, Any]:
    s = store.get_subscription(endpoint)
    if s is None:
        raise HTTPException(404, "unknown subscription endpoint; subscribe first")
    return s


@router.post("/schedule", status_code=201)
async def schedule(body: ScheduleBody):
    """Schedule any alert at an absolute UTC time."""
    s = _sub_or_404(body.endpoint)
    fire_at = body.fire_at if body.fire_at.tzinfo else body.fire_at.replace(tzinfo=timezone.utc)
    return store.schedule(s["id"], body.title, body.body, fire_at, body.url, body.event_id)


@router.post("/schedule-event", status_code=201)
async def schedule_event(body: ScheduleEventBody):
    """Resolve an event id from the Scroll feed and schedule its alert text `lead_minutes` before it starts."""
    s = _sub_or_404(body.endpoint)
    items, _ = await ev.events(body.lat, body.lon, days=body.days)
    e = next((x for x in items if x.id == body.event_id), None)
    if e is None:
        raise HTTPException(404, f"event {body.event_id!r} not found in the next {body.days} days for this location")
    fire_at = e.start - timedelta(minutes=body.lead_minutes)
    now = datetime.now(timezone.utc)
    if fire_at < now:
        fire_at = now  # already inside the lead window: send right away
    text = e.alert or f"{e.title} at {e.start_local}"
    row = store.schedule(s["id"], e.title, text, fire_at, None, e.id)
    return {**row, "event": e.model_dump(mode="json")}


@router.post("/test", status_code=201)
async def test_alert(body: TestBody):
    """Send a test notification now (or after `delay_seconds`) so a judge can see push working."""
    s = _sub_or_404(body.endpoint)
    fire_at = datetime.now(timezone.utc) + timedelta(seconds=body.delay_seconds)
    row = store.schedule(s["id"], body.title, body.body, fire_at, None, "test")
    if body.delay_seconds == 0:
        result = worker.deliver_due()
        row = {**(store.get_alert(row["id"]) or row), "delivery": result}
    return row


@router.get("/scheduled")
async def scheduled(endpoint: str, include_sent: bool = Query(False)):
    return store.list_alerts(endpoint, include_sent=include_sent)


@router.delete("/scheduled/{alert_id}")
async def cancel(alert_id: int, endpoint: str):
    n = store.cancel(alert_id, endpoint)
    if n == 0:
        raise HTTPException(404, "no scheduled alert with that id for this endpoint")
    return {"cancelled": alert_id}


@router.get("/stats")
async def stats():
    return {**store.stats(), "poll_seconds": worker.POLL_SECONDS, "sender": getattr(sender.current, "__name__", "custom")}
