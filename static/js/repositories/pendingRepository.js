import { createSafeStorage } from '../utils/safeStorage.js';

// Репозиторий неотправленного текста: промежуточное сохранение в localStorage.
// Хранится одна запись — последний наговоренный текст, который ещё не удалось перевести.

// Создаёт репозиторий: save/load/clear работают с одной записью под ключом key
export function createPendingRepository({ storage = createSafeStorage(), key, maxAgeMs, now = Date.now }) {
  return {
    // Сохраняет запись {text, sourceLang, targetLang} вместе со временем сохранения
    save(entry) {
      try {
        storage.setItem(key, JSON.stringify({ ...entry, savedAt: now() }));
      } catch (error) {
        console.warn('Не удалось сохранить неотправленный текст', error);
      }
    },

    // Возвращает сохранённую запись или null (если её нет, она повреждена или старше maxAgeMs)
    load() {
      let raw;
      try {
        raw = storage.getItem(key);
      } catch {
        return null;
      }
      if (!raw) return null;
      try {
        const entry = JSON.parse(raw);
        const valid = entry && ['text', 'sourceLang', 'targetLang'].every(field => typeof entry[field] === 'string') && entry.text.trim();
        if (!valid || now() - Number(entry.savedAt) > maxAgeMs) {
          this.clear();
          return null;
        }
        return { text: entry.text, sourceLang: entry.sourceLang, targetLang: entry.targetLang };
      } catch {
        this.clear();
        return null;
      }
    },

    // Удаляет сохранённую запись (после успешной отправки)
    clear() {
      try {
        storage.removeItem(key);
      } catch {
        // хранилище недоступно — удалять нечего
      }
    },
  };
}
