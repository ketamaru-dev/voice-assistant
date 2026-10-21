// Подписка на изменение media query с поддержкой старых браузеров (Safari < 14 знает только addListener).

// Подписывает handler на смену состояния query и возвращает функцию отписки
export function subscribeToMediaQuery(query, handler) {
  if (query.addEventListener) {
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }
  if (query.addListener) {
    query.addListener(handler);
    return () => query.removeListener(handler);
  }
  return () => {};
}
