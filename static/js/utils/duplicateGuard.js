// Защита от повторной отправки одной и той же фразы подряд (экономит токены внешних API).

// Создаёт охранника: фраза считается дублем, если такая же была успешно отправлена менее windowMs назад
export function createDuplicateGuard(windowMs, now = Date.now) {
  let last = { text: '', time: 0 };

  return {
    // Проверяет, не дубль ли эта фраза недавно успешно отправленной
    isDuplicate(text) {
      return text === last.text && now() - last.time < windowMs;
    },
    // Запоминает фразу как успешно отправленную (вызывается только после удачного ответа сервера)
    markSent(text) {
      last = { text, time: now() };
    },
  };
}
