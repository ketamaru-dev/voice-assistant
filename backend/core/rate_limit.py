"""Ограничение частоты запросов (скользящее окно, в памяти процесса) для защиты токенов внешних API."""
from __future__ import annotations

import time
from collections import defaultdict, deque


class SlidingWindowRateLimiter:
    """Разрешает не более limit запросов за window секунд для каждого ключа (например, IP-адреса)."""

    def __init__(self, limit: int, window_seconds: int = 60) -> None:
        """Сохраняет параметры лимита; limit <= 0 отключает ограничение."""
        self._limit = limit
        self._window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        """Возвращает True и регистрирует запрос, если лимит для ключа не исчерпан."""
        if self._limit <= 0:
            return True
        now = time.monotonic()
        hits = self._hits[key]
        # Выбрасываем отметки, вышедшие за пределы окна
        while hits and now - hits[0] > self._window:
            hits.popleft()
        if len(hits) >= self._limit:
            return False
        hits.append(now)
        # Не копим пустые очереди для давно ушедших клиентов
        if len(self._hits) > 10_000:
            self._prune(now)
        return True

    def _prune(self, now: float) -> None:
        """Удаляет ключи, у которых не осталось актуальных отметок."""
        for key in [k for k, v in self._hits.items() if not v or now - v[-1] > self._window]:
            del self._hits[key]
