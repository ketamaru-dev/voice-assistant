// Константы и настройки фронтенда. Меняйте значения здесь, а не в коде логики.

// Пауза тишины (мс) после последнего слова: по её истечении запись останавливается и текст отправляется
export const SILENCE_TIMEOUT_MS = 1000;

// Сколько раз подряд можно незаметно перезапустить распознавание, если после перезапуска не пришло ни слова
// (защита от бесконечного цикла перезапусков)
export const MAX_EMPTY_RESTARTS = 3;

// Через сколько мс после явной остановки завершаем запись, даже если браузер так и не прислал onend
export const STOP_GUARD_MS = 2000;

// Максимальная длина диктовки в символах (совпадает с лимитом сервера по умолчанию); по достижении запись останавливается
export const MAX_DICTATION_CHARS = 10000;

// Окно (мс), в течение которого одинаковая фраза после успешной отправки не отправляется повторно
export const DUPLICATE_WINDOW_MS = 8000;

// Адрес API перевода
export const TRANSLATE_URL = '/api/translate';

// Авторизация: адреса API и страниц, ключ localStorage с Bearer-токеном ({ token, expiresAt })
export const LOGIN_URL = '/api/login';
export const SESSION_URL = '/api/session';
export const LOGIN_PAGE = '/login';
export const APP_PAGE = '/';
export const TOKEN_STORAGE_KEY = 'voiceTranslator.token';

// Ключ localStorage и срок жизни (мс) сохранённого неотправленного текста
export const PENDING_STORAGE_KEY = 'voiceTranslator.pending';
export const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Код языка интерфейса -> BCP-47 код для Web Speech API (распознавание и озвучка в браузере)
export const SPEECH_LANGS = {
  ru: 'ru-RU', en: 'en-US', sr: 'sr-RS', de: 'de-DE', fr: 'fr-FR',
  es: 'es-ES', it: 'it-IT', zh: 'zh-CN', ja: 'ja-JP',
};

// Фазы работы приложения (конечный автомат контроллера)
export const PHASE = Object.freeze({
  IDLE: 'idle',             // ждём нажатия на микрофон
  LISTENING: 'listening',   // идёт запись и распознавание речи
  PROCESSING: 'processing', // запрос ушёл на сервер, ждём перевод
  SPEAKING: 'speaking',     // воспроизводится озвучка перевода
});

// Стороны интерфейса: левый язык (оригинал) и правый язык (перевод)
export const SIDE = Object.freeze({ FROM: 'from', TO: 'to' });

// Ширина экрана (px), до которой интерфейс считается «компактным» (телефон)
export const COMPACT_MAX_WIDTH = 767;

// Темы оформления: светлая (по умолчанию) и тёмная
export const THEME = Object.freeze({ LIGHT: 'light', DARK: 'dark' });

// Ключ localStorage, где хранится ручной выбор темы (если пользователь переключал её сам)
export const THEME_STORAGE_KEY = 'voiceTranslator.theme';

// Цвет системной строки браузера (meta theme-color) для каждой темы
export const THEME_COLORS = Object.freeze({ light: '#f3f5fa', dark: '#000000' });

// Media query системной тёмной темы (Chrome, Safari, Firefox на ПК, Android и iPhone)
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';
