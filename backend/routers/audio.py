"""HTTP-эндпоинт выдачи озвучки."""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Response

from ..core.security import authenticate
from ..dependencies import get_audio_service
from ..services.audio_service import AudioService

router = APIRouter(prefix="/api", tags=["audio"], dependencies=[Depends(authenticate)])


@router.get("/audio/{filename}")
async def get_audio(
    filename: str,
    background_tasks: BackgroundTasks,
    service: AudioService = Depends(get_audio_service),
) -> Response:
    """Отдаёт MP3 целиком одним ответом (без Range-запросов) и удаляет файл после отправки."""
    data = await service.get_audio(filename)
    background_tasks.add_task(service.delete, filename)
    return Response(content=data, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})
