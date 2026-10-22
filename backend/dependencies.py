"""Сборка зависимостей (DI): единые экземпляры репозиториев и сервисов для FastAPI Depends."""
from __future__ import annotations

from functools import lru_cache

from fastapi import Depends, HTTPException, Request

from .core.config import get_settings
from .core.exceptions import LOGIN_RATE_LIMIT_DETAIL, RATE_LIMIT_DETAIL
from .core.rate_limit import SlidingWindowRateLimiter
from .repositories.audio_repository import AudioRepository
from .repositories.llm_repository import GroqLLMRepository
from .repositories.tts_repository import EdgeTTSRepository
from .services.audio_service import AudioService
from .services.speech_service import SpeechService
from .services.translation_service import TranslationService


@lru_cache
def get_audio_repository() -> AudioRepository:
    """Создаёт единое файловое хранилище аудио."""
    settings = get_settings()
    return AudioRepository(settings.audio_dir, settings.max_audio_bytes)


@lru_cache
def get_audio_service() -> AudioService:
    """Создаёт единый сервис выдачи аудио."""
    return AudioService(get_audio_repository())


@lru_cache
def get_speech_service() -> SpeechService:
    """Создаёт единый сервис озвучки."""
    return SpeechService(EdgeTTSRepository(), get_audio_repository(), get_settings().tts_attempts)


@lru_cache
def get_translation_service() -> TranslationService:
    """Создаёт единый сервис перевода (клиент Groq инициализируется один раз)."""
    settings = get_settings()
    llm = GroqLLMRepository(settings.groq_api_key, settings.model_name, settings.llm_timeout_seconds, settings.llm_max_tokens)
    return TranslationService(llm, get_speech_service())


@lru_cache
def get_rate_limiter() -> SlidingWindowRateLimiter:
    """Создаёт единый ограничитель частоты запросов."""
    return SlidingWindowRateLimiter(get_settings().rate_limit_per_minute)


@lru_cache
def get_login_rate_limiter() -> SlidingWindowRateLimiter:
    """Создаёт отдельный (более строгий) ограничитель попыток входа для защиты от подбора пароля."""
    return SlidingWindowRateLimiter(get_settings().login_attempts_per_minute)


def login_rate_limit(request: Request, limiter: SlidingWindowRateLimiter = Depends(get_login_rate_limiter)) -> None:
    """FastAPI-dependency: отвечает 429, если с одного IP слишком много попыток входа в минуту."""
    client_ip = request.client.host if request.client else "unknown"
    if not limiter.allow(client_ip):
        raise HTTPException(status_code=429, detail=LOGIN_RATE_LIMIT_DETAIL, headers={"Retry-After": "60"})


def rate_limit(request: Request, limiter: SlidingWindowRateLimiter = Depends(get_rate_limiter)) -> None:
    """FastAPI-dependency: отвечает 429, если клиент (по IP) превысил лимит запросов в минуту."""
    client_ip = request.client.host if request.client else "unknown"
    if not limiter.allow(client_ip):
        raise HTTPException(status_code=429, detail=RATE_LIMIT_DETAIL, headers={"Retry-After": "60"})
