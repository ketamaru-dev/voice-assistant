// Безопасный доступ к localStorage: в приватном режиме и при запретах браузера используется запасное хранилище в памяти.

// Возвращает объект с интерфейсом getItem/setItem/removeItem, который никогда не бросает исключений при создании
export function createSafeStorage(win = typeof window !== 'undefined' ? window : undefined) {
  try {
    const probe = '__voiceTranslator_probe__';
    win.localStorage.setItem(probe, '1');
    win.localStorage.removeItem(probe);
    return win.localStorage;
  } catch {
    const memory = new Map();
    return {
      getItem: key => (memory.has(key) ? memory.get(key) : null),
      setItem: (key, value) => memory.set(key, String(value)),
      removeItem: key => memory.delete(key),
    };
  }
}
