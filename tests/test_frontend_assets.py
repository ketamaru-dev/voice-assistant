"""Проверки статических файлов фронтенда: темы, переменные CSS, разметка переключателя.

Запуск из корня проекта:  venv/bin/python -m unittest discover -s tests -t . -v
"""
import re
import unittest
from pathlib import Path

STATIC = Path(__file__).resolve().parent.parent / "static"
CSS = (STATIC / "css" / "styles.css").read_text(encoding="utf-8")
HTML = (STATIC / "index.html").read_text(encoding="utf-8")
THEME_INIT = (STATIC / "js" / "theme-init.js").read_text(encoding="utf-8")


def block_for(selector_fragment: str) -> str:
    """Возвращает тело CSS-блока, чей селектор содержит заданный фрагмент."""
    for match in re.finditer(r"([^{}]+)\{([^{}]*)\}", CSS):
        if selector_fragment in match.group(1):
            return match.group(2)
    raise AssertionError(f"Блок {selector_fragment!r} не найден")


def declared_vars(body: str) -> set:
    """Имена CSS-переменных, объявленных в теле блока."""
    return set(re.findall(r"(--[\w-]+)\s*:", body))


class ThemeCssTests(unittest.TestCase):
    def test_light_and_dark_define_same_variables(self):
        light = declared_vars(block_for(':root[data-theme="light"]'))
        dark = declared_vars(block_for(':root[data-theme="dark"]'))
        self.assertEqual(light - dark, set(), "переменные есть только в светлой теме")
        self.assertEqual(dark - light, set(), "переменные есть только в тёмной теме")

    def test_every_used_variable_is_defined(self):
        defined = set(re.findall(r"(--[\w-]+)\s*:", CSS))
        used = set(re.findall(r"var\((--[\w-]+)", CSS))
        self.assertEqual(used - defined, set(), "используются необъявленные переменные")

    def test_light_is_default_and_buttons_are_same_neutral_in_both_themes(self):
        light = block_for(':root[data-theme="light"]')
        dark = block_for(':root[data-theme="dark"]')
        self.assertRegex(light, r"--page-bg:\s*#f")   # почти белый фон
        self.assertRegex(dark, r"--page-bg:\s*#000")  # чёрный фон
        # Кнопки: один и тот же нейтральный светлый цвет в обеих темах (без синего и красного акцентов)
        for name in ("--btn-a", "--btn-b", "--btn-icon"):
            self.assertEqual(re.search(name + r":\s*([^;]+);", light).group(1),
                             re.search(name + r":\s*([^;]+);", dark).group(1), name)
        channels = [int(x) for x in re.search(r"--btn-a:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)", light).groups()]
        self.assertGreater(min(channels), 220, "кнопка должна быть светлой")
        self.assertLess(max(channels) - min(channels), 15, "кнопка не должна иметь выраженного оттенка")

    def test_no_saturated_red_or_blue_accents_on_buttons(self):
        for removed in ("--rec-a", "--proc-a", "rgb(255,69,58)", "rgb(10,132,255)", "#ff453a"):
            self.assertNotIn(removed, CSS, removed)

    def test_braces_balanced(self):
        self.assertEqual(CSS.count("{"), CSS.count("}"))

    def test_hover_only_for_real_pointers_and_touch_targets_enlarged(self):
        self.assertIn("@media (hover: hover) and (pointer: fine)", CSS)
        self.assertIn("@media (pointer: coarse)", CSS)
        self.assertIn("@media (min-width: 768px)", CSS)
        # hover-правила не должны быть вне media query
        outside = re.sub(r"@media \(hover: hover\) and \(pointer: fine\)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}", "", CSS)
        self.assertNotIn(":hover", outside)


class HtmlTests(unittest.TestCase):
    def test_viewport_and_color_scheme_meta(self):
        self.assertIn('<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">', HTML)
        self.assertIn('<meta name="color-scheme" content="light dark">', HTML)
        self.assertIn('<meta name="theme-color"', HTML)

    def test_theme_init_runs_before_styles_and_after_meta(self):
        self.assertLess(HTML.index('name="theme-color"'), HTML.index("js/theme-init.js"))
        self.assertLess(HTML.index("js/theme-init.js"), HTML.index("css/styles.css"))

    def test_toggle_has_both_icons_and_accessibility(self):
        self.assertIn('role="radiogroup"', HTML)
        self.assertIn('id="theme-light"', HTML)
        self.assertIn('id="theme-dark"', HTML)
        self.assertEqual(HTML.count('role="radio"'), 2)
        self.assertIn('class="sun-rays"', HTML)
        self.assertIn('class="moon-shape"', HTML)

    def test_required_ids_present(self):
        for element_id in ["lang-from", "lang-to", "swap-btn", "mic-from", "mic-to", "retry-btn", "status",
                           "source-text", "translated-text", "theme-toggle"]:
            self.assertIn(f'id="{element_id}"', HTML, element_id)

    def test_no_hotkey_hints_on_screen(self):
        for leftover in ("<kbd", "kbd-hint", "kbd-legend", "Клавиши:"):
            self.assertNotIn(leftover, HTML, leftover)
        self.assertNotIn("kbd-", CSS)

    def test_no_hardcoded_light_on_dark_colors_left(self):
        for leftover in ("text-white/", "bg-white/", "focus:ring-"):
            self.assertNotIn(leftover, HTML, leftover)


class ThemeInitScriptTests(unittest.TestCase):
    def test_uses_same_key_and_query_as_service(self):
        config = (STATIC / "js" / "config.js").read_text(encoding="utf-8")
        key = re.search(r"THEME_STORAGE_KEY = '([^']+)'", config).group(1)
        query = re.search(r"DARK_SCHEME_QUERY = '([^']+)'", config).group(1)
        self.assertIn(key, THEME_INIT)
        self.assertIn(query, THEME_INIT)


if __name__ == "__main__":
    unittest.main()
