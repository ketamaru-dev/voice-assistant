"""Транслитерация сербского текста: латиница -> кириллица (для озвучки голосами sr-RS)."""
from __future__ import annotations

# Диграфы сербской латиницы обрабатываются раньше одиночных букв
_DIGRAPHS = {"lj": "љ", "nj": "њ", "dž": "џ"}
_LETTERS = dict(zip(
    "abvgdđežzijklmnoprstćufhcčš",
    "абвгдђежзијклмнопрстћуфхцчш",
))


def latin_to_cyrillic(text: str) -> str:
    """Переводит сербский текст из латиницы в кириллицу, сохраняя регистр, цифры и знаки препинания."""
    out: list[str] = []
    i = 0
    while i < len(text):
        pair = text[i:i + 2].lower()
        if pair in _DIGRAPHS:
            letter = _DIGRAPHS[pair]
            out.append(letter.upper() if text[i].isupper() else letter)
            i += 2
            continue
        char = text[i]
        letter = _LETTERS.get(char.lower())
        out.append((letter.upper() if char.isupper() else letter) if letter else char)
        i += 1
    return "".join(out)
