// Репозиторий авторизации: вход по логину и паролю, хранение Bearer-токена и запросы к API с заголовком Authorization.
import { APP_PAGE, LOGIN_PAGE, LOGIN_URL, SESSION_URL, TOKEN_STORAGE_KEY } from '../config.js';
import { createSafeStorage } from '../utils/safeStorage.js';

// Достаёт из ответа сервера понятное сообщение об ошибке входа
function describeLoginError(data, status) {
  if (data && typeof data.detail === 'string') return data.detail;
  if (status === 422) return 'Введите логин и пароль';
  return `Ошибка сервера (${status})`;
}

// Создаёт репозиторий. Браузерные зависимости (fetch, хранилище, время, переход по адресу) подменяются в тестах
export function createAuthRepository({
  storage = createSafeStorage(),
  now = () => Date.now(),
  fetchFn = (...args) => fetch(...args),
  navigate = url => window.location.replace(url),
} = {}) {
  // Возвращает сохранённый токен, если он есть и срок его жизни не истёк; иначе удаляет устаревшую запись и возвращает null
  function getToken() {
    try {
      const saved = JSON.parse(storage.getItem(TOKEN_STORAGE_KEY));
      if (saved && typeof saved.token === 'string' && saved.token && saved.expiresAt > now()) return saved.token;
    } catch {
      // повреждённая запись — считаем, что токена нет
    }
    clear();
    return null;
  }

  // Забывает токен
  function clear() {
    try {
      storage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // хранилище недоступно — токена в нём всё равно нет
    }
  }

  // Отправляет логин и пароль; при успехе сохраняет токен, при ошибке бросает Error с понятным текстом
  async function login(username, password) {
    let response;
    try {
      response = await fetchFn(LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
    } catch {
      throw new Error('Не удалось связаться с сервером. Проверьте соединение');
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(describeLoginError(data, response.status));
    storage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({ token: data.access_token, expiresAt: now() + data.expires_in * 1000 }));
  }

  // Переходит на страницу входа (токен уже не нужен)
  function logout() {
    clear();
    navigate(LOGIN_PAGE);
  }

  // fetch с заголовком Authorization: Bearer. Если токена нет или сервер ответил 401 — токен забывается,
  // выполняется переход на страницу входа, а вызывающий код получает ошибку
  async function authFetch(url, init = {}) {
    const token = getToken();
    if (!token) {
      logout();
      throw new Error('Требуется вход');
    }
    const response = await fetchFn(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
    if (response.status === 401) {
      logout();
      throw new Error('Сессия истекла, войдите снова');
    }
    return response;
  }

  // Проверяет токен на сервере при открытии страницы (при 401 authFetch сам отправит на вход); сетевые сбои игнорируются
  async function verifySession() {
    try {
      await authFetch(SESSION_URL);
    } catch {
      // нет сети или сессия истекла (переход уже выполнен) — страница работает как обычно
    }
  }

  return { getToken, clear, login, logout, authFetch, verifySession, appPage: APP_PAGE, navigate };
}

// Общий экземпляр для приложения
export const authRepository = createAuthRepository();
