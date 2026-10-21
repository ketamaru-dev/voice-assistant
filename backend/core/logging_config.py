"""Настройка логирования: единый формат, уровень берётся из настроек."""
from __future__ import annotations

import logging

LOG_FORMAT = "%(asctime)s %(levelname)s [%(name)s] %(message)s"


def setup_logging(level: str = "INFO") -> None:
    """Настраивает корневой логгер приложения (вывод в stderr, который собирают uvicorn/systemd/docker)."""
    logging.basicConfig(level=getattr(logging, level.upper(), logging.INFO), format=LOG_FORMAT, force=True)
    # Библиотеки HTTP слишком многословны на INFO и могут печатать URL с параметрами
    for noisy in ("httpx", "httpcore", "aiohttp"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
