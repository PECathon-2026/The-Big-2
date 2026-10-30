"""Shared test fixtures."""
from __future__ import annotations

import pytest

from app.core import memo


@pytest.fixture(autouse=True)
def forget_memoised_answers():
    """Computed answers (calendar, eclipses, pass scans, events) are memoised for minutes; tests must not see each
    other's."""
    memo.clear_all()
    yield
    memo.clear_all()
