"""Схемы запроса и ответа эндпоинта перевода."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from ..core.config import get_settings

# Код языка: "ru", "sr", "en-US" (буквы, дефис, подчёркивание) — защита от мусора и инъекций в промпт
_LANG_PATTERN = r"^[A-Za-z][A-Za-z_-]{1,15}$"


class TranslationRequest(BaseModel):
    """Запрос на перевод: распознанный текст и коды исходного/целевого языков."""

    text: str = Field(max_length=get_settings().max_text_length)
    source_lang: str = Field(pattern=_LANG_PATTERN)
    target_lang: str = Field(pattern=_LANG_PATTERN)


class TranslationResponse(BaseModel):
    """Ответ с оригиналом, переводом и ссылкой на озвучку (None, если озвучка недоступна)."""

    original_text: str
    translated_text: str
    audio_url: Optional[str] = None
