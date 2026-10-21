"""Служебный эндпоинт проверки работоспособности (без авторизации — для мониторинга и балансировщика)."""
from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    """Возвращает признак живости сервиса."""
    return {"status": "ok"}
