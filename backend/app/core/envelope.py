"""Provenance and trace objects. Every response says where its data came from and how it was computed."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class Provenance(BaseModel):
    """Where one piece of upstream data came from."""

    source: str = Field(description="Provider id, e.g. 'open-meteo', 'celestrak', 'replay', 'computed'")
    url: str | None = None
    fetched_at: datetime | None = None
    stale: bool = Field(False, description="True when served from an expired cache because the upstream failed")
    cached: bool = Field(False, description="True when served from a fresh cache instead of a live call")
    note: str | None = None


class Contribution(BaseModel):
    """One factor of an explainable score."""

    factor: str
    label: str
    value: float | None = Field(None, description="Raw input value (e.g. 35 for 35% low cloud)")
    unit: str | None = None
    quality: float | None = Field(None, description="0..1, 1 = perfect for stargazing")
    weight: float
    contribution: float = Field(description="Points this factor added to the score (weight x quality x 100)")
    penalty: float = Field(description="Points lost to this factor (weight x (1 - quality) x 100)")
    note: str | None = None


class Trace(BaseModel):
    """The explanation behind a computed number. Drives the ⓘ popovers and the breakdown chart."""

    formula: str
    inputs: dict[str, Any] = Field(default_factory=dict)
    contributions: list[Contribution] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class Envelope(BaseModel, Generic[T]):
    data: T
    provenance: list[Provenance] = Field(default_factory=list)
    computed_at: datetime = Field(default_factory=now_utc)
