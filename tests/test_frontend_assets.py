"""Проверки статических файлов фронтенда: темы, переменные CSS, разметка переключателя.

Запуск из корня проекта:  venv/bin/python -m unittest discover -s tests -t . -v
"""
import re
import unittest
from pathlib import Path

STATIC = Path(__file__).resolve().parent.parent / "static"
CSS = (STATIC / "css" / "styles.css").read_text(encoding="utf-8")
HTML = (STATIC / "index.html").read_text(encoding="utf-8")
LOGIN_HTML = (STATIC / "login.html").read_text(encoding="utf-8")
AUTH_GUARD = (STATIC / "js" / "auth-guard.js").read_text(encoding="utf-8")
CONFIG_JS = (STATIC / "js" / "config.js").read_text(encoding="utf-8")
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


class PerformanceCssTests(unittest.TestCase):
    """Смена темы и эффекты не должны тормозить телефоны: никаких тяжёлых переходов и фильтров."""

    def test_theme_switch_has_no_global_transitions(self):
        self.assertNotIn("theme-animating", CSS)
        self.assertNotIn("@property", CSS)
        self.assertNotRegex(CSS, r"(html|:root)[^{}]*\*[^{}]*\{[^{}]*transition")  # transition на всех элементах
        self.assertNotRegex(CSS, r":root\s*\{[^{}]*transition")  # плавные переходы переменных цвета на корне

    def test_background_is_static_and_not_blurred(self):
        orb = block_for(".orb ")
        self.assertNotIn("blur", orb)
        self.assertNotIn("animation", orb)
        self.assertNotIn("@keyframes float", CSS)
        self.assertNotRegex(re.sub(r"/\*.*?\*/", "", CSS, flags=re.S), r"[^-]filter:\s*blur")  # комментарии не в счёт

    def test_backdrop_blur_is_disabled_on_touch_and_narrow_screens(self):
        self.assertRegex(CSS, r"@media \(pointer: coarse\), \(max-width: 767px\)\s*\{\s*\.glass \{ backdrop-filter: none")
        self.assertNotIn("saturate(", CSS)

    def test_recording_animation_uses_only_transform_and_opacity(self):
        for name in ("pulse", "ring", "breathe"):
            body = re.search(r"@keyframes " + name + r"\s*\{(.*?)\}\s*(?=@|/\*|\.|\n\n)", CSS, re.S).group(1)
            self.assertNotIn("box-shadow", body, name)
        self.assertIn(".mic.recording::after", CSS)

    def test_no_tailwind_runtime_or_filter_utilities_in_pages(self):
        for page in (HTML, LOGIN_HTML):
            self.assertNotIn("tailwindcss", page)
            self.assertNotIn("drop-shadow", page)

    def test_every_class_used_in_pages_is_defined_in_css(self):
        defined = set(re.findall(r"\.([A-Za-z][\w-]*)", CSS))
        markers = {"moon-shape", "sun-core", "panel-langs"}  # метки без стилей
        for name, page in (("index.html", HTML), ("login.html", LOGIN_HTML)):
            used = set()
            for match in re.finditer(r'class="([^"]+)"', page):
                used |= set(match.group(1).split())
            self.assertEqual(used - defined - markers, set(), f"{name}: классы без стилей (остатки Tailwind?)")


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


class LoginPageTests(unittest.TestCase):
    def test_form_fields_and_accessibility(self):
        for element_id in ("login-form", "login-username", "login-password", "login-submit", "login-error", "login-reveal", "theme-toggle"):
            self.assertIn(f'id="{element_id}"', LOGIN_HTML, element_id)
        self.assertIn('type="password"', LOGIN_HTML)
        self.assertIn('autocomplete="username"', LOGIN_HTML)
        self.assertIn('autocomplete="current-password"', LOGIN_HTML)
        self.assertIn('role="alert"', LOGIN_HTML)
        self.assertRegex(LOGIN_HTML, r'<label[^>]*for="login-username"')
        self.assertRegex(LOGIN_HTML, r'<label[^>]*for="login-password"')

    def test_same_design_and_theme_handling_as_app(self):
        self.assertIn('width=device-width, initial-scale=1.0, viewport-fit=cover', LOGIN_HTML)
        self.assertLess(LOGIN_HTML.index("js/theme-init.js"), LOGIN_HTML.index("css/styles.css"))
        self.assertIn('class="glass login-card"', LOGIN_HTML)
        self.assertIn("bg-orbs", LOGIN_HTML)
        self.assertIn('<script type="module" src="js/login.js"></script>', LOGIN_HTML)
        self.assertNotRegex(LOGIN_HTML, r"<script>[^<]+</script>")  # без встроенных скриптов

    def test_login_page_is_not_indexed_and_has_no_auth_guard(self):
        self.assertIn('name="robots" content="noindex"', LOGIN_HTML)
        self.assertNotIn("auth-guard", LOGIN_HTML)  # иначе страница входа отправляла бы на саму себя


class AuthGuardTests(unittest.TestCase):
    def test_app_page_runs_guard_before_render_and_has_logout(self):
        self.assertIn("js/auth-guard.js", HTML)
        self.assertLess(HTML.index("js/auth-guard.js"), HTML.index("css/styles.css"))
        self.assertIn('id="logout-btn"', HTML)

    def test_guard_uses_same_key_and_login_page_as_repository(self):
        key = re.search(r"TOKEN_STORAGE_KEY = '([^']+)'", CONFIG_JS).group(1)
        login_page = re.search(r"LOGIN_PAGE = '([^']+)'", CONFIG_JS).group(1)
        self.assertIn(key, AUTH_GUARD)
        self.assertIn(f"replace('{login_page}')", AUTH_GUARD)


class ThemeInitScriptTests(unittest.TestCase):
    def test_uses_same_key_and_query_as_service(self):
        config = (STATIC / "js" / "config.js").read_text(encoding="utf-8")
        key = re.search(r"THEME_STORAGE_KEY = '([^']+)'", config).group(1)
        query = re.search(r"DARK_SCHEME_QUERY = '([^']+)'", config).group(1)
        self.assertIn(key, THEME_INIT)
        self.assertIn(query, THEME_INIT)


if __name__ == "__main__":
    unittest.main()
