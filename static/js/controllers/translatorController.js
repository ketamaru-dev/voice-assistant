// Контроллер: связывает представление и сервисы, управляет фазами работы и сохранением неотправленного текста.
import { PHASE, SIDE } from '../config.js';
import { describeRecognitionError } from '../services/recognitionService.js';

const STATUS_IDLE = 'Нажмите для записи';
const STATUS_DONE = 'Готово!';

// Создаёт контроллер из готовых зависимостей (view, recognition, playback, translation, pending, duplicateGuard)
export function createTranslatorController({ view, recognition, playback, translation, pending, duplicateGuard }) {
  let phase = PHASE.IDLE;
  let activeSide = null;
  let isProcessing = false;

  // Переключает фазу и обновляет интерфейс
  function setPhase(next, statusText) {
    phase = next;
    view.setPhase(next, activeSide, statusText);
  }

  // Возвращает противоположную сторону интерфейса
  const oppositeSide = side => (side === SIDE.FROM ? SIDE.TO : SIDE.FROM);

  // Озвучивает перевод: MP3 с сервера, а если его нет — голосом браузера
  function playResult(result, targetLang) {
    const onDone = () => setPhase(PHASE.IDLE, STATUS_DONE);
    setPhase(PHASE.SPEAKING, 'Озвучиваю...');
    if (result.audioUrl) playback.playAudio({ url: result.audioUrl, fallbackText: result.translated, lang: targetLang, onDone });
    else playback.speak(result.translated, targetLang, onDone);
  }

  // Отправляет запись на перевод. При успехе очищает сохранённый текст, при ошибке оставляет его и показывает «Переотправить».
  // force=true пропускает защиту от дублей (нужно для ручной переотправки).
  async function send(entry, { force = false } = {}) {
    if (isProcessing) return;
    if (!force && duplicateGuard.isDuplicate(entry.text)) {
      // Такая же фраза только что успешно переведена — повторный запрос не нужен
      console.log('Повторная отправка той же фразы заблокирована');
      pending.clear();
      view.setRetryVisible(false);
      return setPhase(PHASE.IDLE, STATUS_DONE);
    }

    isProcessing = true;
    view.setRetryVisible(false);
    setPhase(PHASE.PROCESSING, 'Перевожу...');
    try {
      console.log('Отправка запроса...');
      const result = await translation.translate(entry);
      view.showTranslation(result.translated);
      duplicateGuard.markSent(entry.text);
      pending.clear();
      playResult(result, entry.targetLang);
    } catch (error) {
      console.error(error);
      view.setRetryVisible(true);
      setPhase(PHASE.IDLE, `Ошибка: ${error.message}. Текст сохранён — нажмите «Переотправить»`);
    } finally {
      isProcessing = false;
    }
  }

  // Обрабатывает завершение распознавания: сохраняет текст до отправки, затем отправляет или сообщает об ошибке
  function handleRecognitionFinish({ text, error }, sourceLang, targetLang) {
    const entry = text ? { text, sourceLang, targetLang } : null;
    // Промежуточное сохранение: что бы ни случилось дальше, наговорённый текст не потеряется
    if (entry) pending.save(entry);

    if (error) {
      const message = describeRecognitionError(error);
      if (entry) {
        view.showSource(text);
        view.setRetryVisible(true);
        return setPhase(PHASE.IDLE, `${message}. Текст сохранён — нажмите «Переотправить»`);
      }
      return setPhase(PHASE.IDLE, message);
    }
    if (!entry) return setPhase(PHASE.IDLE, 'Речь не обнаружена');

    view.showSource(text);
    send(entry);
  }

  // Начинает запись на языке выбранной стороны; переводить будем на язык противоположной
  function startListening(side) {
    if (!recognition.isSupported()) return setPhase(PHASE.IDLE, 'Браузер не поддерживает распознавание речи');
    playback.stop();
    activeSide = side;
    const sourceLang = view.getLanguage(side);
    const targetLang = view.getLanguage(oppositeSide(side));
    view.showSource('');
    try {
      recognition.start({
        lang: sourceLang,
        onUpdate: text => view.showSource(text),
        onFinish: result => handleRecognitionFinish(result, sourceLang, targetLang),
      });
      setPhase(PHASE.LISTENING, 'Слушаю...');
    } catch (error) {
      console.error('Не удалось запустить распознавание:', error);
      setPhase(PHASE.IDLE, 'Сбой запуска: ' + error.message);
    }
  }

  // Реакция на клик по микрофону. Во время озвучки один клик одновременно прерывает её и начинает запись
  // (быстрый переход к разговору); в покое — начинает запись; во время записи на этой же кнопке — останавливает её.
  function onMicClick(side) {
    if (isProcessing) return;
    if (phase === PHASE.SPEAKING) {
      playback.stop();
      return startListening(side);
    }
    if (phase === PHASE.IDLE) return startListening(side);
    if (phase === PHASE.LISTENING && side === activeSide) recognition.stop();
  }

  // Клавиша Esc: останавливает запись (текст уйдёт в перевод) или прерывает озвучку
  function onEscape() {
    if (phase === PHASE.LISTENING) return recognition.stop();
    if (phase === PHASE.SPEAKING) {
      playback.stop();
      setPhase(PHASE.IDLE, STATUS_IDLE);
    }
  }

  // Ручная переотправка сохранённого текста (с теми языками, на которых он был наговорён)
  function retry() {
    if (isProcessing || phase === PHASE.LISTENING) return;
    const entry = pending.load();
    if (!entry) return view.setRetryVisible(false);
    view.showSource(entry.text);
    return send(entry, { force: true });
  }

  // Подписывает обработчики и восстанавливает неотправленный текст после перезагрузки страницы
  function init() {
    view.onMicClick(onMicClick);
    view.onSwapClick(() => view.swapLanguages());
    view.onRetryClick(retry);

    const saved = pending.load();
    if (saved) {
      view.showSource(saved.text);
      view.setRetryVisible(true);
      setPhase(PHASE.IDLE, 'Есть неотправленный текст — нажмите «Переотправить»');
    } else {
      view.setRetryVisible(false);
      setPhase(PHASE.IDLE, STATUS_IDLE);
    }
  }

  return { init, onMicClick, onEscape, retry, send };
}
