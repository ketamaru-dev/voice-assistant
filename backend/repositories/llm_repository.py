"""Доступ к языковой модели Groq (источник переводов)."""
from __future__ import annotations

import logging

from groq import Groq, NotFoundError, RateLimitError

from ..core.exceptions import UpstreamRateLimitError

logger = logging.getLogger(__name__)


class GroqLLMRepository:
    """Клиент Groq с поддержкой нескольких вариантов написания идентификатора модели."""

    def __init__(self, api_key: str, model_name: str, timeout: float = 90.0, max_tokens: int = 16384) -> None:
        """Создаёт клиент Groq (таймаут и автоповторы при 429/5xx встроены в SDK) и запоминает лимит ответа."""
        self._client = Groq(api_key=api_key, timeout=timeout, max_retries=2)
        self._max_tokens = max_tokens
        # Groq принимает как "gpt-oss-20b", так и "openai/gpt-oss-20b" в зависимости от аккаунта
        self._model_ids = [model_name] if "/" in model_name else [model_name, f"openai/{model_name}"]

    def complete(self, system_prompt: str, user_text: str) -> str:
        """Отправляет запрос в модель и возвращает очищенный текст ответа (блокирующий вызов)."""
        last_error: Exception | None = None
        for model_id in list(self._model_ids):
            try:
                completion = self._client.chat.completions.create(
                    model=model_id,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_text},
                    ],
                    temperature=0.3,
                    max_completion_tokens=self._max_tokens,
                )
            except RateLimitError as exc:
                # Лимит запросов Groq исчерпан (SDK уже сделал автоповторы): сообщаем об этом отдельной ошибкой
                logger.warning("Groq: превышен лимит запросов: %s", exc)
                raise UpstreamRateLimitError(str(exc)) from exc
            except NotFoundError as exc:
                logger.warning("Модель %s не найдена, пробуем другое написание", model_id)
                last_error = exc
                continue
            # Запоминаем рабочий идентификатор, чтобы дальше не делать лишних запросов
            self._model_ids = [model_id]
            content = completion.choices[0].message.content
            if not content or not content.strip():
                raise RuntimeError("Модель вернула пустой ответ")
            return content.strip()
        raise last_error if last_error else RuntimeError("Нет доступных идентификаторов модели")
