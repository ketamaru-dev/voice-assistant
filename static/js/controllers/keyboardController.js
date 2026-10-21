// Горячие клавиши для ПК: 1 / 2 — микрофоны, R — переотправить, S — поменять языки, Esc — стоп.
// Используются коды клавиш (event.code), поэтому работают при любой раскладке (в том числе русской).
import { SIDE } from '../config.js';

// Создаёт контроллер клавиатуры. actions: {onMic(side), onRetry(), onSwap(), onEscape()}
export function createKeyboardController({ doc = document, device, actions }) {
  // Элементы, где клавиши нужны для ввода или выбора, а не для горячих клавиш
  const isEditable = target => {
    if (!target || !target.tagName) return false;
    const tag = target.tagName.toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(target.isContentEditable);
  };

  // Обрабатывает нажатие: вызывает нужное действие и подавляет стандартное поведение браузера
  function onKeyDown(event) {
    // На устройствах без мыши (телефон, планшет) горячие клавиши отключены
    if (!device.snapshot().hasKeyboardShortcuts) return;
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isEditable(event.target)) return;

    const handlers = {
      Digit1: () => actions.onMic(SIDE.FROM),
      Numpad1: () => actions.onMic(SIDE.FROM),
      Digit2: () => actions.onMic(SIDE.TO),
      Numpad2: () => actions.onMic(SIDE.TO),
      KeyR: () => actions.onRetry(),
      KeyS: () => actions.onSwap(),
      Escape: () => actions.onEscape(),
    };
    const handler = handlers[event.code];
    if (!handler) return;
    event.preventDefault();
    handler();
  }

  // Подписывается на нажатия клавиш; возвращает функцию отписки
  function init() {
    doc.addEventListener('keydown', onKeyDown);
    return () => doc.removeEventListener('keydown', onKeyDown);
  }

  return { init, onKeyDown };
}
