// Контроллер темы: связывает сервис темы и переключатель.

// Создаёт контроллер из сервиса темы и представления переключателя
export function createThemeController({ themeService, toggleView }) {
  // Инициализирует тему (учитывая выбор пользователя и системную тему) и подписывает переключатель
  function init() {
    toggleView.render(themeService.init());

    // Выбор вручную: сохраняем, применяем и обновляем переключатель
    toggleView.onSelect(theme => {
      const applied = themeService.set(theme);
      toggleView.render(applied);
      toggleView.focus?.(applied);
    });

    // Системная тема изменилась (и пользователь свою не выбирал) — переключатель следует за ней
    themeService.onSystemChange(theme => toggleView.render(theme));
  }

  return { init };
}
