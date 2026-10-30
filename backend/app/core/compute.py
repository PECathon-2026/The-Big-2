"""Run CPU-bound work off the event loop.

astronomy-engine and the Night Honor model are pure Python and take tens of milliseconds to seconds per call.
Called directly inside an `async def` handler they block the single event loop, so one slow request makes every
other request (even /api/health) wait. `in_thread` hands such work to the default worker pool instead; the GIL still
limits total throughput, but the loop stays free to answer cheap requests and to keep connections alive.
"""
from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import ParamSpec, TypeVar

P = ParamSpec("P")
R = TypeVar("R")


async def in_thread(fn: Callable[P, R], /, *args: P.args, **kwargs: P.kwargs) -> R:
    """Await a synchronous, CPU-bound function without blocking the event loop."""
    return await asyncio.to_thread(fn, *args, **kwargs)
