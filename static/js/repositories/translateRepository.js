// Репозиторий API перевода: единственное место, где фронтенд обращается к серверу.
import { TRANSLATE_URL } from '../config.js';

// Достаёт из ответа сервера понятное сообщение об ошибке (detail бывает строкой или списком ошибок валидации)
function extractError(data, status) {
  if (data && typeof data.detail === 'string') return data.detail;
  if (data && typeof data.error === 'string') return data.error;
  if (status === 422) return 'Некорректный запрос (проверьте длину текста)';
  return `Ошибка сервера (${status})`;
}

// Отправляет текст на перевод и возвращает JSON ответа; при ошибке HTTP выбрасывает Error с сообщением сервера
export async function requestTranslation({ text, sourceLang, targetLang }, { fetchFn = (...args) => fetch(...args), url = TRANSLATE_URL } = {}) {
  const response = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, source_lang: sourceLang, target_lang: targetLang }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractError(data, response.status));
  return data;
}
