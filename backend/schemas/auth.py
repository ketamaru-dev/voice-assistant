"""Схемы запроса и ответа авторизации."""
from __future__ import annotations

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    """Логин и пароль из формы входа (длина ограничена, чтобы не принимать мусор)."""

    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=256)


class TokenResponse(BaseModel):
    """Bearer-токен и срок его жизни в секундах."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int


class SessionResponse(BaseModel):
    """Подтверждение действительного токена."""

    user: str
