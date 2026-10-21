"""Хранилище временных MP3-файлов с озвучкой: создание, безопасное чтение, удаление, очистка устаревших."""
from __future__ import annotations

import logging
import os
import re
import tempfile
import time
from pathlib import Path

from ..core.exceptions import AudioNotFoundError, AudioTooLargeError

logger = logging.getLogger(__name__)

AUDIO_PREFIX = "voice_"
# Допустимое имя: префикс, буквы/цифры/_/-, расширение .mp3 (никаких слэшей и точек)
_NAME_RE = re.compile(r"^voice_[A-Za-z0-9_-]+\.mp3$")


class AudioRepository:
    """Файловое хранилище аудио в отдельной приватной папке (а не в общей системной tmp)."""

    def __init__(self, directory: Path, max_bytes: int) -> None:
        """Создаёт папку хранилища с доступом только для владельца и запоминает лимит размера файла."""
        self._dir = Path(directory).resolve()
        self._dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        self._max_bytes = max_bytes

    def create_file(self) -> str:
        """Создаёт пустой файл со случайным именем и возвращает только его имя (не путь)."""
        handle = tempfile.NamedTemporaryFile(dir=self._dir, prefix=AUDIO_PREFIX, suffix=".mp3", delete=False)
        handle.close()
        return os.path.basename(handle.name)

    def resolve(self, name: str) -> Path:
        """Проверяет имя файла и возвращает его безопасный путь внутри хранилища (защита от path traversal)."""
        if os.path.basename(name) != name or not _NAME_RE.match(name):
            raise AudioNotFoundError(f"Недопустимое имя файла: {name!r}")
        path = self._dir / name
        real = path.resolve()
        # Файл должен лежать именно в папке хранилища, быть обычным файлом и не символической ссылкой
        if real.parent != self._dir or path.is_symlink() or not real.is_file():
            raise AudioNotFoundError(f"Файл не найден: {name}")
        return real

    def read(self, name: str) -> bytes:
        """Читает файл целиком в память, проверяя ограничение на размер."""
        path = self.resolve(name)
        if path.stat().st_size > self._max_bytes:
            raise AudioTooLargeError(f"Файл {name} больше {self._max_bytes} байт")
        return path.read_bytes()

    def delete(self, name: str) -> None:
        """Удаляет файл; отсутствие файла и недопустимое имя не считаются ошибкой."""
        try:
            self.resolve(name).unlink(missing_ok=True)
        except AudioNotFoundError:
            return
        except OSError:
            logger.exception("Не удалось удалить временный файл %s", name)

    def delete_expired(self, ttl_seconds: int) -> int:
        """Удаляет файлы старше ttl_seconds (например, если клиент так и не запросил аудио); возвращает их число."""
        removed = 0
        threshold = time.time() - ttl_seconds
        for path in self._dir.glob(f"{AUDIO_PREFIX}*.mp3"):
            try:
                if path.is_file() and path.stat().st_mtime < threshold:
                    path.unlink(missing_ok=True)
                    removed += 1
            except OSError:
                logger.exception("Не удалось удалить устаревший файл %s", path.name)
        return removed
