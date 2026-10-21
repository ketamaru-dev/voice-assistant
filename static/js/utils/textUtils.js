// Чистые функции для работы с текстом (без доступа к DOM и сети — легко тестируются).

// Соответствие сербской кириллицы латинице
const CYR_TO_LAT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z', и: 'i', ј: 'j', к: 'k', л: 'l', љ: 'lj',
  м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'ć', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'č',
  ш: 'š', џ: 'dž',
};

// Переводит сербский текст из кириллицы в латиницу, сохраняя регистр (Љ -> Lj, џ -> dž)
export function serbianToLatin(text) {
  return text.replace(/[\u0400-\u04FF]/g, ch => {
    const lat = CYR_TO_LAT[ch.toLowerCase()];
    if (!lat) return ch;
    return ch === ch.toLowerCase() ? lat : lat[0].toUpperCase() + lat.slice(1);
  });
}

// Приводит текст к виду, в котором он показывается и отправляется: сербский — только латиницей
export function normalize(lang, text) {
  return lang === 'sr' ? serbianToLatin(text) : text;
}

// Ключ слова для сравнения: нижний регистр без знаков препинания
const normKey = word => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// Нормализованный текст для сравнения: слова ключами через пробел, без регистра и пунктуации
const normText = text => text.split(/\s+/).map(normKey).filter(Boolean).join(' ');

// Сворачивает фразу, целиком повторённую несколько раз подряд ("да да да" -> "да")
function collapseRepeats(words) {
  const keys = words.map(normKey);
  for (let period = 1; period <= keys.length / 2; period++) {
    if (keys.length % period === 0 && keys.every((key, i) => key === keys[i % period])) return words.slice(0, period);
  }
  return words;
}

// Собирает итоговый текст из списка результатов Web Speech API без дублей.
// Android Chrome в режиме continuous присылает накопительные и исправленные версии одной фразы
// (финал отличается регистром, пунктуацией и даже словами), поэтому результаты сравниваются
// в нормализованном виде: более полная версия заменяет прежнюю, повторы пропускаются.
export function mergeResults(results, lang) {
  const separator = lang === 'zh' || lang === 'ja' ? '' : ' ';
  let acc = '';
  for (let i = 0; i < results.length; i++) {
    // Устаревший промежуточный результат (за ним уже пришёл следующий) пропускаем
    if (results[i].isFinal === false && i < results.length - 1) continue;
    const text = results[i][0].transcript.trim();
    const textN = normText(text);
    if (!textN) continue;
    const accN = normText(acc);

    if (!accN || textN.startsWith(accN)) {
      acc = text; // новая версия дополняет прежнюю
    } else if (accN.includes(textN)) {
      continue; // уже учтено
    } else {
      const accWords = accN.split(' ');
      const textWords = textN.split(' ');
      // Новая версия той же фразы (распознавание поправило слова): общее начало из 2+ слов
      let common = 0;
      while (common < accWords.length && common < textWords.length && accWords[common] === textWords[common]) common++;
      if (common >= 2) { acc = text; continue; }
      // Иначе это продолжение: убираем перекрытие хвоста и начала по словам и дописываем остаток
      let overlap = Math.min(accWords.length, textWords.length);
      while (overlap > 0 && accWords.slice(-overlap).join(' ') !== textWords.slice(0, overlap).join(' ')) overlap--;
      acc += separator + text.split(/\s+/).slice(overlap).join(separator);
    }
  }
  return lang === 'zh' || lang === 'ja' ? acc : collapseRepeats(acc.split(/\s+/)).join(' ');
}

// Дописывает к накопленному тексту acc сегмент segment, распознанный в новой сессии записи.
// Дубли не добавляются (на случай, если браузер повторно прислал уже накопленное), а сегмент,
// который начинается с накопленного текста, заменяет его целиком как более полная версия.
export function appendSegment(acc, segment, lang) {
  const text = segment.trim();
  if (!text) return acc;
  if (!acc) return text;
  const accN = normText(acc);
  const textN = normText(text);
  if (!textN || accN.endsWith(textN)) return acc;
  if (textN.startsWith(accN)) return text;
  return acc + (lang === 'zh' || lang === 'ja' ? '' : ' ') + text;
}
