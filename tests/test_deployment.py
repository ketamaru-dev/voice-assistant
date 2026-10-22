"""Проверки готовности к развёртыванию на сервере (pytest).

Что проверяется: зависимости, синтаксис под минимальную версию Python, описание переменных окружения,
отсутствие секретов в репозитории, запуск настоящего сервера uvicorn обоими способами и поведение
при неверной конфигурации. Внешние сервисы (Groq, Edge TTS) не вызываются.

Запуск из корня проекта:  venv/bin/pytest -v      (быстрые проверки без сервера:  pytest -m "not slow")
"""
import ast
import importlib.metadata as metadata
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
STATIC = ROOT / "static"
MIN_PYTHON = (3, 10)  # fastapi, starlette, uvicorn, groq и aiohttp требуют Python 3.10+

# Сопоставление имён импортируемых модулей и пакетов PyPI
IMPORT_TO_DIST = {"dotenv": "python-dotenv", "edge_tts": "edge-tts"}
# Пакеты, которые приходят как зависимости fastapi (в requirements.txt отдельно не нужны)
TRANSITIVE = {"pydantic", "starlette"}

AUTH_USER, AUTH_PASSWORD = "deploy_user", "deploy-test-password-123"


# ---------------------------------------------------------------------------
# Вспомогательные функции
# ---------------------------------------------------------------------------
def backend_sources():
    """Все .py-файлы backend (без кэша)."""
    return [p for p in BACKEND.rglob("*.py") if "__pycache__" not in p.parts]


def parse_requirements(path: Path):
    """Читает requirements-файл: возвращает список (имя пакета, спецификатор версии)."""
    from packaging.requirements import Requirement

    result = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#")[0].strip()
        if not line or line.startswith("-r"):
            continue
        req = Requirement(line)
        result.append((req.name, req.specifier))
    return result


def free_port() -> int:
    """Свободный TCP-порт на localhost."""
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def clean_env(**extra) -> dict:
    """Окружение для подпроцесса без унаследованных настроек приложения (чтобы тест был воспроизводимым)."""
    env = {k: v for k, v in os.environ.items() if not k.startswith(("GROQ_", "APP_", "MAX_", "LLM_", "TTS_", "AUDIO_", "STATIC_", "RATE_", "ENABLE_", "ALLOWED_", "MODEL_", "LOG_", "CLEANUP_", "AUTH_", "TOKEN_", "LOGIN_"))}
    env.update(extra)
    return env


def app_env(tmp_path: Path, **overrides) -> dict:
    """Минимальная корректная конфигурация приложения для запуска в подпроцессе (overrides заменяют значения по умолчанию)."""
    settings = dict(
        GROQ_API_KEY="test-key", APP_USER=AUTH_USER, APP_PASSWORD=AUTH_PASSWORD,
        STATIC_DIR=str(STATIC), AUDIO_DIR=str(tmp_path / "audio"),
        MAX_TEXT_LENGTH="10000", RATE_LIMIT_PER_MINUTE="0", ENABLE_DOCS="true",
    )
    settings.update(overrides)
    return clean_env(**settings)


_TOKENS: dict = {}


def login_token(port: int) -> str:
    """Входит под тестовым пользователем и возвращает Bearer-токен (кэшируется на время работы сервера)."""
    if port not in _TOKENS:
        status, _, body = http(port, "/api/login", auth=False, method="POST", body={"username": AUTH_USER, "password": AUTH_PASSWORD})
        assert status == 200, body
        _TOKENS[port] = json.loads(body)["access_token"]
    return _TOKENS[port]


def http(port: int, path: str, *, auth=True, method="GET", body=None):
    """HTTP-запрос к локальному серверу (auth=True добавляет Bearer-токен): возвращает (статус, заголовки, тело)."""
    headers = {"Authorization": f"Bearer {login_token(port)}"} if auth else {}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, {k.lower(): v for k, v in response.headers.items()}, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        return error.code, {k.lower(): v for k, v in error.headers.items()}, error.read().decode("utf-8", "replace")


# ---------------------------------------------------------------------------
# Зависимости и совместимость
# ---------------------------------------------------------------------------
def test_python_version_is_supported():
    assert sys.version_info >= MIN_PYTHON, f"нужен Python {MIN_PYTHON[0]}.{MIN_PYTHON[1]}+"


@pytest.mark.parametrize("path", backend_sources(), ids=lambda p: str(p.relative_to(ROOT)))
def test_backend_syntax_is_compatible_with_minimum_python(path):
    """Код не использует синтаксис новее минимальной поддерживаемой версии Python."""
    ast.parse(path.read_text(encoding="utf-8"), filename=str(path), feature_version=MIN_PYTHON)


def test_requirements_cover_every_third_party_import():
    """Каждая сторонняя библиотека, импортируемая в backend, есть в requirements.txt (или приходит с fastapi)."""
    declared = {name.lower().replace("_", "-") for name, _ in parse_requirements(BACKEND / "requirements.txt")}
    imported = set()
    for path in backend_sources():
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Import):
                imported |= {alias.name.split(".")[0] for alias in node.names}
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                imported.add(node.module.split(".")[0])
    third_party = {m for m in imported if m not in sys.stdlib_module_names and m != "backend"}
    missing = {m for m in third_party if IMPORT_TO_DIST.get(m, m).lower() not in declared and m not in TRANSITIVE}
    assert not missing, f"не указаны в requirements.txt: {sorted(missing)}"


def test_requirements_have_no_unused_packages():
    """В requirements.txt нет пакетов, которые код не использует (лишнее на сервере ставить незачем)."""
    imported = set()
    for path in backend_sources():
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Import):
                imported |= {alias.name.split(".")[0] for alias in node.names}
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                imported.add(node.module.split(".")[0])
    used_dists = {IMPORT_TO_DIST.get(m, m).lower() for m in imported}
    # uvicorn запускается командой, а не импортируется
    unused = [n for n, _ in parse_requirements(BACKEND / "requirements.txt") if n.lower() not in used_dists and n.lower() != "uvicorn"]
    assert not unused, f"лишние зависимости: {unused}"


@pytest.mark.parametrize("name,specifier", parse_requirements(BACKEND / "requirements.txt"), ids=lambda v: str(v))
def test_installed_versions_satisfy_requirements(name, specifier):
    """Установленные в окружении версии удовлетворяют requirements.txt (иначе на сервере всё поведёт себя иначе)."""
    installed = metadata.version(name)
    assert specifier.contains(installed, prereleases=True), f"{name} {installed} не подходит под {specifier}"


def test_dev_requirements_include_runtime_and_pytest():
    text = (BACKEND / "requirements-dev.txt").read_text(encoding="utf-8")
    assert "-r requirements.txt" in text
    assert "pytest" in text


# ---------------------------------------------------------------------------
# Конфигурация и секреты
# ---------------------------------------------------------------------------
def test_env_example_documents_every_setting():
    """Каждая переменная окружения из config.py описана в .env.example."""
    config = (BACKEND / "core" / "config.py").read_text(encoding="utf-8")
    names = set(re.findall(r'(?:_env_int|_env_bool|_env_list|os\.getenv|os\.environ\.get)\(\s*"([A-Z_]+)"', config))
    names |= set(re.findall(r'os\.environ\["([A-Z_]+)"\]', config))
    required = re.search(r"for name in \(([^)]*)\)", config)
    names |= set(re.findall(r'"([A-Z_]+)"', required.group(1))) if required else set()
    example = (BACKEND / ".env.example").read_text(encoding="utf-8")
    undocumented = sorted(n for n in names if n not in example)
    assert names, "не удалось найти переменные окружения в config.py"
    assert not undocumented, f"не описаны в .env.example: {undocumented}"


def test_env_example_contains_no_real_secrets():
    example = (BACKEND / ".env.example").read_text(encoding="utf-8")
    assert "gsk_" not in example
    assert "your_groq_api_key" in example


def tracked_and_untracked_files():
    """Файлы, которые попадут в git (отслеживаемые и неотслеживаемые, но не игнорируемые)."""
    git = shutil.which("git")
    if not git or not (ROOT / ".git").exists():
        pytest.skip("git недоступен")
    out = subprocess.run([git, "ls-files", "--cached", "--others", "--exclude-standard"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return [ROOT / line for line in out.splitlines() if (ROOT / line).is_file()]


def test_env_file_is_gitignored():
    files = {p.relative_to(ROOT).as_posix() for p in tracked_and_untracked_files()}
    assert "backend/.env" not in files, "backend/.env не должен попадать в git"


SECRET_PATTERNS = {
    "Groq": re.compile(r"gsk_[A-Za-z0-9]{20,}"),
    "Google": re.compile(r"AIza[0-9A-Za-z_\-]{30,}"),
    "Gemini": re.compile(r"\bAQ\.[A-Za-z0-9_\-]{30,}"),
    "приватный ключ": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
}


def test_no_secrets_in_repository_files():
    """В файлах, которые уйдут в git, нет ключей API (проверка по шаблонам, как у типовых сканеров секретов)."""
    leaks = []
    for path in tracked_and_untracked_files():
        if path.suffix in {".png", ".jpg", ".ico", ".woff", ".woff2", ".pyc"} or path.stat().st_size > 2_000_000:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for label, pattern in SECRET_PATTERNS.items():
            if pattern.search(text):
                leaks.append(f"{label}: {path.relative_to(ROOT)}")
    assert not leaks, f"найдены секреты: {leaks}"


# ---------------------------------------------------------------------------
# Развёртывание копированием папки и неверная конфигурация
# ---------------------------------------------------------------------------
@pytest.fixture
def deployed_copy(tmp_path):
    """Копия backend без .env и кэша — как папка, залитая на сервер."""
    target = tmp_path / "srv"
    shutil.copytree(BACKEND, target / "backend", ignore=shutil.ignore_patterns(".env", "__pycache__"))
    shutil.copytree(STATIC, target / "static")
    return target


def run_import(cwd: Path, env: dict):
    """Импортирует приложение в чистом подпроцессе."""
    return subprocess.run([sys.executable, "-c", "import backend.main"], cwd=cwd, env=env, capture_output=True, text=True, timeout=60)


def test_app_refuses_to_start_without_required_settings(deployed_copy):
    result = run_import(deployed_copy, clean_env())
    assert result.returncode != 0
    for name in ("GROQ_API_KEY", "APP_USER", "APP_PASSWORD"):
        assert name in result.stderr, f"в сообщении об ошибке нет {name}"


def test_app_refuses_to_start_with_invalid_number(deployed_copy, tmp_path):
    result = run_import(deployed_copy, app_env(tmp_path, MAX_TEXT_LENGTH="много"))
    assert result.returncode != 0
    assert "MAX_TEXT_LENGTH" in result.stderr


def test_app_fails_fast_when_static_dir_is_missing(deployed_copy, tmp_path):
    result = run_import(deployed_copy, app_env(tmp_path, STATIC_DIR=str(tmp_path / "нет_такой_папки")))
    assert result.returncode != 0


def test_deployed_copy_imports_with_valid_settings(deployed_copy, tmp_path):
    env = app_env(tmp_path)
    env["STATIC_DIR"] = str(deployed_copy / "static")
    result = run_import(deployed_copy, env)
    assert result.returncode == 0, result.stderr


def test_audio_dir_is_created_with_owner_only_access(deployed_copy, tmp_path):
    audio_dir = tmp_path / "private_audio"
    env = app_env(tmp_path, AUDIO_DIR=str(audio_dir))
    env["STATIC_DIR"] = str(deployed_copy / "static")
    code = "import backend.main\nfrom backend.dependencies import get_audio_repository\nget_audio_repository()"
    result = subprocess.run([sys.executable, "-c", code], cwd=deployed_copy, env=env, capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stderr
    assert audio_dir.is_dir()
    if os.name == "posix":
        assert (audio_dir.stat().st_mode & 0o077) == 0, "папка с аудио должна быть закрыта для других пользователей"


# ---------------------------------------------------------------------------
# Настоящий сервер uvicorn (оба способа запуска)
# ---------------------------------------------------------------------------
LAUNCH_MODES = {
    "из корня: uvicorn backend.main:app": (ROOT, "backend.main:app"),
    "из backend: uvicorn main:app": (BACKEND, "main:app"),
}


@pytest.fixture(params=LAUNCH_MODES, ids=list(LAUNCH_MODES))
def server(request, tmp_path):
    """Запускает uvicorn в подпроцессе, ждёт готовности и останавливает после теста."""
    cwd, target = LAUNCH_MODES[request.param]
    port = free_port()
    process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", target, "--host", "127.0.0.1", "--port", str(port)],
        cwd=cwd, env=app_env(tmp_path), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    try:
        deadline = time.time() + 30
        while time.time() < deadline:
            if process.poll() is not None:
                raise RuntimeError("сервер завершился при старте:\n" + process.stdout.read())
            try:
                if http(port, "/healthz", auth=False)[0] == 200:
                    break
            except OSError:
                time.sleep(0.2)
        else:
            raise RuntimeError("сервер не поднялся за 30 секунд")
        yield port
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()


@pytest.mark.slow
def test_server_health_and_bearer_protection(server):
    assert http(server, "/healthz", auth=False)[0] == 200
    status, headers, _ = http(server, "/api/session", auth=False)
    assert status == 401
    assert headers.get("www-authenticate") == "Bearer"
    assert http(server, "/api/session")[0] == 200


@pytest.mark.slow
def test_server_login_flow(server):
    assert http(server, "/api/login", auth=False, method="POST", body={"username": AUTH_USER, "password": "wrong"})[0] == 401
    status, _, body = http(server, "/api/login", auth=False, method="POST", body={"username": AUTH_USER, "password": AUTH_PASSWORD})
    assert status == 200 and json.loads(body)["token_type"] == "bearer"


@pytest.mark.slow
def test_server_blocks_password_guessing(server):
    wrong = {"username": AUTH_USER, "password": "wrong"}
    codes = [http(server, "/api/login", auth=False, method="POST", body=wrong)[0] for _ in range(12)]
    assert codes[:10] == [401] * 10
    assert 429 in codes[10:], "после 10 попыток в минуту вход должен блокироваться"
    # Даже верный пароль не пускает, пока лимит исчерпан
    assert http(server, "/api/login", auth=False, method="POST", body={"username": AUTH_USER, "password": AUTH_PASSWORD})[0] == 429


@pytest.mark.slow
def test_server_serves_page_and_all_modules(server):
    status, _, html = http(server, "/", auth=False)  # страница публичная: токен проверяется на уровне API
    assert status == 200
    assert 'id="mic-from"' in html
    status, _, login_html = http(server, "/login", auth=False)
    assert status == 200 and 'id="login-form"' in login_html
    assert http(server, "/login.html", auth=False)[0] == 200
    # Все модули, на которые ссылаются import-ы, отдаются с JavaScript MIME-типом
    pending, seen = ["/js/main.js", "/js/login.js"], set()
    while pending:
        path = pending.pop()
        if path in seen:
            continue
        seen.add(path)
        status, headers, source = http(server, path, auth=False)
        assert status == 200, path
        assert "javascript" in headers.get("content-type", ""), path
        for rel in re.findall(r"from '(\.[^']+)'", source):
            pending.append(os.path.normpath(os.path.join(os.path.dirname(path), rel)).replace(os.sep, "/"))
    assert len(seen) >= 12


@pytest.mark.slow
def test_server_security_headers_and_docs(server):
    _, headers, _ = http(server, "/healthz", auth=False)
    assert headers.get("x-content-type-options") == "nosniff"
    assert "microphone=(self)" in headers.get("permissions-policy", "")
    # В тестовой конфигурации ENABLE_DOCS=true: документация открыта, но сами эндпоинты всё равно требуют токен
    assert http(server, "/docs", auth=False)[0] == 200
    assert "/api/translate" in http(server, "/openapi.json", auth=False)[2]


@pytest.mark.slow
def test_server_validates_translate_requests_without_external_calls(server):
    assert http(server, "/api/translate", auth=False, method="POST", body={})[0] == 401
    assert http(server, "/api/translate", method="POST", body={"text": "x"})[0] == 422
    bad_lang = {"text": "x", "source_lang": "ru", "target_lang": "en'; DROP"}
    assert http(server, "/api/translate", method="POST", body=bad_lang)[0] == 422
    too_long = {"text": "а" * 10001, "source_lang": "ru", "target_lang": "en"}
    assert http(server, "/api/translate", method="POST", body=too_long)[0] == 422
    empty = http(server, "/api/translate", method="POST", body={"text": "  ", "source_lang": "ru", "target_lang": "en"})
    assert empty[0] == 200 and json.loads(empty[2])["translated_text"] == ""


@pytest.mark.slow
def test_server_blocks_audio_path_traversal(server):
    for bad in ("..%2F..%2Fetc%2Fpasswd", "voice_x.txt", "passwd", "voice_missing.mp3"):
        assert http(server, f"/api/audio/{bad}")[0] == 404, bad
