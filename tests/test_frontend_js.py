"""Запускает JS-тесты фронтенда (tests/frontend.test.mjs) в рамках pytest.

Нужен движок JavaScript: JavaScriptCore (jsc, есть на macOS) или Node.js 22+. Если ни того ни другого нет
(например, на чистом сервере), тест пропускается, а не падает.
"""
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
JSC = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc"


def js_command():
    """Команда запуска JS-тестов для доступного движка или None."""
    if Path(JSC).exists():
        return [JSC, "-m", "tests/frontend.test.mjs"]
    if shutil.which("node"):
        return ["node", "tests/frontend.test.mjs"]
    return None


def test_frontend_js_suite_passes():
    command = js_command()
    if command is None:
        pytest.skip("нет движка JavaScript (jsc или node)")
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stdout[-3000:] + result.stderr[-1000:]
    assert " failed" in result.stdout and "0 failed" in result.stdout
