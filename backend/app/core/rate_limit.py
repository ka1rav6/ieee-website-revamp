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
    """Allows `limit` hits per `window_seconds` for each key.

    Counts live in this process only, so several workers or replicas would each
    keep their own and a shared store (Redis) would be needed for a truly global
    limit. The single-container deployment this site uses does not need that;
    the map is capped so a flood of distinct keys cannot grow it without bound.
    """

    limit: int
    window_seconds: int
    max_keys: int = 4096
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
        """Keep the map bounded.

        Drops expired windows first, then - if it is still over the cap - the
        entries closest to expiry. This is best-effort abuse protection, not an
        audit log, so losing the oldest counters under a flood is acceptable.
        """
        if len(self._hits) <= self.max_keys:
            return
        for key in [k for k, w in self._hits.items() if w.reset_at <= now]:
            del self._hits[key]
        overflow = len(self._hits) - self.max_keys
        if overflow > 0:
            oldest = sorted(self._hits, key=lambda candidate: self._hits[candidate].reset_at)
            for key in oldest[:overflow]:
                del self._hits[key]
