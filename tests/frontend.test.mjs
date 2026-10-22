// Тесты фронтенда (ES-модули из static/js). Запуск из корня проекта:
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/frontend.test.mjs
// Внешние зависимости (fetch, SpeechRecognition, localStorage, DOM) подменяются заглушками.
import { PHASE, SIDE, THEME, THEME_COLORS, THEME_STORAGE_KEY } from '../static/js/config.js';
import { createTranslatorView } from '../static/js/views/translatorView.js';
import { createThemeController } from '../static/js/controllers/themeController.js';
import { createKeyboardController } from '../static/js/controllers/keyboardController.js';
import { createThemeService } from '../static/js/services/themeService.js';
import { createDeviceService } from '../static/js/services/deviceService.js';
import { createTranslatorController } from '../static/js/controllers/translatorController.js';
import { createAuthRepository } from '../static/js/repositories/authRepository.js';
import { createLoginController } from '../static/js/controllers/loginController.js';
import { createLoginView } from '../static/js/views/loginView.js';
import { createPlaybackService } from '../static/js/services/playbackService.js';
import { createPendingRepository } from '../static/js/repositories/pendingRepository.js';
import { requestTranslation } from '../static/js/repositories/translateRepository.js';
import { createRecognitionService, describeRecognitionError } from '../static/js/services/recognitionService.js';
import { createTranslationService } from '../static/js/services/translationService.js';
import { createSafeStorage } from '../static/js/utils/safeStorage.js';
import { subscribeToMediaQuery } from '../static/js/utils/mediaQuery.js';
import { createThemeToggleView } from '../static/js/views/themeToggleView.js';
import { createDuplicateGuard } from '../static/js/utils/duplicateGuard.js';
import { appendSegment, mergeResults, normalize, serbianToLatin } from '../static/js/utils/textUtils.js';

const log = typeof print === 'function' ? print : console.log;
// В JavaScriptCore (jsc) нет console — подставляем заглушку, чтобы код приложения мог логировать
if (typeof console === 'undefined') globalThis.console = { log() {}, warn() {}, error() {}, info() {} };
let passed = 0;
let failed = 0;
const queue = [];

// Регистрирует тест (синхронный или асинхронный); выполняются по очереди после загрузки модуля
function test(name, fn) {
  queue.push({ name, fn });
}

// Сравнивает значения как JSON и бросает ошибку с понятным сообщением
function eq(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}\n         ожидалось: ${e}\n         получено:  ${a}`);
}

// Утверждение истинности
function ok(value, label = 'ожидалось true') {
  if (!value) throw new Error(label);
}

// ---------- textUtils ----------
// Строит список результатов Web Speech API: строка = финальный результат, объект {t, final:false} = промежуточный
const mk = items => items.map(x => {
  const result = [{ transcript: typeof x === 'string' ? x : x.t }];
  result.isFinal = typeof x === 'string' ? true : x.final !== false;
  return result;
});
const merge = (items, lang = 'ru') => mergeResults(mk(items), lang);

test('merge: накопительные куски -> последний', () => eq(merge(['смотрю', 'смотрю как', 'смотрю как это', 'смотрю как это всё работает']), 'смотрю как это всё работает'));
test('merge: финал с заглавной и точкой заменяет промежуточный', () => eq(merge(['смотрю как это всё работает', 'Смотрю, как это всё работает.']), 'Смотрю, как это всё работает.'));
test('merge: короткий повтор после длинного пропускается', () => eq(merge(['Смотрю, как это всё работает.', 'смотрю как это']), 'Смотрю, как это всё работает.'));
test('merge: английский с разным регистром', () => eq(merge(['Hello how are you', 'Hello, how are you?', 'hello how are you'], 'en'), 'hello how are you'));
test('merge: независимые куски склеиваются', () => eq(merge(['привет как', 'дела у тебя']), 'привет как дела у тебя'));
test('merge: перекрытие хвоста и начала', () => eq(merge(['привет как дела', 'как дела у тебя']), 'привет как дела у тебя'));
test('merge: фраза, повторённая целиком, сворачивается', () => eq(merge(['привет привет привет']), 'привет'));
test('merge: частичный повтор не сворачивается', () => eq(merge(['очень очень хорошо']), 'очень очень хорошо'));
test('merge: пустые результаты', () => { eq(merge([]), ''); eq(merge(['', '  ', '.']), ''); });
test('merge: исправленная версия (случай со скриншота)', () => eq(
  merge(['Привет сколько ты всё стоит сколько здесь', 'Привет Сколько это всё стоит сколько здесь будет']),
  'Привет Сколько это всё стоит сколько здесь будет'));
test('merge: разные предложения с одним первым словом не сливаются', () => eq(merge(['Я пошёл домой', 'Я вернулся обратно']), 'Я пошёл домой Я вернулся обратно'));
test('merge: устаревшие промежуточные пропускаются', () => eq(merge([{ t: 'привет', final: false }, { t: 'привет как', final: false }, { t: 'привет как дела', final: false }]), 'привет как дела'));
test('merge: финальный + последний промежуточный', () => eq(merge(['Привет, как дела?', { t: 'что нового', final: false }]), 'Привет, как дела? что нового'));
test('merge: китайский и японский без пробелов', () => { eq(merge(['你好', '你好吗'], 'zh'), '你好吗'); eq(merge(['こんにちは', 'ありがとう'], 'ja'), 'こんにちはありがとう'); });
test('serbianToLatin: диграфы и регистр', () => eq(serbianToLatin('Љубав Њива Џем Ђурђевдан'), 'Ljubav Njiva Džem Đurđevdan'));
test('normalize: только сербский переводится в латиницу', () => { eq(normalize('sr', 'Здраво'), 'Zdravo'); eq(normalize('ru', 'Здраво'), 'Здраво'); });
test('merge: длинный текст на 10000 символов обрабатывается', () => {
  // Разные слова (а не один повтор), иначе защита от «зацикленного» текста свернёт его
  const big = Array.from({ length: 1700 }, (_, i) => `слово${i}`).join(' ');
  eq(merge([big]), big);
  ok(big.length > 9000, 'тестовый текст достаточно длинный');
});

// ---------- duplicateGuard ----------
test('duplicateGuard: дубль только в окне после успешной отправки', () => {
  let t = 1000;
  const guard = createDuplicateGuard(8000, () => t);
  ok(!guard.isDuplicate('привет'), 'до отправки не дубль');
  guard.markSent('привет');
  ok(guard.isDuplicate('привет'), 'сразу после — дубль');
  ok(!guard.isDuplicate('пока'), 'другая фраза — не дубль');
  t += 8001;
  ok(!guard.isDuplicate('привет'), 'после окна — не дубль');
});

// ---------- pendingRepository ----------
// Простейшее хранилище в памяти, совместимое с интерфейсом localStorage
const memoryStorage = () => {
  const data = new Map();
  return { getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k), data };
};

test('pending: save -> load -> clear', () => {
  const repo = createPendingRepository({ storage: memoryStorage(), key: 'k', maxAgeMs: 1000 });
  eq(repo.load(), null);
  repo.save({ text: 'привет', sourceLang: 'ru', targetLang: 'sr' });
  eq(repo.load(), { text: 'привет', sourceLang: 'ru', targetLang: 'sr' });
  repo.clear();
  eq(repo.load(), null);
});
test('pending: устаревшая запись удаляется', () => {
  let t = 0;
  const storage = memoryStorage();
  const repo = createPendingRepository({ storage, key: 'k', maxAgeMs: 1000, now: () => t });
  repo.save({ text: 'привет', sourceLang: 'ru', targetLang: 'en' });
  t = 1001;
  eq(repo.load(), null);
  eq(storage.data.size, 0, 'запись должна быть удалена');
});
test('pending: повреждённые данные не ломают приложение', () => {
  const storage = memoryStorage();
  storage.setItem('k', '{not json');
  eq(createPendingRepository({ storage, key: 'k', maxAgeMs: 1000 }).load(), null);
  storage.setItem('k', JSON.stringify({ text: '  ', sourceLang: 'ru', targetLang: 'en', savedAt: 1 }));
  eq(createPendingRepository({ storage, key: 'k', maxAgeMs: 1e12, now: () => 2 }).load(), null, 'пустой текст');
});
test('pending: ошибка хранилища (квота) не бросает исключение', () => {
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('x'); } };
  const repo = createPendingRepository({ storage: broken, key: 'k', maxAgeMs: 1000 });
  repo.save({ text: 'a', sourceLang: 'ru', targetLang: 'en' });
  eq(repo.load(), null);
  repo.clear();
});

// ---------- translateRepository / translationService ----------
const fakeResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => { if (body === undefined) throw new Error('no json'); return body; } });

test('translateRepository: успешный запрос отправляет JSON с snake_case полями', async () => {
  let sent;
  const fetchFn = async (url, init) => { sent = { url, body: JSON.parse(init.body), method: init.method }; return fakeResponse(200, { translated_text: 'Hello' }); };
  const data = await requestTranslation({ text: 'Привет', sourceLang: 'ru', targetLang: 'en' }, { fetchFn, url: '/x' });
  eq(data, { translated_text: 'Hello' });
  eq(sent, { url: '/x', body: { text: 'Привет', source_lang: 'ru', target_lang: 'en' }, method: 'POST' });
});
test('translateRepository: сообщение об ошибке берётся из detail', async () => {
  const fetchFn = async () => fakeResponse(429, { detail: 'Слишком много запросов' });
  let message = '';
  try { await requestTranslation({ text: 'a', sourceLang: 'ru', targetLang: 'en' }, { fetchFn }); } catch (e) { message = e.message; }
  eq(message, 'Слишком много запросов');
});
test('translateRepository: 422 со списком detail и ответ без JSON', async () => {
  const run = async response => {
    try { await requestTranslation({ text: 'a', sourceLang: 'ru', targetLang: 'en' }, { fetchFn: async () => response }); } catch (e) { return e.message; }
    return '';
  };
  eq(await run(fakeResponse(422, { detail: [{ msg: 'x' }] })), 'Некорректный запрос (проверьте длину текста)');
  eq(await run(fakeResponse(502, undefined)), 'Ошибка сервера (502)');
});
test('translationService: сербский перевод приводится к латинице', async () => {
  const service = createTranslationService({ requestTranslation: async () => ({ translated_text: 'Здраво', audio_url: '/api/audio/a.mp3' }) });
  eq(await service.translate({ text: 'Привет', sourceLang: 'ru', targetLang: 'sr' }), { original: 'Привет', translated: 'Zdravo', audioUrl: '/api/audio/a.mp3' });
});

// ---------- recognitionService ----------
// Заглушка SpeechRecognition: сохраняет экземпляры, чтобы тест мог «генерировать» события
// autoEnd=false: stop() не вызывает onend (имитация зависшего браузера); failStartAfter=N: N-й по счёту start() бросает ошибку
const makeFakeSR = ({ autoEnd = true, failStartAfter = Infinity } = {}) => {
  const instances = [];
  class FakeSR {
    constructor() { instances.push(this); this.started = false; this.aborted = false; this.index = instances.length; }
    start() { if (this.index >= failStartAfter) throw new Error('InvalidStateError'); this.started = true; }
    stop() { this.stopped = true; if (autoEnd && this.onend) this.onend(); }
    abort() { this.aborted = true; }
  }
  return { FakeSR, instances };
};
// Ручные таймеры: callback выполняется только при вызове tick()
const makeFakeTimers = () => {
  let nextId = 1;
  const pendingTimers = new Map();
  return {
    timers: { setTimeout: cb => { pendingTimers.set(nextId, cb); return nextId++; }, clearTimeout: id => pendingTimers.delete(id) },
    tick: () => { const cbs = [...pendingTimers.values()]; pendingTimers.clear(); cbs.forEach(cb => cb()); },
    count: () => pendingTimers.size,
  };
};
const speechEvent = items => ({ results: mk(items), resultIndex: 0 });

test('recognition: речь -> пауза -> onFinish с текстом ровно один раз', () => {
  const { FakeSR, instances } = makeFakeSR();
  const t = makeFakeTimers();
  const service = createRecognitionService({ SR: FakeSR, timers: t.timers });
  const updates = [];
  const finished = [];
  service.start({ lang: 'ru', onUpdate: x => updates.push(x), onFinish: x => finished.push(x) });
  instances[0].onresult(speechEvent(['привет']));
  instances[0].onresult(speechEvent(['привет', 'привет как дела']));
  eq(updates, ['привет', 'привет как дела']);
  eq(t.count(), 1, 'таймер тишины перезапускается, а не копится');
  t.tick();
  instances[0].onend();
  eq(finished, [{ text: 'привет как дела', error: null }]);
});
test('recognition: ошибка network с частичным текстом завершает сессию сразу', () => {
  const { FakeSR, instances } = makeFakeSR();
  const service = createRecognitionService({ SR: FakeSR, timers: makeFakeTimers().timers });
  const finished = [];
  service.start({ lang: 'ru', onUpdate() {}, onFinish: x => finished.push(x) });
  instances[0].onresult(speechEvent(['привет как']));
  instances[0].onerror({ error: 'network' });
  instances[0].onend();
  eq(finished, [{ text: 'привет как', error: 'network' }]);
});
test('recognition: события старой (прерванной) сессии игнорируются', () => {
  const { FakeSR, instances } = makeFakeSR();
  const service = createRecognitionService({ SR: FakeSR, timers: makeFakeTimers().timers });
  const finished = [];
  service.start({ lang: 'ru', onUpdate() {}, onFinish: x => finished.push(['first', x]) });
  service.start({ lang: 'en', onUpdate() {}, onFinish: x => finished.push(['second', x]) });
  ok(instances[0].aborted, 'первая сессия должна быть прервана');
  instances[0].onerror({ error: 'aborted' });
  instances[0].onend();
  eq(finished, [], 'старая сессия ничего не отправляет');
  instances[1].onresult(speechEvent(['hello']));
  service.stop();
  eq(finished, [['second', { text: 'hello', error: null }]]);
});
test('recognition: сербский текст приходит латиницей', () => {
  const { FakeSR, instances } = makeFakeSR();
  const service = createRecognitionService({ SR: FakeSR, timers: makeFakeTimers().timers });
  const finished = [];
  service.start({ lang: 'sr', onUpdate() {}, onFinish: x => finished.push(x) });
  instances[0].onresult(speechEvent(['Здраво, како си?']));
  service.stop();
  eq(finished[0].text, 'Zdravo, kako si?');
});
test('recognition: ошибка synchronous start пробрасывается и не оставляет сессию', () => {
  class ThrowingSR { start() { throw new Error('boom'); } abort() {} }
  const service = createRecognitionService({ SR: ThrowingSR, timers: makeFakeTimers().timers });
  let message = '';
  try { service.start({ lang: 'ru', onUpdate() {}, onFinish() {} }); } catch (e) { message = e.message; }
  eq(message, 'boom');
});
test('recognition: isSupported и сообщения об ошибках', () => {
  ok(!createRecognitionService({ SR: undefined }).isSupported());
  eq(describeRecognitionError('not-allowed'), 'Заблокирован микрофон в Android / Chrome');
  eq(describeRecognitionError('network'), 'Нужен доступ в интернет для распознавания');
  eq(describeRecognitionError('no-speech'), 'Речь не обнаружена');
  eq(describeRecognitionError('audio-capture'), 'Ошибка: audio-capture');
});

// ---------- recognition: автоперезапуск, накопление текста, «Стоп» ----------
// Запускает диктовку на заглушках и возвращает всё необходимое для проверок
function startDictation({ lang = 'ru', srOptions = {}, serviceOptions = {} } = {}) {
  const { FakeSR, instances } = makeFakeSR(srOptions);
  const t = makeFakeTimers();
  const service = createRecognitionService({ SR: FakeSR, timers: t.timers, ...serviceOptions });
  const updates = [];
  const finished = [];
  service.start({ lang, onUpdate: x => updates.push(x), onFinish: x => finished.push(x) });
  return { service, instances, t, updates, finished };
}

test('appendSegment: накапливает, не дублирует, заменяет более полной версией', () => {
  eq(appendSegment('', 'привет', 'ru'), 'привет');
  eq(appendSegment('привет', '  ', 'ru'), 'привет');
  eq(appendSegment('привет как дела', 'как дела', 'ru'), 'привет как дела');
  eq(appendSegment('привет', 'привет как дела', 'ru'), 'привет как дела');
  eq(appendSegment('привет как дела', 'что нового', 'ru'), 'привет как дела что нового');
  eq(appendSegment('你好', '你好吗', 'zh'), '你好吗');
  eq(appendSegment('こんにちは', 'ありがとう', 'ja'), 'こんにちはありがとう');
});
test('recognition: обрыв сессии браузером -> незаметный перезапуск, текст накапливается', () => {
  const d = startDictation();
  d.instances[0].onresult(speechEvent(['привет как дела']));
  d.instances[0].onend(); // браузер сам оборвал сессию (~60 с)
  eq(d.instances.length, 2, 'должна стартовать новая сессия');
  ok(d.instances[1].started, 'новая сессия запущена');
  eq(d.finished, [], 'пользователю ничего не сообщается');
  d.instances[1].onresult(speechEvent(['что нового']));
  eq(d.updates[d.updates.length - 1], 'привет как дела что нового', 'прежний текст не потерян');
  d.t.tick(); // пауза тишины -> остановка
  eq(d.finished, [{ text: 'привет как дела что нового', error: null }]);
});
test('recognition: несколько перезапусков подряд сохраняют весь текст', () => {
  const d = startDictation();
  d.instances[0].onresult(speechEvent(['первая часть']));
  d.instances[0].onend();
  d.instances[1].onresult(speechEvent(['вторая часть']));
  d.instances[1].onend();
  d.instances[2].onresult(speechEvent(['третья часть']));
  d.t.tick();
  eq(d.finished, [{ text: 'первая часть вторая часть третья часть', error: null }]);
});
test('recognition: «Стоп» завершает запись окончательно, перезапуска нет', () => {
  const d = startDictation();
  d.instances[0].onresult(speechEvent(['привет']));
  d.service.stop();
  eq(d.instances.length, 1, 'новая сессия не создаётся');
  eq(d.finished, [{ text: 'привет', error: null }]);
  d.instances[0].onend();
  eq(d.finished.length, 1, 'onFinish вызывается один раз');
});
test('recognition: «Стоп» после перезапуска тоже окончательный', () => {
  const d = startDictation();
  d.instances[0].onresult(speechEvent(['привет']));
  d.instances[0].onend();
  d.service.stop();
  eq(d.instances.length, 2);
  eq(d.finished, [{ text: 'привет', error: null }]);
});
test('recognition: если после «Стоп» браузер не шлёт onend, срабатывает страховочный таймер', () => {
  const d = startDictation({ srOptions: { autoEnd: false } });
  d.instances[0].onresult(speechEvent(['привет']));
  d.service.stop();
  eq(d.finished, [], 'пока ждём onend');
  d.t.tick();
  eq(d.finished, [{ text: 'привет', error: null }]);
});
test('recognition: защита от бесконечного цикла — после 3 пустых перезапусков запись завершается', () => {
  const d = startDictation();
  for (let i = 0; i < 10 && d.finished.length === 0; i++) d.instances[d.instances.length - 1].onend();
  eq(d.instances.length, 4, 'первая сессия + 3 перезапуска, дальше стоп');
  eq(d.finished, [{ text: '', error: null }]);
});
test('recognition: слова между перезапусками сбрасывают счётчик пустых перезапусков', () => {
  const d = startDictation();
  for (let i = 0; i < 6; i++) {
    d.instances[d.instances.length - 1].onresult(speechEvent([`слово${i}`]));
    d.instances[d.instances.length - 1].onend();
  }
  eq(d.finished, [], 'запись продолжается, пока приходит речь');
  eq(d.instances.length, 7);
});
test('recognition: no-speech без текста завершает запись без перезапуска', () => {
  const d = startDictation();
  d.instances[0].onerror({ error: 'no-speech' });
  d.instances[0].onend();
  eq(d.instances.length, 1);
  eq(d.finished, [{ text: '', error: 'no-speech' }]);
});
test('recognition: no-speech после накопленного текста — обычное завершение, текст сохраняется', () => {
  const d = startDictation();
  d.instances[0].onresult(speechEvent(['привет']));
  d.instances[0].onend();
  d.instances[1].onerror({ error: 'no-speech' });
  eq(d.finished, [{ text: 'привет', error: null }]);
});
test('recognition: network после перезапуска не зацикливается и сохраняет накопленное', () => {
  const d = startDictation();
  d.instances[0].onresult(speechEvent(['привет как']));
  d.instances[0].onend();
  d.instances[1].onerror({ error: 'network' });
  d.instances[1].onend();
  eq(d.instances.length, 2, 'третьей сессии нет');
  eq(d.finished, [{ text: 'привет как', error: 'network' }]);
});
test('recognition: not-allowed не перезапускается', () => {
  const d = startDictation();
  d.instances[0].onerror({ error: 'not-allowed' });
  d.instances[0].onend();
  eq(d.instances.length, 1);
  eq(d.finished, [{ text: '', error: 'not-allowed' }]);
});
test('recognition: если перезапуск невозможен, отдаётся накопленный текст', () => {
  const d = startDictation({ srOptions: { failStartAfter: 2 } });
  d.instances[0].onresult(speechEvent(['привет как дела']));
  d.instances[0].onend();
  eq(d.finished, [{ text: 'привет как дела', error: null }]);
});
test('recognition: события устаревшего экземпляра после перезапуска игнорируются', () => {
  const d = startDictation();
  d.instances[0].onresult(speechEvent(['привет']));
  d.instances[0].onend();
  d.instances[0].onresult(speechEvent(['мусор из старой сессии']));
  d.instances[0].onerror({ error: 'network' });
  eq(d.finished, []);
  d.instances[1].onresult(speechEvent(['пока']));
  eq(d.updates[d.updates.length - 1], 'привет пока');
});
test('recognition: таймер тишины переживает перезапуск и завершает запись', () => {
  const d = startDictation();
  d.instances[0].onresult(speechEvent(['привет как дела']));
  d.instances[0].onend(); // обрыв во время ожидания тишины
  d.t.tick();             // тишина выдержана -> остановка новой сессии
  eq(d.finished, [{ text: 'привет как дела', error: null }]);
});
test('recognition: при достижении предела длины запись останавливается сама', () => {
  const d = startDictation({ serviceOptions: { maxChars: 20 } });
  d.instances[0].onresult(speechEvent(['это довольно длинная фраза для проверки']));
  eq(d.finished.length, 1);
  eq(d.finished[0].error, null);
});
test('recognition: сербский накапливается через перезапуск и приходит латиницей', () => {
  const d = startDictation({ lang: 'sr' });
  d.instances[0].onresult(speechEvent(['Здраво']));
  d.instances[0].onend();
  d.instances[1].onresult(speechEvent(['како си']));
  d.t.tick();
  eq(d.finished, [{ text: 'Zdravo kako si', error: null }]);
});

// ---------- deviceService / keyboardController ----------
// Поддельный matchMedia: условия задаются словарём {запрос: matches}; события change вызываются вручную
function makeMatchMedia(state) {
  const queries = [];
  const matchMedia = query => {
    const listeners = [];
    const mq = {
      get matches() { return Boolean(state[query]); },
      addEventListener: (type, cb) => listeners.push(cb),
      removeEventListener: (type, cb) => listeners.splice(listeners.indexOf(cb), 1),
      fire: () => listeners.slice().forEach(cb => cb()),
      listeners,
    };
    queries.push(mq);
    return mq;
  };
  return { matchMedia, queries };
}
const PHONE = { '(pointer: coarse)': true, '(max-width: 767px)': true };
const DESKTOP = { '(hover: hover) and (pointer: fine)': true };

test('device: телефон определяется как touch + compact, атрибуты пишутся в <html>', () => {
  const root = { dataset: {} };
  const device = createDeviceService({ matchMedia: makeMatchMedia(PHONE).matchMedia, root });
  eq(device.apply(), { canHover: false, isTouch: true, isCompact: true, hasKeyboardShortcuts: false });
  eq(root.dataset, { device: 'touch', screen: 'compact' });
});
test('device: ПК определяется как desktop с горячими клавишами', () => {
  const root = { dataset: {} };
  const device = createDeviceService({ matchMedia: makeMatchMedia(DESKTOP).matchMedia, root });
  eq(device.apply(), { canHover: true, isTouch: false, isCompact: false, hasKeyboardShortcuts: true });
  eq(root.dataset, { device: 'desktop', screen: 'wide' });
});
test('device: гибрид (сенсорный экран + мышь) считается desktop, а не touch', () => {
  const device = createDeviceService({ matchMedia: makeMatchMedia({ ...PHONE, ...DESKTOP }).matchMedia, root: { dataset: {} } });
  const info = device.snapshot();
  ok(info.canHover && !info.isTouch);
});
test('device: изменение условий обновляет атрибуты и вызывает подписчика; отписка работает', () => {
  const state = { ...DESKTOP };
  const { matchMedia, queries } = makeMatchMedia(state);
  const root = { dataset: {} };
  const device = createDeviceService({ matchMedia, root });
  const seen = [];
  const off = device.onChange(info => seen.push(info.isCompact));
  state['(max-width: 767px)'] = true; // окно сузили
  queries.forEach(q => q.fire());
  ok(seen.length >= 1 && seen[0] === true, 'подписчик получил новое состояние');
  eq(root.dataset.screen, 'compact');
  off();
  eq(queries.every(q => q.listeners.length === 0), true, 'слушатели сняты');
});

// Собирает клавиатурный контроллер с записью вызванных действий
function makeKeyboard(deviceState) {
  const calls = [];
  let handler;
  const doc = { addEventListener: (type, cb) => { handler = cb; }, removeEventListener() {} };
  const device = createDeviceService({ matchMedia: makeMatchMedia(deviceState).matchMedia, root: { dataset: {} } });
  const keyboard = createKeyboardController({
    doc, device,
    actions: { onMic: s => calls.push(['mic', s]), onRetry: () => calls.push(['retry']), onSwap: () => calls.push(['swap']), onEscape: () => calls.push(['esc']) },
  });
  keyboard.init();
  const press = (code, extra = {}) => {
    const event = { code, target: { tagName: 'BODY' }, preventDefault() { event.prevented = true; }, ...extra };
    handler(event);
    return event;
  };
  return { calls, press };
}
test('keyboard (ПК): 1/2/R/S/Esc вызывают нужные действия и блокируют стандартное поведение', () => {
  const k = makeKeyboard(DESKTOP);
  const events = ['Digit1', 'Digit2', 'Numpad1', 'KeyR', 'KeyS', 'Escape'].map(code => k.press(code));
  eq(k.calls, [['mic', 'from'], ['mic', 'to'], ['mic', 'from'], ['retry'], ['swap'], ['esc']]);
  ok(events.every(e => e.prevented), 'preventDefault вызван');
});
test('keyboard: работает независимо от раскладки (используется event.code)', () => {
  const k = makeKeyboard(DESKTOP);
  k.press('KeyR', { key: 'к' }); // русская раскладка
  eq(k.calls, [['retry']]);
});
test('keyboard (телефон): горячие клавиши отключены', () => {
  const k = makeKeyboard(PHONE);
  k.press('Digit1'); k.press('Escape');
  eq(k.calls, []);
});
test('keyboard: игнорирует комбинации с модификаторами, автоповтор и поля выбора', () => {
  const k = makeKeyboard(DESKTOP);
  k.press('KeyR', { ctrlKey: true });   // Ctrl+R — перезагрузка страницы
  k.press('KeyS', { metaKey: true });   // Cmd+S
  k.press('Digit1', { repeat: true });  // удержание клавиши
  k.press('KeyS', { target: { tagName: 'SELECT' } }); // выбор языка в списке
  k.press('Space');                     // неизвестная клавиша
  eq(k.calls, []);
});
test('controller: Esc останавливает запись, а во время озвучки — прерывает её', async () => {
  const h = makeController({ holdPlayback: true });
  h.view.micHandler(SIDE.FROM);          // идёт запись
  h.controller.onEscape();               // recognition.stop() заглушки ничего не делает, но не должен падать
  h.finish({ text: 'Привет', error: null });
  await flush();                         // озвучка удерживается
  eq(h.lastStatus(), [PHASE.SPEAKING, 'Озвучиваю...']);
  const before = h.calls.playbackStops;
  h.controller.onEscape();
  ok(h.calls.playbackStops > before, 'озвучка остановлена');
  eq(h.lastStatus(), [PHASE.IDLE, 'Нажмите для записи']);
});

// ---------- темы оформления ----------
const DARK_QUERY = '(prefers-color-scheme: dark)';
// matchMedia заглушка должна уметь менять состояние «на лету»: используем общий объект состояния
function makeLiveTheme(options = {}) {
  const state = { [DARK_QUERY]: Boolean(options.systemDark) };
  const media = makeMatchMedia(state);
  const storage = options.storage || memoryStorage();
  if (options.stored) storage.setItem(THEME_STORAGE_KEY, options.stored);
  const classes = new Set();
  const root = { dataset: {}, classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) } };
  const meta = { content: '', setAttribute(name, value) { if (name === 'content') this.content = value; } };
  const service = createThemeService({ matchMedia: media.matchMedia, storage, root, metaThemeColor: meta });
  return { service, root, meta, storage, classes, setSystemDark(v) { state[DARK_QUERY] = v; media.queries.forEach(q => q.fire()); } };
}

test('theme: по умолчанию светлая (нет выбора пользователя и системной тёмной)', () => {
  const h = makeLiveTheme();
  eq(h.service.init(), THEME.LIGHT);
  eq(h.root.dataset.theme, 'light');
  eq(h.meta.content, THEME_COLORS.light);
});
test('theme: системная тёмная тема включает тёмную', () => {
  const h = makeLiveTheme({ systemDark: true });
  eq(h.service.init(), THEME.DARK);
  eq(h.root.dataset.theme, 'dark');
  eq(h.meta.content, THEME_COLORS.dark);
});
test('theme: ручной выбор важнее системной темы', () => {
  eq(makeLiveTheme({ systemDark: true, stored: 'light' }).service.init(), THEME.LIGHT);
  eq(makeLiveTheme({ systemDark: false, stored: 'dark' }).service.init(), THEME.DARK);
});
test('theme: недопустимое сохранённое значение игнорируется', () => {
  eq(makeLiveTheme({ systemDark: true, stored: 'purple' }).service.init(), THEME.DARK);
});
test('theme: set сохраняет выбор и мгновенно применяет тему без классов анимации', () => {
  const h = makeLiveTheme();
  h.service.init();
  eq(h.service.set(THEME.DARK), 'dark');
  eq(h.storage.getItem(THEME_STORAGE_KEY), 'dark');
  eq(h.root.dataset.theme, 'dark');
  eq(h.meta.content, THEME_COLORS.dark);
  eq([...h.classes], [], 'тяжёлые переходы цветов отключены');
  eq(h.service.resolve(), 'dark', 'выбор переживает «перезагрузку»');
});
test('theme: быстрые повторные переключения оставляют последнюю тему', () => {
  const h = makeLiveTheme();
  h.service.set(THEME.DARK); h.service.set(THEME.LIGHT); h.service.set(THEME.DARK);
  eq(h.root.dataset.theme, 'dark');
  eq([...h.classes], []);
});
test('theme: set с неизвестным названием ничего не меняет', () => {
  const h = makeLiveTheme();
  h.service.init();
  eq(h.service.set('purple'), 'light');
  eq(h.storage.getItem(THEME_STORAGE_KEY), null);
});
test('theme: смена системной темы подхватывается, пока пользователь не выбрал тему сам', () => {
  const h = makeLiveTheme();
  h.service.init();
  const seen = [];
  h.service.onSystemChange(theme => seen.push(theme));
  h.setSystemDark(true);
  eq(seen, ['dark']);
  eq(h.root.dataset.theme, 'dark');
  h.service.set(THEME.LIGHT); // пользователь выбрал тему вручную
  h.setSystemDark(false); h.setSystemDark(true);
  eq(seen, ['dark'], 'после ручного выбора система больше не меняет тему');
  eq(h.root.dataset.theme, 'light');
});
test('theme: недоступное хранилище не ломает сервис', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
  const h = makeLiveTheme({ systemDark: true, storage: broken });
  eq(h.service.init(), THEME.DARK);
  eq(h.service.set(THEME.LIGHT), 'light');
  eq(h.root.dataset.theme, 'light');
});
test('safeStorage: при запрете localStorage используется память', () => {
  const win = { localStorage: { setItem() { throw new Error('SecurityError'); }, removeItem() {} } };
  const storage = createSafeStorage(win);
  storage.setItem('a', 1);
  eq(storage.getItem('a'), '1');
  storage.removeItem('a');
  eq(storage.getItem('a'), null);
});
test('mediaQuery: подписка работает и через addListener (старые Safari)', () => {
  const listeners = [];
  const legacy = { addListener: cb => listeners.push(cb), removeListener: cb => listeners.splice(listeners.indexOf(cb), 1) };
  let calls = 0;
  const off = subscribeToMediaQuery(legacy, () => calls++);
  listeners.forEach(cb => cb());
  eq(calls, 1);
  off();
  eq(listeners.length, 0);
});

// Переключатель темы: поддельные кнопки с setAttribute/addEventListener/focus
function makeToggle() {
  const make = () => {
    const listeners = {};
    return { attrs: {}, tabIndex: 0, focused: false, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(type, cb) { listeners[type] = cb; }, click() { listeners.click(); }, focus() { this.focused = true; }, listeners };
  };
  const els = { 'theme-toggle': make(), 'theme-light': make(), 'theme-dark': make() };
  return { view: createThemeToggleView({ getElementById: id => els[id] }), els };
}
test('themeToggleView: render выставляет aria-checked и tabIndex', () => {
  const { view, els } = makeToggle();
  view.render('dark');
  eq([els['theme-light'].attrs['aria-checked'], els['theme-dark'].attrs['aria-checked']], ['false', 'true']);
  eq([els['theme-light'].tabIndex, els['theme-dark'].tabIndex], [-1, 0]);
});
test('themeController: клик по солнцу/луне переключает тему, клавиши-стрелки тоже', () => {
  const h = makeLiveTheme({ systemDark: false });
  const { view, els } = makeToggle();
  createThemeController({ themeService: h.service, toggleView: view }).init();
  eq(els['theme-light'].attrs['aria-checked'], 'true', 'стартовая тема отображена');
  els['theme-dark'].click();
  eq(h.root.dataset.theme, 'dark');
  eq(els['theme-dark'].attrs['aria-checked'], 'true');
  ok(els['theme-dark'].focused, 'фокус переходит на выбранный вариант');
  els['theme-toggle'].listeners.keydown({ key: 'ArrowLeft' });
  eq(h.root.dataset.theme, 'light');
  els['theme-light'].click();
  eq(els['theme-light'].attrs['aria-checked'], 'true');
});
test('themeController: системная смена темы обновляет переключатель', () => {
  const h = makeLiveTheme({ systemDark: false });
  const { view, els } = makeToggle();
  createThemeController({ themeService: h.service, toggleView: view }).init();
  h.setSystemDark(true);
  eq(els['theme-dark'].attrs['aria-checked'], 'true');
});

// ---------- controller: промежуточное сохранение и «Переотправить» ----------
// Собирает контроллер с заглушками и возвращает всё, что нужно тестам для проверок
function makeController({ translate, supported = true, holdPlayback = false } = {}) {
  const calls = { statuses: [], retryVisible: [], source: [], translation: [], played: [], playbackStops: 0, recognitionStarts: [] };
  let finishHandler = null;
  const view = {
    langs: { [SIDE.FROM]: 'ru', [SIDE.TO]: 'sr' },
    getLanguage(side) { return this.langs[side]; },
    swapLanguages() {},
    showSource: t => calls.source.push(t),
    showTranslation: t => calls.translation.push(t),
    setPhase: (phase, side, text) => calls.statuses.push([phase, text]),
    setRetryVisible: v => calls.retryVisible.push(v),
    onMicClick(h) { this.micHandler = h; },
    onSwapClick() {},
    onRetryClick(h) { this.retryHandler = h; },
  };
  const recognition = {
    isSupported: () => supported,
    start: opts => { calls.recognitionStarts.push(opts.lang); finishHandler = opts.onFinish; },
    stop: () => {},
  };
  const playback = {
    stop() { calls.playbackStops++; },
    playAudio: o => { calls.played.push(['audio', o.url]); if (!holdPlayback) o.onDone(); },
    speak: (text, lang, onDone) => { calls.played.push(['speak', text]); onDone(); },
  };
  const translation = { translate: translate || (async entry => ({ original: entry.text, translated: 'Hello', audioUrl: '/api/audio/a.mp3' })) };
  const store = new Map();
  const pending = {
    save: e => store.set('p', e),
    load: () => store.get('p') || null,
    clear: () => store.delete('p'),
  };
  let now = 0;
  const duplicateGuard = createDuplicateGuard(8000, () => now);
  const controller = createTranslatorController({ view, recognition, playback, translation, pending, duplicateGuard });
  controller.init();
  return {
    controller, view, calls, pending, advance: ms => { now += ms; },
    finish: result => finishHandler(result, 'ru', 'sr'),
    lastStatus: () => calls.statuses[calls.statuses.length - 1],
  };
}
// Даёт отработать всем ожидающим промисам (цепочка await внутри контроллера)
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };

test('controller: успешная отправка очищает сохранённый текст и озвучивает', async () => {
  const h = makeController();
  h.view.micHandler(SIDE.FROM);
  h.finish({ text: 'Привет', error: null });
  ok(h.pending.load(), 'текст сохранён до отправки');
  await flush();
  eq(h.pending.load(), null);
  eq(h.calls.translation, ['Hello']);
  eq(h.calls.played, [['audio', '/api/audio/a.mp3']]);
  eq(h.lastStatus(), [PHASE.IDLE, 'Готово!']);
  eq(h.calls.retryVisible[h.calls.retryVisible.length - 1], false);
});
test('controller: ошибка запроса сохраняет текст и показывает «Переотправить»', async () => {
  const h = makeController({ translate: async () => { throw new Error('Ошибка обработки запроса'); } });
  h.view.micHandler(SIDE.FROM);
  h.finish({ text: 'Привет', error: null });
  await flush();
  eq(h.pending.load(), { text: 'Привет', sourceLang: 'ru', targetLang: 'sr' });
  eq(h.calls.retryVisible[h.calls.retryVisible.length - 1], true);
  ok(h.lastStatus()[1].includes('Переотправить'), 'статус подсказывает про кнопку');
});
test('controller: при превышении лимита запросов показывается понятная надпись, текст сохраняется', async () => {
  const h = makeController({ translate: async () => { throw new Error('Превышено количество запросов, повторите позднее'); } });
  h.view.micHandler(SIDE.FROM);
  h.finish({ text: 'Привет', error: null });
  await flush();
  ok(h.lastStatus()[1].includes('Превышено количество запросов, повторите позднее'), 'надпись про лимит в статусе');
  eq(h.pending.load(), { text: 'Привет', sourceLang: 'ru', targetLang: 'sr' });
  eq(h.calls.retryVisible[h.calls.retryVisible.length - 1], true);
});
test('controller: переотправка после ошибки проходит и очищает хранилище', async () => {
  let fail = true;
  const h = makeController({ translate: async e => { if (fail) throw new Error('x'); return { original: e.text, translated: 'Zdravo', audioUrl: null }; } });
  h.view.micHandler(SIDE.FROM);
  h.finish({ text: 'Привет', error: null });
  await flush();
  fail = false;
  h.view.retryHandler();
  await flush();
  eq(h.pending.load(), null);
  eq(h.calls.translation, ['Zdravo']);
  eq(h.calls.played, [['speak', 'Zdravo']], 'без audio_url озвучивает браузер');
  eq(h.calls.retryVisible[h.calls.retryVisible.length - 1], false);
});
test('controller: переотправка обходит защиту от дублей', async () => {
  let calls = 0;
  const h = makeController({ translate: async e => { calls++; if (calls === 2) throw new Error('x'); return { original: e.text, translated: 'Hello', audioUrl: null }; } });
  h.view.micHandler(SIDE.FROM); h.finish({ text: 'Привет', error: null }); await flush();   // успех #1 (фраза помечена отправленной)
  h.advance(1000);
  h.view.micHandler(SIDE.FROM); h.finish({ text: 'Привет', error: null }); await flush();   // дубль -> запрос не уходит
  eq(calls, 1, 'дубль заблокирован');
  h.pending.save({ text: 'Привет', sourceLang: 'ru', targetLang: 'sr' });
  h.view.retryHandler(); await flush();                                                       // ручная переотправка уходит несмотря на окно
  eq(calls, 2);
});
test('controller: ошибка распознавания с частичным текстом сохраняет его', async () => {
  const h = makeController();
  h.view.micHandler(SIDE.FROM);
  h.finish({ text: 'привет как', error: 'network' });
  eq(h.pending.load(), { text: 'привет как', sourceLang: 'ru', targetLang: 'sr' });
  eq(h.calls.retryVisible[h.calls.retryVisible.length - 1], true);
  ok(h.lastStatus()[1].includes('Нужен доступ в интернет'), 'сообщение об ошибке сети');
});
test('controller: ошибка без текста не сохраняет ничего', async () => {
  const h = makeController();
  h.view.micHandler(SIDE.FROM);
  h.finish({ text: '', error: 'no-speech' });
  eq(h.pending.load(), null);
  eq(h.lastStatus(), [PHASE.IDLE, 'Речь не обнаружена']);
});
test('controller: один клик во время озвучки прерывает её и сразу начинает запись', async () => {
  const h = makeController({ holdPlayback: true });
  h.view.micHandler(SIDE.FROM);
  h.finish({ text: 'Привет', error: null });
  await flush();
  eq(h.lastStatus(), [PHASE.SPEAKING, 'Озвучиваю...']);
  const stopsBefore = h.calls.playbackStops;
  h.view.micHandler(SIDE.TO); // другой человек отвечает: нажимает свою кнопку один раз
  ok(h.calls.playbackStops > stopsBefore, 'озвучка остановлена');
  eq(h.calls.recognitionStarts, ['ru', 'sr'], 'запись началась на языке нажатой стороны');
  eq(h.lastStatus(), [PHASE.LISTENING, 'Слушаю...']);
});
test('controller: после быстрого перехода запись можно завершить и отправить как обычно', async () => {
  const h = makeController({ holdPlayback: true });
  h.view.micHandler(SIDE.FROM);
  h.finish({ text: 'Привет', error: null });
  await flush();
  h.view.micHandler(SIDE.TO);
  h.finish({ text: 'Zdravo', error: null });
  await flush();
  eq(h.calls.translation, ['Hello', 'Hello']);
  ok(h.calls.played.length === 2, 'озвучка запускается для обоих переводов');
});
test('controller: после перезагрузки сохранённый текст восстанавливается', () => {
  const calls = { source: [], retry: [] };
  const store = { entry: { text: 'Привет', sourceLang: 'ru', targetLang: 'en' } };
  const view = {
    getLanguage: () => 'ru', swapLanguages() {}, showSource: t => calls.source.push(t), showTranslation() {},
    setPhase() {}, setRetryVisible: v => calls.retry.push(v), onMicClick() {}, onSwapClick() {}, onRetryClick() {},
  };
  createTranslatorController({
    view, recognition: { isSupported: () => true }, playback: {}, translation: {},
    pending: { load: () => store.entry, save() {}, clear() {} }, duplicateGuard: createDuplicateGuard(1),
  }).init();
  eq(calls.source, ['Привет']);
  eq(calls.retry, [true]);
});
test('controller: большой текст (10000 символов) уходит целиком', async () => {
  let sentLength = 0;
  const h = makeController({ translate: async e => { sentLength = e.text.length; return { original: e.text, translated: 'ok', audioUrl: null }; } });
  const big = Array.from({ length: 1700 }, (_, i) => `слово${i}`).join(' ');
  h.view.micHandler(SIDE.FROM);
  h.finish({ text: big, error: null });
  await flush();
  eq(sentLength, big.length);
});

// ---------- view (с поддельным DOM) ----------
// Минимальная заглушка элемента DOM: classList, hidden/disabled, textContent, события, дочерние узлы
function fakeElement(value = '') {
  const classes = new Set();
  const listeners = {};
  return {
    value, hidden: false, disabled: false, className: '', children: [], _text: '',
    classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: c => classes.has(c) },
    get textContent() { return this._text; },
    set textContent(v) { this._text = v; if (v === '') this.children = []; },
    appendChild(child) { this.children.push(child); },
    addEventListener(type, cb) { listeners[type] = cb; },
    click() { listeners.click(); },
  };
}
function makeView() {
  const ids = ['lang-from', 'lang-to', 'swap-btn', 'mic-from', 'mic-to', 'retry-btn', 'status', 'source-text', 'translated-text'];
  const els = Object.fromEntries(ids.map(id => [id, fakeElement()]));
  els['lang-from'].value = 'ru';
  els['lang-to'].value = 'sr';
  const doc = { getElementById: id => els[id], createElement: () => fakeElement() };
  return { view: createTranslatorView(doc), els };
}

test('view: swapLanguages меняет значения местами', () => {
  const { view, els } = makeView();
  view.swapLanguages();
  eq([els['lang-from'].value, els['lang-to'].value], ['sr', 'ru']);
  eq([view.getLanguage(SIDE.FROM), view.getLanguage(SIDE.TO)], ['sr', 'ru']);
});
test('view: showSource показывает текст, а пустая строка — подсказку', () => {
  const { view, els } = makeView();
  view.showSource('Привет');
  eq(els['source-text'].textContent, 'Привет');
  view.showSource('');
  eq(els['source-text'].children.length, 1);
  eq(els['source-text'].children[0].textContent, 'Здесь появится распознанный текст…');
});
test('view: setPhase подсвечивает только активный микрофон и блокирует кнопки', () => {
  const { view, els } = makeView();
  view.setPhase(PHASE.LISTENING, SIDE.TO, 'Слушаю...');
  ok(els['mic-to'].classList.contains('recording') && !els['mic-from'].classList.contains('recording'));
  ok(els['retry-btn'].disabled, 'переотправка недоступна во время записи');
  eq(els.status.textContent, 'Слушаю...');
  view.setPhase(PHASE.PROCESSING, SIDE.FROM, 'Перевожу...');
  ok(els['mic-from'].classList.contains('processing') && els['mic-from'].disabled && els['mic-to'].disabled);
  view.setPhase(PHASE.IDLE, SIDE.FROM, 'Готово!');
  ok(!els['mic-from'].disabled && !els['retry-btn'].disabled && !els['mic-from'].classList.contains('processing'));
});
test('view: setRetryVisible управляет атрибутом hidden, клики доходят до обработчиков', () => {
  const { view, els } = makeView();
  view.setRetryVisible(true);
  eq(els['retry-btn'].hidden, false);
  view.setRetryVisible(false);
  eq(els['retry-btn'].hidden, true);
  const clicks = [];
  view.onMicClick(side => clicks.push(side));
  view.onRetryClick(() => clicks.push('retry'));
  view.onSwapClick(() => clicks.push('swap'));
  els['mic-from'].click(); els['mic-to'].click(); els['retry-btn'].click(); els['swap-btn'].click();
  eq(clicks, ['from', 'to', 'retry', 'swap']);
});

// ---------- авторизация (Bearer-токен) ----------
const TOKEN_KEY = 'voiceTranslator.token';
function makeAuth({ responses = [], stored, now = 1_000_000 } = {}) {
  const storage = memoryStorage();
  if (stored) storage.setItem(TOKEN_KEY, JSON.stringify(stored));
  const calls = { fetch: [], navigate: [] };
  const queueOfResponses = [...responses];
  const fetchFn = async (url, init) => {
    calls.fetch.push({ url, init });
    const next = queueOfResponses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  const auth = createAuthRepository({ storage, now: () => now, fetchFn, navigate: url => calls.navigate.push(url) });
  return { auth, storage, calls, now };
}
const validToken = { token: 'abc.def', expiresAt: 2_000_000 };

test('auth: getToken возвращает действующий токен', () => {
  eq(makeAuth({ stored: validToken }).auth.getToken(), 'abc.def');
});
test('auth: просроченный или повреждённый токен считается отсутствующим и удаляется', () => {
  const expired = makeAuth({ stored: { token: 'abc', expiresAt: 999_999 } });
  eq(expired.auth.getToken(), null);
  eq(expired.storage.getItem(TOKEN_KEY), null);
  const broken = makeAuth();
  broken.storage.setItem(TOKEN_KEY, '{not json');
  eq(broken.auth.getToken(), null);
  eq(makeAuth({ stored: { token: '', expiresAt: 2_000_000 } }).auth.getToken(), null);
  eq(makeAuth().auth.getToken(), null);
});
test('auth: login отправляет JSON и сохраняет токен со сроком жизни', async () => {
  const h = makeAuth({ responses: [fakeResponse(200, { access_token: 'tok', token_type: 'bearer', expires_in: 3600 })] });
  await h.auth.login('user', 'pass');
  eq(h.calls.fetch[0].url, '/api/login');
  eq(JSON.parse(h.calls.fetch[0].init.body), { username: 'user', password: 'pass' });
  eq(JSON.parse(h.storage.getItem(TOKEN_KEY)), { token: 'tok', expiresAt: 1_000_000 + 3_600_000 });
});
test('auth: login показывает сообщение сервера и не сохраняет токен', async () => {
  const run = async response => {
    const h = makeAuth({ responses: [response] });
    let message = null;
    try { await h.auth.login('u', 'p'); } catch (e) { message = e.message; }
    eq(h.storage.getItem(TOKEN_KEY), null);
    return message;
  };
  eq(await run(fakeResponse(401, { detail: 'Неверный логин или пароль' })), 'Неверный логин или пароль');
  eq(await run(fakeResponse(429, { detail: 'Слишком много попыток входа, повторите через минуту' })), 'Слишком много попыток входа, повторите через минуту');
  eq(await run(fakeResponse(422, { detail: [{ msg: 'x' }] })), 'Введите логин и пароль');
  eq(await run(fakeResponse(500)), 'Ошибка сервера (500)');
  eq(await run(new TypeError('Failed to fetch')), 'Не удалось связаться с сервером. Проверьте соединение');
});
test('auth: authFetch добавляет заголовок Bearer и сохраняет остальные заголовки', async () => {
  const h = makeAuth({ stored: validToken, responses: [fakeResponse(200, {})] });
  await h.auth.authFetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  eq(h.calls.fetch[0].init.headers, { 'Content-Type': 'application/json', Authorization: 'Bearer abc.def' });
  eq(h.calls.fetch[0].init.method, 'POST');
  eq(h.calls.navigate, []);
});
test('auth: ответ 401 забывает токен, открывает страницу входа и сообщает об ошибке', async () => {
  const h = makeAuth({ stored: validToken, responses: [fakeResponse(401, { detail: 'x' })] });
  let message = null;
  try { await h.auth.authFetch('/api/translate'); } catch (e) { message = e.message; }
  eq(message, 'Сессия истекла, войдите снова');
  eq(h.storage.getItem(TOKEN_KEY), null);
  eq(h.calls.navigate, ['/login']);
});
test('auth: без токена запрос не отправляется, а открывается страница входа', async () => {
  const h = makeAuth();
  let message = null;
  try { await h.auth.authFetch('/api/translate'); } catch (e) { message = e.message; }
  eq(message, 'Требуется вход');
  eq(h.calls.fetch, []);
  eq(h.calls.navigate, ['/login']);
});
test('auth: logout забывает токен и открывает страницу входа', () => {
  const h = makeAuth({ stored: validToken });
  h.auth.logout();
  eq([h.storage.getItem(TOKEN_KEY), h.calls.navigate], [null, ['/login']]);
});
test('auth: verifySession при 401 отправляет на вход, а сетевой сбой игнорирует', async () => {
  const expired = makeAuth({ stored: validToken, responses: [fakeResponse(401, {})] });
  await expired.auth.verifySession();
  eq(expired.calls.navigate, ['/login']);
  const offline = makeAuth({ stored: validToken, responses: [new TypeError('offline')] });
  await offline.auth.verifySession();
  eq([offline.calls.navigate, offline.storage.getItem(TOKEN_KEY) !== null], [[], true]);
});
test('translateRepository: через authFetch просроченная сессия даёт понятную ошибку', async () => {
  const h = makeAuth({ stored: validToken, responses: [fakeResponse(401, { detail: 'Сессия истекла, войдите снова' })] });
  let message = null;
  try { await requestTranslation({ text: 'a', sourceLang: 'ru', targetLang: 'en' }, { fetchFn: h.auth.authFetch }); } catch (e) { message = e.message; }
  eq(message, 'Сессия истекла, войдите снова');
  eq(h.calls.navigate, ['/login']);
});

// ---------- страница входа ----------
function makeLoginView() {
  const listeners = {};
  const el = (extra = {}) => ({
    value: '', disabled: false, textContent: '', type: 'text', attrs: {}, focused: 0,
    setAttribute(name, value) { this.attrs[name] = value; },
    addEventListener(type, cb) { (listeners[this.id] ||= {})[type] = cb; },
    focus() { this.focused++; },
    ...extra,
  });
  const els = {
    'login-form': el({ id: 'login-form' }), 'login-username': el({ id: 'login-username' }),
    'login-password': el({ id: 'login-password', type: 'password' }), 'login-submit': el({ id: 'login-submit', textContent: 'Войти' }),
    'login-error': el({ id: 'login-error' }), 'login-reveal': el({ id: 'login-reveal' }),
  };
  const view = createLoginView({ getElementById: id => els[id] });
  return { view, els, fire: (id, type, event = {}) => listeners[id][type](event) };
}
test('loginView: values обрезает пробелы в логине, но не трогает пароль', () => {
  const { view, els } = makeLoginView();
  els['login-username'].value = '  admin ';
  els['login-password'].value = ' p a ss ';
  eq(view.values(), { username: 'admin', password: ' p a ss ' });
});
test('loginView: отправка формы отменяет перезагрузку страницы', () => {
  const { view, fire } = makeLoginView();
  let calls = 0; let prevented = false;
  view.onSubmit(() => calls++);
  fire('login-form', 'submit', { preventDefault: () => { prevented = true; } });
  eq([calls, prevented], [1, true]);
});
test('loginView: кнопка глаза показывает и скрывает пароль', () => {
  const { view, els, fire } = makeLoginView();
  view.onSubmit(() => {});
  fire('login-reveal', 'click');
  eq([els['login-password'].type, els['login-reveal'].attrs['aria-pressed'], els['login-reveal'].attrs['aria-label']], ['text', 'true', 'Скрыть пароль']);
  fire('login-reveal', 'click');
  eq([els['login-password'].type, els['login-reveal'].attrs['aria-pressed']], ['password', 'false']);
});
test('loginView: setBusy блокирует форму, showError и focus работают', () => {
  const { view, els } = makeLoginView();
  view.setBusy(true);
  eq([els['login-submit'].disabled, els['login-password'].disabled, els['login-submit'].textContent], [true, true, 'Входим…']);
  view.setBusy(false);
  eq([els['login-submit'].disabled, els['login-submit'].textContent], [false, 'Войти']);
  view.showError('Ошибка');
  eq([els['login-error'].textContent, els['login-password'].attrs['aria-invalid']], ['Ошибка', 'true']);
  view.showError('');
  eq(els['login-password'].attrs['aria-invalid'], 'false');
  els['login-password'].value = 'secret';
  view.focus('password');
  eq([els['login-password'].value, els['login-password'].focused], ['', 1]);
  view.focus('username');
  eq(els['login-username'].focused, 1);
});

function makeLoginController({ token = null, login = async () => {}, username = 'admin', password = 'secret' } = {}) {
  const log = [];
  let submitHandler = null;
  const view = {
    values: () => ({ username, password }),
    onSubmit: handler => { submitHandler = handler; },
    setBusy: busy => log.push(['busy', busy]),
    showError: message => log.push(['error', message]),
    focus: field => log.push(['focus', field]),
  };
  const auth = { getToken: () => token, login: async (u, p) => { log.push(['login', u, p]); await login(u, p); }, navigate: url => log.push(['navigate', url]), appPage: '/' };
  const controller = createLoginController({ view, auth });
  controller.init();
  return { controller, log, submit: () => submitHandler() };
}
test('loginController: если токен уже есть, сразу открывается приложение', () => {
  const h = makeLoginController({ token: 'abc' });
  eq(h.log, [['navigate', '/']]);
});
test('loginController: без токена показывается форма с фокусом на логине', () => {
  eq(makeLoginController().log, [['focus', 'username']]);
});
test('loginController: пустые поля не отправляются на сервер', async () => {
  const h = makeLoginController({ username: '', password: '' });
  h.log.length = 0;
  await h.submit();
  eq(h.log, [['error', 'Введите логин и пароль'], ['focus', 'username']]);
  const noPassword = makeLoginController({ password: '' });
  noPassword.log.length = 0;
  await noPassword.submit();
  eq(noPassword.log, [['error', 'Введите логин и пароль'], ['focus', 'password']]);
});
test('loginController: успешный вход открывает приложение', async () => {
  const h = makeLoginController();
  h.log.length = 0;
  await h.submit();
  eq(h.log, [['error', ''], ['busy', true], ['login', 'admin', 'secret'], ['navigate', '/']]);
});
test('loginController: ошибка входа показывает сообщение и очищает пароль', async () => {
  const h = makeLoginController({ login: async () => { throw new Error('Неверный логин или пароль'); } });
  h.log.length = 0;
  await h.submit();
  eq(h.log, [['error', ''], ['busy', true], ['login', 'admin', 'secret'], ['busy', false], ['error', 'Неверный логин или пароль'], ['focus', 'password']]);
});
test('loginController: повторная отправка во время входа игнорируется', async () => {
  let release;
  const h = makeLoginController({ login: () => new Promise(resolve => { release = resolve; }) });
  h.log.length = 0;
  const first = h.submit();
  await flush();
  await h.submit();
  release();
  await first;
  eq(h.log.filter(entry => entry[0] === 'login').length, 1);
});

// ---------- воспроизведение озвучки с токеном ----------
function makePlayback({ fetchAudio, playResult = () => Promise.resolve() } = {}) {
  globalThis.window = globalThis.window || {}; // в jsc нет window: speechSynthesis «недоступен», запасной голос сразу вызывает onDone
  const log = { audios: [], revoked: [], created: [] };
  const urlApi = { createObjectURL: blob => { log.created.push(blob); return `blob:${log.created.length}`; }, revokeObjectURL: url => log.revoked.push(url) };
  const createAudio = src => {
    const audio = { src, paused: false, play: () => playResult(audio), pause() { this.paused = true; } };
    log.audios.push(audio);
    return audio;
  };
  return { playback: createPlaybackService({ fetchAudio, createAudio, urlApi }), log };
}
test('playback: MP3 скачивается с токеном, проигрывается и освобождает ссылку по окончании', async () => {
  const h = makePlayback({ fetchAudio: async url => ({ url }) });
  let done = 0;
  h.playback.playAudio({ url: '/api/audio/voice_a.mp3', fallbackText: 'Hi', lang: 'en', onDone: () => done++ });
  await flush();
  eq(h.log.created, [{ url: '/api/audio/voice_a.mp3' }]);
  eq(h.log.audios[0].src, 'blob:1');
  h.log.audios[0].onended();
  eq([done, h.log.revoked], [1, ['blob:1']]);
});
test('playback: ошибка загрузки аудио приводит к запасному голосу браузера', async () => {
  const h = makePlayback({ fetchAudio: async () => { throw new Error('401'); } });
  let done = 0;
  h.playback.playAudio({ url: '/api/audio/x.mp3', fallbackText: 'Hi', lang: 'en', onDone: () => done++ });
  await flush();
  eq([done, h.log.audios.length], [1, 0]);
});
test('playback: если браузер запретил автозапуск, срабатывает запасной голос и ссылка освобождается', async () => {
  const h = makePlayback({ fetchAudio: async () => ({}), playResult: () => Promise.reject(new Error('NotAllowedError')) });
  let done = 0;
  h.playback.playAudio({ url: '/api/audio/x.mp3', fallbackText: 'Hi', lang: 'en', onDone: () => done++ });
  await flush();
  eq([done, h.log.revoked], [1, ['blob:1']]);
});
test('playback: stop во время загрузки отменяет воспроизведение без onDone', async () => {
  let resolveFetch;
  const h = makePlayback({ fetchAudio: () => new Promise(resolve => { resolveFetch = resolve; }) });
  let done = 0;
  h.playback.playAudio({ url: '/api/audio/x.mp3', fallbackText: 'Hi', lang: 'en', onDone: () => done++ });
  h.playback.stop();
  resolveFetch({});
  await flush();
  eq([done, h.log.audios.length, h.log.created.length], [0, 0, 0]);
});
test('playback: stop во время проигрывания останавливает звук и освобождает ссылку', async () => {
  const h = makePlayback({ fetchAudio: async () => ({}) });
  let done = 0;
  h.playback.playAudio({ url: '/api/audio/x.mp3', fallbackText: 'Hi', lang: 'en', onDone: () => done++ });
  await flush();
  h.playback.stop();
  eq([h.log.audios[0].paused, h.log.revoked, done], [true, ['blob:1'], 0]);
});

// ---------- запуск ----------
for (const { name, fn } of queue) {
  try {
    await fn();
    passed++;
    log('  ok   ' + name);
  } catch (error) {
    failed++;
    log('  FAIL ' + name + '\n         ' + (error && error.message));
  }
}
log(`\n${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} tests failed`);
