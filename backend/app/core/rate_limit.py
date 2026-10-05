"""In-process rate limiting for the few endpoints that need it.

Deliberately simple: a fixed window counter in memory, enough to blunt
credential stuffing and form spam on a single-container deployment. If the
site is ever scaled to multiple replicas this needs to move to Redis, since
each process would otherwise keep its own counts.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field


@dataclass
class _Window:
    count: int = 0
    reset_at: float = 0.0


@dataclass
class RateLimiter:
    """Allows `limit` hits per `window_seconds` for each key."""

    limit: int
    window_seconds: int
    _hits: dict[str, _Window] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def check(self, key: str) -> int | None:
        """Record a hit. Returns None when allowed, else seconds to wait."""
        now = time.monotonic()
        with self._lock:
            self._evict(now)
            window = self._hits.get(key)
            if window is None or window.reset_at <= now:
                self._hits[key] = _Window(count=1, reset_at=now + self.window_seconds)
                return None
            if window.count >= self.limit:
                return max(1, int(window.reset_at - now))
            window.count += 1
            return None

    def reset(self, key: str | None = None) -> None:
        with self._lock:
            if key is None:
                self._hits.clear()
            else:
                self._hits.pop(key, None)

    def _evict(self, now: float) -> None:
        """Drop expired windows so the dict cannot grow without bound."""
        if len(self._hits) < 1024:
            return
        for key in [k for k, w in self._hits.items() if w.reset_at <= now]:
            del self._hits[key]
