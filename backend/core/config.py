"""Конфигурация приложения: чтение и валидация переменных окружения."""
from __future__ import annotations

import hashlib
import logging
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
import tempfile

from dotenv import load_dotenv

# backend/ и корень проекта (рядом с папкой static)
BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent

logger = logging.getLogger(__name__)

# Пароли, с которыми запускать сервис в проде нельзя (только предупреждение в логе)
_WEAK_PASSWORDS = {"admin", "password", "123456", "12345678", "qwerty", "changeme"}


@dataclass(frozen=True)
class Settings:
    """Неизменяемый набор настроек приложения, собранный из переменных окружения."""

    groq_api_key: str
    app_user: str
    app_password: str
    allowed_origins: tuple[str, ...]
    static_dir: Path
    audio_dir: Path
    log_level: str
    max_text_length: int
    max_audio_bytes: int
    model_name: str
    tts_attempts: int
    llm_timeout_seconds: int
    llm_max_tokens: int
    enable_docs: bool
    audio_ttl_seconds: int
    cleanup_interval_seconds: int
    rate_limit_per_minute: int
    auth_secret: str
    token_ttl_minutes: int
    login_attempts_per_minute: int


def _env_int(name: str, default: int) -> int:
    """Читает целочисленную переменную окружения; при ошибке формата сообщает, какая именно неверна."""
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise RuntimeError(f"Переменная {name} должна быть целым числом, получено: {raw!r}") from exc


def _env_bool(name: str, default: bool) -> bool:
    """Читает логическую переменную окружения (1/true/yes/on — истина, остальное — ложь)."""
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_list(name: str) -> tuple[str, ...]:
    """Читает переменную со списком значений через запятую (пустые элементы отбрасываются)."""
    raw = os.getenv(name, "")
    return tuple(item.strip() for item in raw.split(",") if item.strip())


def _auth_secret() -> str:
    """Секрет подписи токенов: AUTH_SECRET, а если не задан — производный от логина и пароля.

    Так токены переживают перезапуск сервера, а смена пароля или логина автоматически отзывает все выданные токены."""
    explicit = os.getenv("AUTH_SECRET", "").strip()
    if explicit:
        return explicit
    material = f"voice-translator-token\0{os.environ['APP_USER']}\0{os.environ['APP_PASSWORD']}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


@lru_cache
def get_settings() -> Settings:
    """Загружает .env, проверяет обязательные переменные и возвращает единый (кэшируемый) объект настроек."""
    load_dotenv(BACKEND_DIR / ".env")

    missing = [name for name in ("GROQ_API_KEY", "APP_USER", "APP_PASSWORD") if not os.getenv(name)]
    if missing:
        raise RuntimeError(f"Не заданы обязательные переменные окружения: {', '.join(missing)} (см. backend/.env.example)")

    settings = Settings(
        groq_api_key=os.environ["GROQ_API_KEY"],
        app_user=os.environ["APP_USER"],
        app_password=os.environ["APP_PASSWORD"],
        # По умолчанию CORS выключен: страница и API отдаются с одного адреса
        allowed_origins=_env_list("ALLOWED_ORIGINS"),
        static_dir=Path(os.getenv("STATIC_DIR", PROJECT_DIR / "static")),
        audio_dir=Path(os.getenv("AUDIO_DIR", Path(tempfile.gettempdir()) / "voice_translator")),
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
        max_text_length=_env_int("MAX_TEXT_LENGTH", 10000),
        max_audio_bytes=_env_int("MAX_AUDIO_BYTES", 10 * 1024 * 1024),
        model_name=os.getenv("MODEL_NAME", "gpt-oss-20b"),
        tts_attempts=_env_int("TTS_ATTEMPTS", 3),
        # Длинные тексты (до ~10000 символов) переводятся дольше, поэтому таймаут и лимит ответа увеличены
        llm_timeout_seconds=_env_int("LLM_TIMEOUT_SECONDS", 90),
        llm_max_tokens=_env_int("LLM_MAX_TOKENS", 16384),
        # Документация API (/docs, /redoc) по умолчанию выключена: при включении она открыта всем (токен вводится кнопкой Authorize)
        enable_docs=_env_bool("ENABLE_DOCS", False),
        audio_ttl_seconds=_env_int("AUDIO_TTL_SECONDS", 300),
        cleanup_interval_seconds=_env_int("CLEANUP_INTERVAL_SECONDS", 120),
        rate_limit_per_minute=_env_int("RATE_LIMIT_PER_MINUTE", 30),
        auth_secret=_auth_secret(),
        token_ttl_minutes=_env_int("TOKEN_TTL_MINUTES", 720),
        login_attempts_per_minute=_env_int("LOGIN_ATTEMPTS_PER_MINUTE", 10),
    )

    if settings.app_password.lower() in _WEAK_PASSWORDS or len(settings.app_password) < 8:
        logger.warning("APP_PASSWORD слишком простой: задайте длинный случайный пароль перед публикацией сервиса")
    return settings
