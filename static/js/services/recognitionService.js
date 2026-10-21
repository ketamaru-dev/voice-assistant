// Сервис распознавания речи: обёртка над Web Speech API.
// Главное: «диктовка» может состоять из нескольких сессий браузера. Мобильные браузеры (особенно Chrome на Android)
// принудительно обрывают сессию примерно через минуту или при паузе, поэтому сервис незаметно перезапускает запись,
// а распознанный текст накапливает в едином буфере. Окончательно запись останавливается только по просьбе
// пользователя, по паузе тишины, при ошибке или при достижении лимита длины.
import { MAX_DICTATION_CHARS, MAX_EMPTY_RESTARTS, SILENCE_TIMEOUT_MS, SPEECH_LANGS, STOP_GUARD_MS } from '../config.js';
import { appendSegment, mergeResults, normalize } from '../utils/textUtils.js';

// Преобразует код ошибки распознавания в понятное пользователю сообщение
export function describeRecognitionError(code) {
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'Заблокирован микрофон в Android / Chrome';
  if (code === 'network') return 'Нужен доступ в интернет для распознавания';
  if (code === 'no-speech') return 'Речь не обнаружена';
  return 'Ошибка: ' + code;
}

// Создаёт сервис. SR — конструктор SpeechRecognition, timers — подменяемые таймеры (для тестов)
export function createRecognitionService({
  SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined,
  langs = SPEECH_LANGS,
  silenceMs = SILENCE_TIMEOUT_MS,
  maxEmptyRestarts = MAX_EMPTY_RESTARTS,
  stopGuardMs = STOP_GUARD_MS,
  maxChars = MAX_DICTATION_CHARS,
  timers = { setTimeout: (...args) => setTimeout(...args), clearTimeout: id => clearTimeout(id) },
} = {}) {
  // Активная диктовка; события от завершённых или прерванных диктовок и старых экземпляров SR игнорируются
  let current = null;

  // Поддерживает ли браузер распознавание речи
  function isSupported() {
    return Boolean(SR);
  }

  // Снимает таймер (если он есть) и возвращает null — удобно для присваивания полю сессии
  function clearTimer(id) {
    if (id) timers.clearTimeout(id);
    return null;
  }

  // Полный распознанный текст диктовки: накопленное из прошлых сессий плюс текущая сессия
  function totalText(session) {
    return appendSegment(session.committed, session.currentText, session.lang);
  }

  // Завершает диктовку и ровно один раз отдаёт накопленный текст вместе с кодом ошибки (или null)
  function finish(session, error) {
    if (session.finished) return;
    session.finished = true;
    session.silenceTimer = clearTimer(session.silenceTimer);
    session.stopGuardTimer = clearTimer(session.stopGuardTimer);
    if (current === session) current = null;
    session.onFinish({ text: normalize(session.lang, totalText(session).trim()), error });
  }

  // Просит браузер остановить запись окончательно (автоперезапуск после этого отключён).
  // Если onend не придёт в течение stopGuardMs, диктовка завершается принудительно.
  function requestStop(session) {
    if (session.finished) return;
    session.stopRequested = true;
    session.silenceTimer = clearTimer(session.silenceTimer);
    session.stopGuardTimer = timers.setTimeout(() => finish(session, null), stopGuardMs);
    try {
      session.rec.stop();
    } catch {
      finish(session, null);
    }
  }

  // Запускает новую сессию браузера внутри диктовки (первую или после автоперезапуска)
  function launch(session) {
    const rec = new SR();
    session.rec = rec;
    session.currentText = '';
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = langs[session.lang] || session.lang;

    // Событие устарело, если диктовка уже завершена/заменена или экземпляр SR больше не актуален
    const isStale = () => session !== current || session.rec !== rec || session.finished;

    // Каждый новый кусок речи: пересобираем текст сессии без дублей, перезапускаем таймер тишины, сообщаем интерфейсу
    rec.onresult = event => {
      if (isStale()) return;
      session.emptyRestarts = 0;
      session.silenceTimer = clearTimer(session.silenceTimer);
      session.currentText = mergeResults(event.results, session.lang);
      const total = totalText(session);
      session.onUpdate(normalize(session.lang, total));
      if (total.length >= maxChars) return requestStop(session); // достигли предела длины диктовки
      session.silenceTimer = timers.setTimeout(() => requestStop(session), silenceMs);
    };

    // Ошибки не вызывают перезапуск: так приложение не уходит в бесконечный цикл
    rec.onerror = event => {
      if (isStale() || event.error === 'aborted') return;
      // «no-speech» при уже накопленном тексте — обычная тишина после речи, а не ошибка
      if (event.error === 'no-speech' && totalText(session)) return finish(session, null);
      finish(session, event.error);
    };

    // Браузер закончил сессию: если остановку просил пользователь (или таймер тишины) — завершаем,
    // иначе это обрыв по таймауту браузера, и запись незаметно перезапускается
    rec.onend = () => {
      if (isStale()) return;
      if (session.stopRequested) return finish(session, null);
      restart(session);
    };

    rec.start();
  }

  // Незаметно перезапускает запись после обрыва сессии браузером, сохраняя накопленный текст
  function restart(session) {
    session.committed = totalText(session);
    session.currentText = '';
    // Если после нескольких перезапусков подряд не пришло ни слова, останавливаемся (защита от цикла)
    if (session.emptyRestarts >= maxEmptyRestarts) return finish(session, null);
    session.emptyRestarts += 1;
    try {
      launch(session);
    } catch {
      // Браузер не дал перезапустить запись: отдаём то, что уже накоплено
      finish(session, null);
    }
  }

  // Запускает диктовку. onUpdate(text) вызывается по ходу речи, onFinish({text, error}) — ровно один раз по завершении
  function start({ lang, onUpdate, onFinish }) {
    abortCurrent();
    const session = {
      lang, onUpdate, onFinish, rec: null,
      committed: '', currentText: '',
      emptyRestarts: 0, stopRequested: false, finished: false,
      silenceTimer: null, stopGuardTimer: null,
    };
    current = session;
    try {
      launch(session);
    } catch (error) {
      current = null;
      throw error;
    }
  }

  // Тихо прерывает активную диктовку без вызова onFinish (используется перед запуском новой)
  function abortCurrent() {
    if (!current) return;
    const session = current;
    current = null;
    session.finished = true;
    session.silenceTimer = clearTimer(session.silenceTimer);
    session.stopGuardTimer = clearTimer(session.stopGuardTimer);
    try { session.rec.abort(); } catch { /* сессия уже завершена */ }
  }

  // Явная остановка пользователем («Стоп»): запись прекращается окончательно, автоперезапуск отключается.
  // Накопленный текст придёт в onFinish.
  function stop() {
    if (current) requestStop(current);
  }

  return { isSupported, start, stop };
}
