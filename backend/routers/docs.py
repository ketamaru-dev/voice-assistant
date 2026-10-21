"""Документация API (Swagger UI, ReDoc, OpenAPI-схема), защищённая тем же паролем, что и приложение."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import HTMLResponse, JSONResponse

from ..core.security import authenticate

# include_in_schema=False: сами страницы документации не попадают в схему
router = APIRouter(include_in_schema=False, dependencies=[Depends(authenticate)])


@router.get("/openapi.json")
async def openapi_schema(request: Request) -> JSONResponse:
    """Отдаёт OpenAPI-схему приложения в формате JSON."""
    return JSONResponse(request.app.openapi())


@router.get("/docs")
async def swagger_ui(request: Request) -> HTMLResponse:
    """Возвращает интерактивную документацию Swagger UI (браузер сам подставит уже введённый пароль)."""
    return get_swagger_ui_html(openapi_url="/openapi.json", title=f"{request.app.title} — Swagger UI")


@router.get("/redoc")
async def redoc(request: Request) -> HTMLResponse:
    """Возвращает документацию ReDoc."""
    return get_redoc_html(openapi_url="/openapi.json", title=f"{request.app.title} — ReDoc")
