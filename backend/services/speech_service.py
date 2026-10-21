"""Озвучка перевода: выбор голоса, подготовка текста, синтез с повторными попытками."""
from __future__ import annotations

import asyncio
import logging

from ..repositories.audio_repository import AudioRepository
from ..repositories.tts_repository import EdgeTTSRepository
from .transliteration import latin_to_cyrillic
from .voice_service import get_voice_for_language, is_serbian_voice

logger = logging.getLogger(__name__)


class SpeechService:
    """Превращает текст перевода в MP3 и возвращает имя файла в хранилище."""

    def __init__(self, tts: EdgeTTSRepository, audio: AudioRepository, attempts: int) -> None:
        """Принимает репозитории синтеза и хранения и число попыток синтеза."""
        self._tts = tts
        self._audio = audio
        self._attempts = max(1, attempts)

    async def synthesize(self, text: str, target_lang: str) -> str | None:
        """Озвучивает текст голосом целевого языка; при неудаче всех попыток возвращает None, но не ошибку."""
        voice = get_voice_for_language(target_lang)
        # Сербские голоса корректно читают только кириллицу
        tts_text = latin_to_cyrillic(text) if is_serbian_voice(voice) else text
        logger.info("Озвучка: язык=%s голос=%s символов=%d", target_lang, voice, len(tts_text))

        for attempt in range(1, self._attempts + 1):
            name = self._audio.create_file()
            try:
                await self._tts.synthesize(tts_text, voice, self._audio.resolve(name))
                return name
            except Exception as exc:  # сервис Edge TTS нестабилен (403, обрывы сети), поэтому ловим всё
                self._audio.delete(name)
                logger.warning("Озвучка: попытка %d/%d не удалась: %s", attempt, self._attempts, exc)
                if attempt < self._attempts:
                    # Пауза растёт с каждой попыткой, чтобы переждать лимиты Microsoft
                    await asyncio.sleep(0.7 * attempt)
        return None
