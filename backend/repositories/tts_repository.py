"""Доступ к сервису синтеза речи Microsoft Edge TTS."""
from __future__ import annotations

from pathlib import Path

import edge_tts


class EdgeTTSRepository:
    """Тонкая обёртка над edge-tts: превращает текст в MP3-файл заданным голосом."""

    async def synthesize(self, text: str, voice: str, output_path: Path) -> None:
        """Синтезирует речь и сохраняет её в output_path (исключения сети/сервиса пробрасываются вызывающему)."""
        await edge_tts.Communicate(text, voice).save(str(output_path))
