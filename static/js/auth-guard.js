// Классический (не модульный) скрипт в <head> страницы приложения: если действительного токена входа нет,
// сразу отправляет на страницу входа, не показывая интерфейс. Ключ и формат записи совпадают с js/repositories/authRepository.js.
(function () {
  var valid = false;
  try {
    var saved = JSON.parse(window.localStorage.getItem('voiceTranslator.token'));
    valid = Boolean(saved && typeof saved.token === 'string' && saved.token && saved.expiresAt > Date.now());
  } catch (error) {
    valid = false;
  }
  if (!valid) window.location.replace('/login');
})();
