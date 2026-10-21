"""Точка входа ASGI-приложения.

Запуск (оба варианта рабочие):
    cd backend && uvicorn main:app --reload      # из папки backend
    uvicorn backend.main:app --reload            # из корня проекта
"""
import sys
from pathlib import Path

if not __package__:
    # Запуск как "main:app" из папки backend: добавляем корень проекта в sys.path, чтобы работали импорты backend.*
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from backend.application import create_app
else:
    from .application import create_app

app = create_app()
