"""HTTP Basic авторизация: dependency для эндпоинтов и защищённая раздача статики."""
from __future__ import annotations

import secrets

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles

from .config import get_settings

security = HTTPBasic()


def check_credentials(credentials: HTTPBasicCredentials) -> str:
    """Сравнивает логин и пароль с настройками за постоянное время и выбрасывает 401 при несовпадении."""
    settings = get_settings()
    # Сравнение по байтам: compare_digest не принимает строки с не-ASCII символами
    user_ok = secrets.compare_digest(credentials.username.encode("utf-8"), settings.app_user.encode("utf-8"))
    password_ok = secrets.compare_digest(credentials.password.encode("utf-8"), settings.app_password.encode("utf-8"))
    if not (user_ok and password_ok):
        raise HTTPException(
            status_code=401,
            detail="Неверный логин или пароль",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


def authenticate(credentials: HTTPBasicCredentials = Depends(security)) -> str:
    """FastAPI-dependency: пропускает запрос только с верными учётными данными."""
    return check_credentials(credentials)


class AuthStaticFiles(StaticFiles):
    """StaticFiles с проверкой Basic Auth (mount не поддерживает dependencies, поэтому проверяем вручную)."""

    async def get_response(self, path, scope):
        """Проверяет учётные данные перед отдачей любого статического файла."""
        check_credentials(await security(Request(scope)))
        return await super().get_response(path, scope)
