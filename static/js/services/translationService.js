// Сервис перевода на клиенте: вызывает API и приводит ответ к виду, удобному интерфейсу.
import { normalize } from '../utils/textUtils.js';

// Создаёт сервис поверх функции запроса (её можно подменить в тестах)
export function createTranslationService({ requestTranslation }) {
  return {
    // Переводит запись {text, sourceLang, targetLang}; возвращает {original, translated, audioUrl}
    async translate(entry) {
      const data = await requestTranslation(entry);
      return {
        original: entry.text,
        // Сербский всегда показываем латиницей, даже если модель вернула кириллицу
        translated: normalize(entry.targetLang, data.translated_text || ''),
        audioUrl: data.audio_url || null,
      };
    },
  };
}
