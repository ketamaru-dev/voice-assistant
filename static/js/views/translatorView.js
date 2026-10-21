// Слой представления: всё, что связано с DOM (поиск элементов, вывод текста, состояния кнопок, события).
import { PHASE, SIDE } from '../config.js';

const SOURCE_PLACEHOLDER = 'Здесь появится распознанный текст…';
const TRANSLATION_PLACEHOLDER = 'Здесь появится перевод…';

// Создаёт представление поверх документа (его можно подменить в тестах)
export function createTranslatorView(doc = document) {
  const byId = id => doc.getElementById(id);
  const selects = { [SIDE.FROM]: byId('lang-from'), [SIDE.TO]: byId('lang-to') };
  const micButtons = { [SIDE.FROM]: byId('mic-from'), [SIDE.TO]: byId('mic-to') };
  const retryButton = byId('retry-btn');
  const statusEl = byId('status');
  const sourceEl = byId('source-text');
  const translationEl = byId('translated-text');

  // Выводит текст в блок; если текст пустой — показывает серую подсказку
  function showText(element, text, placeholder) {
    element.textContent = '';
    if (text) {
      element.textContent = text;
      return;
    }
    const hint = doc.createElement('span');
    hint.className = 't-faint';
    hint.textContent = placeholder;
    element.appendChild(hint);
  }

  return {
    // Возвращает код языка, выбранный в списке нужной стороны
    getLanguage(side) {
      return selects[side].value;
    },

    // Меняет выбранные языки местами
    swapLanguages() {
      [selects[SIDE.FROM].value, selects[SIDE.TO].value] = [selects[SIDE.TO].value, selects[SIDE.FROM].value];
    },

    // Показывает распознанный текст (пустая строка возвращает подсказку)
    showSource(text) {
      showText(sourceEl, text, SOURCE_PLACEHOLDER);
    },

    // Показывает перевод (пустая строка возвращает подсказку)
    showTranslation(text) {
      showText(translationEl, text, TRANSLATION_PLACEHOLDER);
    },

    // Отображает текущую фазу: подсветка активного микрофона, блокировки кнопок и текст статуса
    setPhase(phase, activeSide, statusText) {
      for (const side of Object.values(SIDE)) {
        const isActive = side === activeSide;
        micButtons[side].classList.toggle('recording', isActive && phase === PHASE.LISTENING);
        micButtons[side].classList.toggle('processing', isActive && phase === PHASE.PROCESSING);
        micButtons[side].disabled = phase === PHASE.PROCESSING;
      }
      // Переотправлять нельзя, пока идёт запись или перевод
      retryButton.disabled = phase === PHASE.LISTENING || phase === PHASE.PROCESSING;
      statusEl.textContent = statusText;
    },

    // Показывает или прячет кнопку «Переотправить»
    setRetryVisible(visible) {
      retryButton.hidden = !visible;
    },

    // Подписывает обработчик на клик по микрофону любой стороны: handler(side)
    onMicClick(handler) {
      for (const side of Object.values(SIDE)) micButtons[side].addEventListener('click', () => handler(side));
    },

    // Подписывает обработчик на кнопку смены языков
    onSwapClick(handler) {
      byId('swap-btn').addEventListener('click', handler);
    },

    // Подписывает обработчик на кнопку «Переотправить»
    onRetryClick(handler) {
      retryButton.addEventListener('click', handler);
    },
  };
}
