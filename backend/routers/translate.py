"""HTTP-эндпоинт перевода речи."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from ..core.security import authenticate
from ..dependencies import get_translation_service, rate_limit
from ..schemas.translation import TranslationRequest, TranslationResponse
from ..services.translation_service import TranslationService

router = APIRouter(prefix="/api", tags=["translate"], dependencies=[Depends(authenticate)])


@router.post("/translate", response_model=TranslationResponse, dependencies=[Depends(rate_limit)])
async def translate(
    request: TranslationRequest,
    service: TranslationService = Depends(get_translation_service),
) -> TranslationResponse:
    """Переводит распознанный текст и возвращает перевод со ссылкой на озвучку."""
    return await service.translate(request)
