"""Прикладные исключения: каждое знает свой HTTP-статус и безопасное сообщение для клиента."""
from __future__ import annotations

GENERIC_ERROR_DETAIL = "Ошибка обработки запроса"
RATE_LIMIT_DETAIL = "Превышено количество запросов, повторите позднее"
LOGIN_RATE_LIMIT_DETAIL = "Слишком много попыток входа, повторите через минуту"


class AppError(Exception):
    """Базовое исключение приложения; детали для логов хранятся в сообщении, клиенту уходит только detail."""

    status_code = 500
    detail = GENERIC_ERROR_DETAIL


class TranslationError(AppError):
    """Не удалось получить перевод от языковой модели."""


class AudioNotFoundError(AppError):
    """Запрошенный аудиофайл не существует, удалён или имя файла недопустимо."""

    status_code = 404
    detail = "Аудио не найдено"


class AudioTooLargeError(AppError):
    """Аудиофайл превышает допустимый размер."""

    status_code = 413
    detail = "Файл слишком большой"


class UpstreamRateLimitError(AppError):
    """Внешний сервис (Groq) ответил, что лимит запросов исчерпан; клиенту показывается понятное сообщение."""

    status_code = 429
    detail = RATE_LIMIT_DETAIL
