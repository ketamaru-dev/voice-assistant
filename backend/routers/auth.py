"""HTTP-эндпоинты авторизации: вход по логину и паролю, проверка токена."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..core.security import authenticate, check_credentials, issue_token
from ..dependencies import login_rate_limit
from ..schemas.auth import LoginRequest, SessionResponse, TokenResponse

router = APIRouter(prefix="/api", tags=["auth"])


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(login_rate_limit)])
async def login(body: LoginRequest) -> TokenResponse:
    """Проверяет логин и пароль и выдаёт Bearer-токен (число попыток с одного IP ограничено)."""
    if not check_credentials(body.username, body.password):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    token, expires_in = issue_token(body.username)
    return TokenResponse(access_token=token, expires_in=expires_in)


@router.get("/session", response_model=SessionResponse)
async def session(user: str = Depends(authenticate)) -> SessionResponse:
    """Проверяет, что токен ещё действителен (страница вызывает это при открытии)."""
    return SessionResponse(user=user)
