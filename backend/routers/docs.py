"""Документация API (Swagger UI, ReDoc, OpenAPI-схема): подключается только при ENABLE_DOCS=true.

Страницы открыты без входа (браузер не может приложить Bearer-токен к обычному переходу по ссылке); сами
эндпоинты по-прежнему требуют токен, его вводят кнопкой Authorize в Swagger UI."""
from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import HTMLResponse, JSONResponse

# include_in_schema=False: сами страницы документации не попадают в схему
router = APIRouter(include_in_schema=False)


@router.get("/openapi.json")
async def openapi_schema(request: Request) -> JSONResponse:
    """Отдаёт OpenAPI-схему приложения в формате JSON."""
    return JSONResponse(request.app.openapi())


@router.get("/docs")
async def swagger_ui(request: Request) -> HTMLResponse:
    """Возвращает интерактивную документацию Swagger UI."""
    return get_swagger_ui_html(openapi_url="/openapi.json", title=f"{request.app.title} — Swagger UI")


@router.get("/redoc")
async def redoc(request: Request) -> HTMLResponse:
    """Возвращает документацию ReDoc."""
    return get_redoc_html(openapi_url="/openapi.json", title=f"{request.app.title} — ReDoc")
