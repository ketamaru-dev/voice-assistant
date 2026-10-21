// Представление переключателя темы: слайдер с иконками солнца и луны (обе видны сразу).
import { THEME } from '../config.js';

// Создаёт представление поверх документа (подменяется в тестах)
export function createThemeToggleView(doc = document) {
  const toggle = doc.getElementById('theme-toggle');
  const options = {
    [THEME.LIGHT]: doc.getElementById('theme-light'),
    [THEME.DARK]: doc.getElementById('theme-dark'),
  };

  return {
    // Отмечает активный вариант для вспомогательных технологий (aria-checked); вид слайдера задаёт CSS по data-theme
    render(theme) {
      for (const [name, button] of Object.entries(options)) {
        button.setAttribute('aria-checked', String(name === theme));
        button.tabIndex = name === theme ? 0 : -1;
      }
    },

    // Подписывает обработчик на выбор темы: handler(themeName). Подходит и мышь, и касание
    onSelect(handler) {
      for (const [name, button] of Object.entries(options)) button.addEventListener('click', () => handler(name));
      // Стрелки влево/вправо переключают тему с клавиатуры, как в стандартной группе радиокнопок
      toggle.addEventListener('keydown', event => {
        if (event.key === 'ArrowLeft') handler(THEME.LIGHT);
        if (event.key === 'ArrowRight') handler(THEME.DARK);
      });
    },

    // Переводит фокус на кнопку выбранной темы (после переключения с клавиатуры)
    focus(theme) {
      options[theme].focus();
    },
  };
}
