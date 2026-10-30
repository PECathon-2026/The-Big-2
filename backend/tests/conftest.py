"""Shared test fixtures."""
from __future__ import annotations

import pytest

from app.core import memo, security
from app.core.config import settings

# Property and soak tests fire hundreds of requests from one client; tests/test_security.py turns limits back on.
settings.rate_limit = False


@pytest.fixture(autouse=True)
def forget_memoised_answers():
    """Computed answers (calendar, eclipses, pass scans, events) are memoised for minutes; tests must not see each
    other's. Rate-limit buckets likewise start full for every test."""
    memo.clear_all()
    security.buckets.clear()
    yield
    memo.clear_all()
