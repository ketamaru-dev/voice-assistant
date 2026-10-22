"""Авторизация по Bearer-токену: проверка логина и пароля, выпуск и проверка подписанных токенов, dependency для API."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import get_settings

# auto_error=False: ответ 401 формируем сами, с понятным текстом и заголовком WWW-Authenticate: Bearer
bearer = HTTPBearer(auto_error=False, description="Токен из POST /api/login")

_UNAUTHORIZED_HEADERS = {"WWW-Authenticate": "Bearer"}


def _b64(data: bytes) -> str:
    """Кодирует байты в base64url без символов заполнения (удобно для токена)."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(text: str) -> bytes:
    """Декодирует base64url, восстанавливая символы заполнения."""
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(payload_b64: str) -> str:
    """Подпись HMAC-SHA256 над закодированной полезной нагрузкой."""
    key = get_settings().auth_secret.encode("utf-8")
    return _b64(hmac.new(key, payload_b64.encode("ascii"), hashlib.sha256).digest())


def check_credentials(username: str, password: str) -> bool:
    """Сравнивает логин и пароль с настройками за постоянное время (без утечки по времени ответа)."""
    settings = get_settings()
    # Сравнение по байтам: compare_digest не принимает строки с не-ASCII символами
    user_ok = secrets.compare_digest(username.encode("utf-8"), settings.app_user.encode("utf-8"))
    password_ok = secrets.compare_digest(password.encode("utf-8"), settings.app_password.encode("utf-8"))
    return user_ok and password_ok


def issue_token(username: str, now: float | None = None) -> tuple[str, int]:
    """Выпускает подписанный токен и возвращает его вместе со сроком жизни в секундах."""
    issued = int(now if now is not None else time.time())
    ttl = get_settings().token_ttl_minutes * 60
    payload = _b64(json.dumps({"sub": username, "iat": issued, "exp": issued + ttl}, separators=(",", ":")).encode("utf-8"))
    return f"{payload}.{_sign(payload)}", ttl


def verify_token(token: str, now: float | None = None) -> str | None:
    """Проверяет подпись, срок действия и владельца токена; возвращает имя пользователя или None."""
    try:
        payload_b64, signature = token.split(".", 1)
        if not secrets.compare_digest(signature.encode("ascii"), _sign(payload_b64).encode("ascii")):
            return None
        payload = json.loads(_unb64(payload_b64))
        username, expires = payload["sub"], payload["exp"]
        if not isinstance(username, str) or not isinstance(expires, int):
            return None
    except (ValueError, KeyError, TypeError, UnicodeError):
        return None
    if expires <= (now if now is not None else time.time()):
        return None
    # Токен остаётся действительным, только пока логин совпадает с настройкой (смена APP_USER отзывает токены)
    if not secrets.compare_digest(username.encode("utf-8"), get_settings().app_user.encode("utf-8")):
        return None
    return username


def authenticate(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> str:
    """FastAPI-dependency: пропускает запрос только с действительным Bearer-токеном и возвращает имя пользователя."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Требуется вход", headers=_UNAUTHORIZED_HEADERS)
    username = verify_token(credentials.credentials)
    if username is None:
        raise HTTPException(status_code=401, detail="Сессия истекла, войдите снова", headers=_UNAUTHORIZED_HEADERS)
    return username
