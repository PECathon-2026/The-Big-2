"""Replay modes of core.http.fetch: 'first' serves a recording without touching the network; 'off' never does."""
from __future__ import annotations

import asyncio

import pytest

from app.core import http as corehttp
from app.core.cache import replay_record
from app.core.config import settings


URL = "https://provider.invalid/never-resolves"


def _key(url: str) -> str:
    return f"GET {url} [] []"


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", str(tmp_path))
    monkeypatch.setattr(settings, "http_timeout_s", 2.0)
    corehttp._client = None
    yield
    corehttp._client = None


def test_first_mode_serves_recording_without_network(monkeypatch):
    replay_record(_key(URL), {"hello": "recorded"})
    monkeypatch.setattr(settings, "replay_mode", "first")
    f = asyncio.run(corehttp.fetch("test-provider", URL, ttl=10, retries=0))
    assert f.data == {"hello": "recorded"}
    assert f.provenance.source == "replay" and "first" in (f.provenance.note or "")


def test_fallback_mode_uses_recording_only_after_failure(monkeypatch):
    replay_record(_key(URL), {"hello": "fallback"})
    monkeypatch.setattr(settings, "replay_mode", "fallback")
    f = asyncio.run(corehttp.fetch("test-provider", URL, ttl=10, retries=0))
    assert f.data == {"hello": "fallback"} and f.provenance.source == "replay"


def test_off_mode_raises_when_provider_is_unreachable(monkeypatch):
    replay_record(_key(URL), {"hello": "ignored"})
    monkeypatch.setattr(settings, "replay_mode", "off")
    with pytest.raises(corehttp.ProviderError):
        asyncio.run(corehttp.fetch("test-provider", URL, ttl=10, retries=0))


def test_effective_mode_honours_legacy_flag(monkeypatch):
    monkeypatch.setattr(settings, "replay_mode", "off")
    monkeypatch.setattr(settings, "demo_replay", True)
    assert settings.effective_replay_mode == "fallback"
    monkeypatch.setattr(settings, "replay_mode", "nonsense")
    monkeypatch.setattr(settings, "demo_replay", False)
    assert settings.effective_replay_mode == "off"
