"""In-memory limiter for failed sign-in attempts (per client address + e-mail).

Suitable for a single backend instance (e.g. one Render free instance). Running several
instances would need a shared store such as Redis."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from app.core.config import get_settings

_failures: dict[tuple[str, str], deque[float]] = defaultdict(deque)
_lock = threading.Lock()


def _prune(q: deque[float], window: float, now: float) -> None:
    while q and now - q[0] > window:
        q.popleft()


def retry_after(client: str, email: str) -> int:
    """Seconds until another attempt is allowed (0 = allowed now)."""
    s = get_settings()
    window = s.LOGIN_WINDOW_MINUTES * 60
    now = time.monotonic()
    with _lock:
        q = _failures.get((client, email.lower()))
        if not q:
            return 0
        _prune(q, window, now)
        if len(q) < s.LOGIN_MAX_FAILURES:
            return 0
        return max(1, int(window - (now - q[0])))


def record_failure(client: str, email: str) -> None:
    with _lock:
        _failures[(client, email.lower())].append(time.monotonic())


def reset(client: str, email: str) -> None:
    with _lock:
        _failures.pop((client, email.lower()), None)


def clear_all() -> None:
    with _lock:
        _failures.clear()
