"""The in-process rate limiter: counting, blocking and its memory bound."""

from __future__ import annotations

from types import SimpleNamespace

from app.core import rate_limit
from app.core.rate_limit import RateLimiter


def test_hits_are_allowed_up_to_the_limit():
    limiter = RateLimiter(limit=2, window_seconds=3600)

    assert limiter.check("a") is None
    assert limiter.check("a") is None


def test_the_next_hit_after_the_limit_is_refused_with_a_wait():
    limiter = RateLimiter(limit=2, window_seconds=3600)
    limiter.check("a")
    limiter.check("a")

    retry_after = limiter.check("a")

    assert retry_after is not None
    assert retry_after >= 1


def test_keys_are_counted_independently():
    limiter = RateLimiter(limit=1, window_seconds=3600)

    assert limiter.check("a") is None
    assert limiter.check("b") is None
    assert limiter.check("a") is not None


def test_resetting_one_key_leaves_the_others():
    limiter = RateLimiter(limit=1, window_seconds=3600)
    limiter.check("a")
    limiter.check("b")

    limiter.reset("a")

    assert limiter.check("a") is None
    assert limiter.check("b") is not None


def test_resetting_everything_clears_all_keys():
    limiter = RateLimiter(limit=1, window_seconds=3600)
    limiter.check("a")
    limiter.check("b")

    limiter.reset()

    assert limiter._hits == {}


def test_the_number_of_tracked_keys_stays_bounded():
    limiter = RateLimiter(limit=5, window_seconds=3600, max_keys=10)

    for index in range(500):
        limiter.check(f"key-{index}")

    # Eviction runs when the map grows past the cap, so it settles one over.
    assert len(limiter._hits) <= limiter.max_keys + 1


def test_expired_windows_are_dropped_before_fresh_ones(monkeypatch):
    clock = {"now": 1000.0}
    monkeypatch.setattr(rate_limit, "time", SimpleNamespace(monotonic=lambda: clock["now"]))
    limiter = RateLimiter(limit=5, window_seconds=10, max_keys=10)
    for index in range(25):
        limiter.check(f"old-{index}")

    clock["now"] += 11  # every previous window has expired
    limiter.check("fresh-1")
    limiter.check("fresh-2")

    assert set(limiter._hits) == {"fresh-1", "fresh-2"}
