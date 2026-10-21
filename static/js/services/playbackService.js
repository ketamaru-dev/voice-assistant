// Сервис воспроизведения озвучки: сначала MP3 с сервера, при неудаче — голос браузера (speechSynthesis).
import { SPEECH_LANGS } from '../config.js';

// Создаёт сервис воспроизведения; langs — таблица кодов языков для speechSynthesis
export function createPlaybackService({ langs = SPEECH_LANGS } = {}) {
  let currentAudio = null;
  let currentUtterance = null;

  // Останавливает любое воспроизведение и отключает обработчики, чтобы они не вызвали onDone после ручной остановки
  function stop() {
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

  // Проигрывает MP3 по ссылке; если файл не загрузился или автозапуск запрещён — озвучивает fallbackText голосом браузера
  function playAudio({ url, fallbackText, lang, onDone }) {
    const audio = new Audio(url);
    currentAudio = audio;
    let fellBack = false;
    const fallback = () => {
      if (fellBack) return;
      fellBack = true;
      currentAudio = null;
      speak(fallbackText, lang, onDone);
    };
    audio.onended = onDone;
    audio.onerror = fallback;
    audio.play().catch(fallback);
  }

  return { stop, speak, playAudio };
}
