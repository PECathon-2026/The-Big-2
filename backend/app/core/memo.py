"""A small in-memory TTL memo for expensive pure computations.

The lunar calendar, the eclipse search, the satellite pass scan and the events feed each cost hundreds of
milliseconds of CPU and depend only on their inputs (place, time window, options). During a demo the same place is
asked for again and again, from several tabs and components at once, so remembering the last answers for a few
minutes turns most of that CPU into a dictionary lookup. Keys are built by the caller, which is where rounding
decisions belong (a 0.01° move does not change tonight's ISS passes).
"""
from __future__ import annotations

import functools
import threading
import time
from collections import OrderedDict
from collections.abc import Callable, Hashable
from typing import Any


class TTLMemo:
    def __init__(self, ttl_s: float, maxsize: int = 256):
        self.ttl_s = ttl_s
        self.maxsize = maxsize
        self._data: OrderedDict[Hashable, tuple[float, Any]] = OrderedDict()
        self._lock = threading.Lock()  # entries are read and written from worker threads and from the event loop

    def get(self, key: Hashable) -> tuple[bool, Any]:
        with self._lock:
            hit = self._data.get(key)
            if hit is None:
                return False, None
            expires, value = hit
            if expires < time.monotonic():
                del self._data[key]
                return False, None
            self._data.move_to_end(key)
            return True, value

    def set(self, key: Hashable, value: Any) -> None:
        with self._lock:
            self._data[key] = (time.monotonic() + self.ttl_s, value)
            self._data.move_to_end(key)
            while len(self._data) > self.maxsize:
                self._data.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


_ALL: list[TTLMemo] = []


def clear_all() -> None:
    """Forget every memoised answer (tests)."""
    for m in _ALL:
        m.clear()


def memoize(ttl_s: float, key: Callable[..., Hashable], maxsize: int = 256):
    """Memoise a synchronous function on `key(*args, **kwargs)` for `ttl_s` seconds."""

    def deco(fn):
        memo = TTLMemo(ttl_s, maxsize)
        _ALL.append(memo)

        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            k = key(*args, **kwargs)
            hit, value = memo.get(k)
            if hit:
                return value
            value = fn(*args, **kwargs)
            memo.set(k, value)
            return value

        wrapper.memo = memo  # type: ignore[attr-defined]
        return wrapper

    return deco


def memoize_async(ttl_s: float, key: Callable[..., Hashable], maxsize: int = 256):
    """The same for a coroutine function."""

    def deco(fn):
        memo = TTLMemo(ttl_s, maxsize)
        _ALL.append(memo)

        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            k = key(*args, **kwargs)
            hit, value = memo.get(k)
            if hit:
                return value
            value = await fn(*args, **kwargs)
            memo.set(k, value)
            return value

        wrapper.memo = memo  # type: ignore[attr-defined]
        return wrapper

    return deco


def floor_time(dt, seconds: int) -> float:
    """A datetime floored to a bucket of `seconds`, as a POSIX timestamp (hashable, timezone-safe)."""
    ts = dt.timestamp()
    return ts - ts % seconds
