// Контроллер страницы входа: проверяет поля, вызывает вход и переводит в приложение.

// Создаёт контроллер из представления формы и репозитория авторизации
export function createLoginController({ view, auth }) {
  let busy = false;

  // Обрабатывает отправку формы: при успехе открывает приложение, при ошибке показывает сообщение
  async function submit() {
    if (busy) return;
    const { username, password } = view.values();
    if (!username || !password) {
      view.showError('Введите логин и пароль');
      view.focus(username ? 'password' : 'username');
      return;
    }
    busy = true;
    view.showError('');
    view.setBusy(true);
    try {
      await auth.login(username, password);
      auth.navigate(auth.appPage);
    } catch (error) {
      view.setBusy(false);
      view.showError(error.message);
      view.focus('password');
    } finally {
      busy = false;
    }
  }

  // Если токен уже есть, сразу открывает приложение; иначе показывает форму
  function init() {
    if (auth.getToken()) {
      auth.navigate(auth.appPage);
      return;
    }
    view.onSubmit(submit);
    view.focus('username');
  }

  return { init, submit };
}
