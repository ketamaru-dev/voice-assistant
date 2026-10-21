// Классический (не модульный) скрипт: выполняется синхронно в <head> ДО первой отрисовки,
// чтобы страница сразу открывалась в нужной теме, без вспышки светлого фона у тёмной темы.
// Логика выбора совпадает с js/services/themeService.js: ручной выбор пользователя, иначе системная тема, иначе светлая.
(function () {
  var theme = 'light';
  try {
    var stored = window.localStorage.getItem('voiceTranslator.theme');
    if (stored === 'light' || stored === 'dark') {
      theme = stored;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'dark';
    }
  } catch (error) {
    // localStorage недоступен — остаётся светлая тема (или системная, если matchMedia сработал выше)
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark';
  }
  document.documentElement.setAttribute('data-theme', theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#000000' : '#f3f5fa');
})();
