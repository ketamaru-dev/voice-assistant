// Сервис определения типа устройства. Определяет не «модель телефона», а возможности основного указателя и экрана
// (feature detection через matchMedia), поэтому корректно работает и на гибридных устройствах.
import { COMPACT_MAX_WIDTH } from '../config.js';
import { subscribeToMediaQuery } from '../utils/mediaQuery.js';

// Создаёт сервис. matchMedia и root подменяются в тестах
export function createDeviceService({
  matchMedia = typeof window !== 'undefined' ? window.matchMedia.bind(window) : () => ({ matches: false }),
  root = typeof document !== 'undefined' ? document.documentElement : null,
} = {}) {
  // Основной указатель — палец (телефон, планшет)
  const coarsePointer = matchMedia('(pointer: coarse)');
  // Основной указатель — мышь с наведением (ПК, ноутбук)
  const hoverPointer = matchMedia('(hover: hover) and (pointer: fine)');
  // Узкий экран (телефон в портретной ориентации)
  const compactScreen = matchMedia(`(max-width: ${COMPACT_MAX_WIDTH}px)`);

  // Текущие возможности устройства одним объектом
  function snapshot() {
    const canHover = hoverPointer.matches;
    return {
      canHover,                              // есть мышь с наведением -> показываем hover-эффекты
      isTouch: coarsePointer.matches && !canHover, // сенсорное управление как основное
      isCompact: compactScreen.matches,      // узкий экран
      hasKeyboardShortcuts: canHover,        // горячие клавиши имеют смысл только с мышью и клавиатурой
    };
  }

  // Записывает тип устройства в атрибуты <html> (data-device, data-screen) — их можно использовать в CSS
  function apply() {
    const info = snapshot();
    if (root && root.dataset) {
      root.dataset.device = info.canHover ? 'desktop' : 'touch';
      root.dataset.screen = info.isCompact ? 'compact' : 'wide';
    }
    return info;
  }

  // Подписывается на смену условий (поворот экрана, подключение мыши, изменение окна); возвращает функцию отписки
  function onChange(callback) {
    const handler = () => callback(apply());
    const unsubscribers = [coarsePointer, hoverPointer, compactScreen].map(query => subscribeToMediaQuery(query, handler));
    return () => unsubscribers.forEach(off => off());
  }

  return { snapshot, apply, onChange };
}
