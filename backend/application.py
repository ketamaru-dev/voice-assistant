"""Фабрика FastAPI-приложения: middleware, обработчики ошибок, роутеры и статика."""
from __future__ import annotations

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .core.config import get_settings
from .core.exceptions import GENERIC_ERROR_DETAIL, AppError
from .core.logging_config import setup_logging
from .dependencies import get_audio_service
from .routers import audio, auth, docs, health, translate

logger = logging.getLogger(__name__)


async def _cleanup_loop(interval: int, ttl: int) -> None:
    """Фоновая задача: периодически удаляет аудиофайлы, которые клиент так и не забрал."""
    service = get_audio_service()
    while True:
        try:
            await service.cleanup_expired(ttl)
        except Exception:
            logger.exception("Ошибка очистки аудиофайлов")
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Жизненный цикл приложения: запускает фоновую очистку при старте и останавливает при выключении."""
    settings = get_settings()
    task = asyncio.create_task(_cleanup_loop(settings.cleanup_interval_seconds, settings.audio_ttl_seconds))
    logger.info("Приложение запущено")
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        logger.info("Приложение остановлено")


def create_app() -> FastAPI:
    """Создаёт приложение: логирование, middleware, обработчики ошибок, роутеры и статика (монтируется последней)."""
    settings = get_settings()
    setup_logging(settings.log_level)

    # Стандартные маршруты документации отключены: свои (routers/docs.py) подключаются только при ENABLE_DOCS=true
    app = FastAPI(title="Voice Translator", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    if settings.allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.allowed_origins),
            allow_credentials=False,
            allow_methods=["GET", "POST"],
            allow_headers=["Authorization", "Content-Type"],
        )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        """Добавляет защитные HTTP-заголовки ко всем ответам (микрофон разрешён только своей странице)."""
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Permissions-Policy", "microphone=(self), camera=(), geolocation=()")
        return response

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        """Преобразует прикладное исключение в JSON с безопасным сообщением (подробности только в логе)."""
        if exc.status_code >= 500:
            logger.error("%s %s: %s", request.method, request.url.path, exc)
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        """Последний рубеж: любую непредвиденную ошибку пишет в лог, а клиенту отдаёт общее сообщение."""
        logger.exception("Необработанная ошибка: %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": GENERIC_ERROR_DETAIL})

    app.include_router(health.router)
    if settings.enable_docs:
        app.include_router(docs.router)
    app.include_router(auth.router)
    app.include_router(translate.router)
    app.include_router(audio.router)

    @app.get("/login", include_in_schema=False)
    async def login_page() -> FileResponse:
        """Страница входа (адрес без расширения .html)."""
        return FileResponse(settings.static_dir / "login.html", headers={"Cache-Control": "no-cache"})

    # Статика публичная (в ней нет секретов): доступ к данным защищён Bearer-токеном на уровне API, а страница
    # приложения сама отправляет на /login, если токена нет. Монтируется последней, чтобы API-роуты имели приоритет
    app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="static")
    return app
