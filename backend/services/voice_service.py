"""Выбор нейроголоса Edge TTS по языку."""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

DEFAULT_VOICE = "en-US-AvaNeural"

# Код языка -> голос Edge TTS
VOICE_MAPPING = {
    "ru": "ru-RU-SvetlanaNeural",
    "en": "en-US-AvaNeural",
    "sr": "sr-RS-SophieNeural",
    "de": "de-DE-KatjaNeural",
    "es": "es-ES-ElviraNeural",
    "fr": "fr-FR-DeniseNeural",
    "it": "it-IT-ElsaNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
    "ja": "ja-JP-NanamiNeural",
}

# Запасной поиск по названию языка, если пришёл не код ("Serbian", "русский" и т. п.)
_VOICE_KEYWORDS = [
    ("sr", ["serb", "srp", "срп", "серб"]),
    ("ru", ["rus", "рус"]),
    ("en", ["eng", "англ"]),
    ("de", ["ger", "deu", "нем"]),
    ("es", ["spa", "esp", "исп"]),
    ("fr", ["fre", "fra", "фра"]),
    ("it", ["ita", "итал"]),
    ("zh", ["chi", "中文", "кит"]),
    ("ja", ["jap", "日本", "япон"]),
]


def get_voice_for_language(lang: str) -> str:
    """Возвращает голос для языка: сначала по точному коду ("sr", "ru-RU"), затем по названию, иначе английский."""
    value = str(lang).lower().strip()
    code = value.replace("_", "-").split("-")[0]
    # Точный код приоритетнее поиска по подстроке: "french" содержит "en", но это не английский
    if code in VOICE_MAPPING:
        return VOICE_MAPPING[code]
    for key, words in _VOICE_KEYWORDS:
        if any(word in value for word in words):
            return VOICE_MAPPING[key]
    logger.warning("Язык %r не распознан, используется голос по умолчанию", lang)
    return DEFAULT_VOICE


def is_serbian_voice(voice: str) -> bool:
    """Проверяет, что выбран сербский голос (ему нужна кириллица на входе)."""
    return voice.startswith("sr-")
