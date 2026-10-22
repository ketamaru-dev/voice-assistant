// Сервис воспроизведения озвучки: сначала MP3 с сервера, при неудаче — голос браузера (speechSynthesis).
// MP3 запрашивается через fetch с Bearer-токеном (элемент <audio> не умеет отправлять заголовок Authorization).
import { SPEECH_LANGS } from '../config.js';
import { authRepository } from '../repositories/authRepository.js';

// Скачивает аудио с токеном и возвращает Blob
async function fetchAudioBlob(url) {
  const response = await authRepository.authFetch(url);
  if (!response.ok) throw new Error(`Аудио недоступно (${response.status})`);
  return response.blob();
}

// Создаёт сервис воспроизведения; langs — таблица кодов языков для speechSynthesis, остальное подменяется в тестах
export function createPlaybackService({
  langs = SPEECH_LANGS,
  fetchAudio = fetchAudioBlob,
  createAudio = src => new Audio(src),
  urlApi = typeof URL !== 'undefined' ? URL : null,
} = {}) {
  let currentAudio = null;
  let currentUtterance = null;
  let currentObjectUrl = null;
  let playId = 0; // номер текущего воспроизведения: устаревшие загрузки после stop() отбрасываются

  // Освобождает временную ссылку на скачанное аудио
  function releaseObjectUrl() {
    if (currentObjectUrl) urlApi.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }

  // Останавливает любое воспроизведение и отключает обработчики, чтобы они не вызвали onDone после ручной остановки
  function stop() {
    playId += 1;
    releaseObjectUrl();
    if (currentAudio) {
      currentAudio.onended = currentAudio.onerror = null;
      currentAudio.pause();
      currentAudio = null;
    }
    if (currentUtterance) {
      currentUtterance.onend = currentUtterance.onerror = null;
      currentUtterance = null;
    }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  // Озвучивает текст голосом браузера; onDone вызывается по окончании (или сразу, если синтез недоступен)
  function speak(text, lang, onDone) {
    if (!text || !('speechSynthesis' in window)) return onDone();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langs[lang] || lang;
    const voice = speechSynthesis.getVoices().find(v => v.lang.replace('_', '-').toLowerCase().startsWith(lang));
    if (voice) utterance.voice = voice;
    utterance.onend = utterance.onerror = onDone;
    currentUtterance = utterance;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }

  // Скачивает MP3 по ссылке (с токеном) и проигрывает; если файл не загрузился или автозапуск запрещён —
  // озвучивает fallbackText голосом браузера
  function playAudio({ url, fallbackText, lang, onDone }) {
    const id = ++playId;
    releaseObjectUrl();
    let fellBack = false;
    const fallback = () => {
      if (fellBack || id !== playId) return;
      fellBack = true;
      releaseObjectUrl();
      currentAudio = null;
      speak(fallbackText, lang, onDone);
    };
    fetchAudio(url).then(blob => {
      if (id !== playId) return undefined; // воспроизведение остановили, пока файл скачивался
      currentObjectUrl = urlApi.createObjectURL(blob);
      const audio = createAudio(currentObjectUrl);
      currentAudio = audio;
      audio.onended = () => {
        releaseObjectUrl();
        onDone();
      };
      audio.onerror = fallback;
      return audio.play();
    }).catch(fallback);
  }

  return { stop, speak, playAudio };
}
