"""Бизнес-логика перевода: промпт, вызов модели и озвучка результата."""
from __future__ import annotations

import logging

from fastapi.concurrency import run_in_threadpool

from ..core.exceptions import AppError, TranslationError
from ..repositories.llm_repository import GroqLLMRepository
from ..schemas.translation import TranslationRequest, TranslationResponse
from .speech_service import SpeechService

logger = logging.getLogger(__name__)


def build_prompt(source_lang: str, target_lang: str) -> str:
    """Формирует системный промпт переводчика для пары языков."""
    return (
        f"Ты точный переводчик. Переведи текст с языка '{source_lang}' на язык "
        f"'{target_lang}'. Возвращай ИСКЛЮЧИТЕЛЬНО готовый перевод без вводных слов, "
        "пояснений и кавычек."
    )


class TranslationService:
    """Оркестрирует перевод текста и озвучку результата."""

    def __init__(self, llm: GroqLLMRepository, speech: SpeechService) -> None:
        """Принимает репозиторий языковой модели и сервис озвучки."""
        self._llm = llm
        self._speech = speech

    async def translate_text(self, text: str, source_lang: str, target_lang: str) -> str:
        """Переводит текст через языковую модель (блокирующий SDK выполняется в потоке, чтобы не стопорить event loop)."""
        prompt = build_prompt(source_lang, target_lang)
        try:
            return await run_in_threadpool(self._llm.complete, prompt, text)
        except AppError:
            # Прикладные ошибки (например, исчерпан лимит запросов Groq) уже содержат понятное клиенту сообщение
            raise
        except Exception as exc:
            # Детали (в т.ч. ответ API) только в лог, клиенту уйдёт общее сообщение
            logger.exception("Ошибка перевода")
            raise TranslationError(str(exc)) from exc

    async def translate(self, request: TranslationRequest) -> TranslationResponse:
        """Полный сценарий: перевод + озвучка; пустой текст возвращается без обращений к внешним сервисам."""
        if not request.text.strip():
            return TranslationResponse(original_text=request.text, translated_text="", audio_url=None)

        translated = await self.translate_text(request.text, request.source_lang, request.target_lang)
        audio_name = await self._speech.synthesize(translated, request.target_lang)
        return TranslationResponse(
            original_text=request.text,
            translated_text=translated,
            # Если озвучка недоступна, клиент озвучит перевод голосом браузера
            audio_url=f"/api/audio/{audio_name}" if audio_name else None,
        )
