// Представление формы входа: чтение полей, состояние «идёт вход», сообщение об ошибке, показ пароля.

// Создаёт представление поверх документа (подменяется в тестах)
export function createLoginView(doc = document) {
  const form = doc.getElementById('login-form');
  const username = doc.getElementById('login-username');
  const password = doc.getElementById('login-password');
  const submit = doc.getElementById('login-submit');
  const error = doc.getElementById('login-error');
  const reveal = doc.getElementById('login-reveal');

  return {
    // Значения полей формы: логин без пробелов по краям (мобильные клавиатуры часто добавляют пробел), пароль как есть
    values() {
      return { username: username.value.trim(), password: password.value };
    },

    // Подписывает обработчик отправки формы (кнопка и Enter); перезагрузка страницы отменяется
    onSubmit(handler) {
      form.addEventListener('submit', event => {
        event.preventDefault();
        handler();
      });
      reveal.addEventListener('click', () => {
        const visible = password.type === 'password';
        password.type = visible ? 'text' : 'password';
        reveal.setAttribute('aria-pressed', String(visible));
        reveal.setAttribute('aria-label', visible ? 'Скрыть пароль' : 'Показать пароль');
      });
    },

    // Блокирует форму на время запроса и меняет подпись кнопки
    setBusy(busy) {
      submit.disabled = busy;
      username.disabled = busy;
      password.disabled = busy;
      submit.textContent = busy ? 'Входим…' : 'Войти';
    },

    // Показывает или очищает сообщение об ошибке (пустая строка — очистить)
    showError(message) {
      error.textContent = message;
      username.setAttribute('aria-invalid', String(Boolean(message)));
      password.setAttribute('aria-invalid', String(Boolean(message)));
    },

    // Очищает пароль и ставит курсор в соответствующее поле
    focus(field) {
      if (field === 'password') password.value = '';
      (field === 'password' ? password : username).focus();
    },
  };
}
