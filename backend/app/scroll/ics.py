"""Minimal iCalendar generation so any event can be added to a phone calendar."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone


def _fmt(d: datetime) -> str:
    return d.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def make_ics(title: str, start: datetime, end: datetime | None, description: str = "", location: str = "", alarm_minutes: int = 30) -> str:
    end = end or (start + timedelta(minutes=30))
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Tsukuyomi Watch//EN",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        f"UID:{uuid.uuid4()}@tsukuyomi",
        f"DTSTAMP:{_fmt(datetime.now(timezone.utc))}",
        f"DTSTART:{_fmt(start)}",
        f"DTEND:{_fmt(end)}",
        f"SUMMARY:{_esc(title)}",
    ]
    if description:
        lines.append(f"DESCRIPTION:{_esc(description)}")
    if location:
        lines.append(f"LOCATION:{_esc(location)}")
    lines += [
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        f"DESCRIPTION:{_esc(title)}",
        f"TRIGGER:-PT{alarm_minutes}M",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(lines) + "\r\n"
