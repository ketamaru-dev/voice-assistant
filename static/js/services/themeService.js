// Сервис темы оформления. Правила выбора темы:
//   1) если пользователь сам переключал тему — используется его выбор (хранится в localStorage);
//   2) иначе — системная тема устройства (prefers-color-scheme: dark), и она отслеживается «вживую»;
//   3) если системной тёмной темы нет — светлая (по умолчанию).
import { DARK_SCHEME_QUERY, THEME, THEME_ANIMATION_MS, THEME_COLORS, THEME_STORAGE_KEY } from '../config.js';
import { subscribeToMediaQuery } from '../utils/mediaQuery.js';
import { createSafeStorage } from '../utils/safeStorage.js';

// Проверяет, что значение — допустимое название темы
const isTheme = value => value === THEME.LIGHT || value === THEME.DARK;

// Создаёт сервис. Все браузерные зависимости подменяются в тестах
export function createThemeService({
  matchMedia = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia.bind(window) : () => ({ matches: false }),
  storage = createSafeStorage(),
  root = typeof document !== 'undefined' ? document.documentElement : null,
  metaThemeColor = typeof document !== 'undefined' ? document.querySelector('meta[name="theme-color"]') : null,
  timers = { setTimeout: (...args) => setTimeout(...args), clearTimeout: id => clearTimeout(id) },
} = {}) {
  const systemDark = matchMedia(DARK_SCHEME_QUERY);
  let animationTimer = null;

  // Читает ручной выбор пользователя; недопустимые и повреждённые значения игнорируются
  function getStoredTheme() {
    try {
      const value = storage.getItem(THEME_STORAGE_KEY);
      return isTheme(value) ? value : null;
    } catch {
      return null;
    }
  }

  // Системная тема устройства
  function getSystemTheme() {
    return systemDark.matches ? THEME.DARK : THEME.LIGHT;
  }

  // Текущая тема по правилам выше: выбор пользователя, иначе системная
  function resolve() {
    return getStoredTheme() || getSystemTheme();
  }

  // Применяет тему к странице: атрибут data-theme на <html>, цвет строки браузера и (если animate) плавный переход
  function apply(theme, { animate = false } = {}) {
    if (!root) return theme;
    if (animate) {
      // Класс включает плавные переходы цветов только на время смены темы
      root.classList.add('theme-animating');
      if (animationTimer) timers.clearTimeout(animationTimer);
      animationTimer = timers.setTimeout(() => {
        root.classList.remove('theme-animating');
        animationTimer = null;
      }, THEME_ANIMATION_MS);
    }
    root.dataset.theme = theme;
    if (metaThemeColor) metaThemeColor.setAttribute('content', THEME_COLORS[theme]);
    return theme;
  }

  // Применяет тему при старте страницы (без анимации) и возвращает её название
  function init() {
    return apply(resolve());
  }

  // Ручной выбор пользователя: сохраняет его и плавно переключает тему
  function set(theme) {
    if (!isTheme(theme)) return resolve();
    try {
      storage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // хранилище недоступно — тема всё равно применится до перезагрузки страницы
    }
    return apply(theme, { animate: true });
  }

  // Подписывается на смену системной темы; пока пользователь не выбрал тему сам, интерфейс следует за системой.
  // Возвращает функцию отписки
  function onSystemChange(callback) {
    return subscribeToMediaQuery(systemDark, () => {
      if (getStoredTheme()) return;
      callback(apply(getSystemTheme(), { animate: true }));
    });
  }

  return { init, set, resolve, getSystemTheme, onSystemChange };
}
