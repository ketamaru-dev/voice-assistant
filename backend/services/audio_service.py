"""Сервис выдачи и очистки аудиофайлов озвучки."""
from __future__ import annotations

import logging

from fastapi.concurrency import run_in_threadpool

from ..repositories.audio_repository import AudioRepository

logger = logging.getLogger(__name__)


class AudioService:
    """Отдаёт аудио клиенту (одноразово) и убирает устаревшие файлы."""

    def __init__(self, audio: AudioRepository) -> None:
        """Принимает репозиторий файлового хранилища."""
        self._audio = audio

    async def get_audio(self, name: str) -> bytes:
        """Возвращает содержимое файла озвучки (чтение выполняется в потоке, чтобы не блокировать event loop)."""
        return await run_in_threadpool(self._audio.read, name)

    def delete(self, name: str) -> None:
        """Удаляет файл после выдачи клиенту (вызывается как фоновая задача)."""
        self._audio.delete(name)

    async def cleanup_expired(self, ttl_seconds: int) -> int:
        """Удаляет файлы, которые никто не забрал за ttl_seconds, и пишет число удалённых в лог."""
        removed = await run_in_threadpool(self._audio.delete_expired, ttl_seconds)
        if removed:
            logger.info("Удалено устаревших аудиофайлов: %d", removed)
        return removed
