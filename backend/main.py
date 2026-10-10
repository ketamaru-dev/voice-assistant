import asyncio
import os
import re
import secrets
import tempfile
from pathlib import Path

import edge_tts
from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from groq import Groq, NotFoundError
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

APP_USER = os.getenv("APP_USER")
APP_PASSWORD = os.getenv("APP_PASSWORD")
if not APP_USER or not APP_PASSWORD:
    raise RuntimeError("Задайте APP_USER и APP_PASSWORD в backend/.env")

security = HTTPBasic()


def check_credentials(credentials: HTTPBasicCredentials) -> str:
    user_ok = secrets.compare_digest(credentials.username.encode("utf-8"), APP_USER.encode("utf-8"))
    pass_ok = secrets.compare_digest(credentials.password.encode("utf-8"), APP_PASSWORD.encode("utf-8"))
    if not (user_ok and pass_ok):
        raise HTTPException(
            status_code=401,
            detail="Неверный логин или пароль",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


def authenticate(credentials: HTTPBasicCredentials = Depends(security)) -> str:
    return check_credentials(credentials)


class AuthStaticFiles(StaticFiles):
    # Mount не поддерживает dependencies, поэтому проверяем Basic Auth прямо перед отдачей статики
    async def get_response(self, path, scope):
        check_credentials(await security(Request(scope)))
        return await super().get_response(path, scope)


app = FastAPI(title="Voice Translator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

MODEL_NAME = "gpt-oss-20b"
MODEL_IDS = [MODEL_NAME, f"openai/{MODEL_NAME}"]

AUDIO_PREFIX = "voice_"
AUDIO_NAME_RE = re.compile(r"^voice_[A-Za-z0-9_-]+\.mp3$")
MAX_TEXT_LENGTH = 5000
MAX_AUDIO_BYTES = 10 * 1024 * 1024

VOICE_MAPPING = {
    "ru": "ru-RU-SvetlanaNeural",
    "en": "en-US-AvaNeural",
    "sr": "sr-RS-SophieNeural",
    "de": "de-DE-KatjaNeural",
    "es": "es-ES-ElviraNeural",
    "fr": "fr-FR-DeniseNeural",
    "it": "it-IT-ElsaNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
    "ja": "ja-JP-NanamiNeural",
}


VOICE_KEYWORDS = [
    ("sr", ["serb", "srp", "срп", "серб"]),
    ("ru", ["rus", "рус"]),
    ("en", ["eng", "англ"]),
    ("de", ["ger", "deu", "нем"]),
    ("es", ["spa", "esp", "исп"]),
    ("fr", ["fre", "fra", "фра"]),
    ("it", ["ita", "итал"]),
    ("zh", ["chi", "中文", "кит"]),
    ("ja", ["jap", "日本", "япон"]),
]


def get_voice_for_language(target_lang: str) -> str:
    lang = str(target_lang).lower().strip()
    print(f"[DEBUG] Входящий target_lang в Python: '{target_lang}' (обработанный: '{lang}')")
    code = lang.replace("_", "-").split("-")[0]

    # Точный код языка ("sr", "ru-RU", ...) имеет приоритет над поиском по названию
    if code in VOICE_MAPPING:
        print(f"[DEBUG] -> Определён язык по коду '{code}': {VOICE_MAPPING[code]}")
        return VOICE_MAPPING[code]
    for key, words in VOICE_KEYWORDS:
        if any(w in lang for w in words):
            print(f"[DEBUG] -> Определён язык '{key}' по названию: {VOICE_MAPPING[key]}")
            return VOICE_MAPPING[key]
    print(f"[DEBUG] -> Язык '{lang}' не распознан, используется дефолтный English!")
    return "en-US-AvaNeural"


_SR_DIGRAPHS = {"lj": "љ", "nj": "њ", "dž": "џ"}
_SR_LETTERS = dict(zip(
    "abvgdđežzijklmnoprstćufhcčš",
    "абвгдђежзијклмнопрстћуфхцчш",
))


def latin_to_cyrillic(text: str) -> str:
    # Голоса sr-RS в Edge TTS рассчитаны на кириллицу: латиницу они читают как английский
    out, i = [], 0
    while i < len(text):
        pair = text[i:i + 2].lower()
        if pair in _SR_DIGRAPHS:
            c = _SR_DIGRAPHS[pair]
            out.append(c.upper() if text[i].isupper() else c)
            i += 2
            continue
        ch = text[i]
        c = _SR_LETTERS.get(ch.lower())
        out.append((c.upper() if ch.isupper() else c) if c else ch)
        i += 1
    return "".join(out)


class TranslationRequest(BaseModel):
    text: str = Field(max_length=MAX_TEXT_LENGTH)
    source_lang: str = Field(max_length=32)  # например, "ru", "en", "sr"
    target_lang: str = Field(max_length=32)  # например, "en", "sr", "ru"


def translate_text(prompt: str, text: str) -> str:
    global MODEL_IDS
    last_error = None
    for model_id in MODEL_IDS:
        try:
            completion = groq_client.chat.completions.create(
                model=model_id,
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": text},
                ],
                temperature=0.3,
            )
            MODEL_IDS = [model_id]
            return completion.choices[0].message.content.strip()
        except NotFoundError as e:
            print(f"Модель {model_id} не найдена, пробуем другое написание...")
            last_error = e
    raise last_error


TTS_ATTEMPTS = 3


async def synthesize_speech(text: str, voice: str):
    # Edge TTS периодически отвечает 403 (лимит запросов со стороны Microsoft), поэтому делаем
    # несколько попыток с растущей паузой. Если не вышло — возвращаем None, перевод всё равно отдаётся,
    # а страница озвучит его голосом браузера.
    for attempt in range(1, TTS_ATTEMPTS + 1):
        temp_file = tempfile.NamedTemporaryFile(delete=False, prefix=AUDIO_PREFIX, suffix=".mp3")
        temp_file.close()
        try:
            await edge_tts.Communicate(text, voice).save(temp_file.name)
            return os.path.basename(temp_file.name)
        except Exception as e:
            remove_file(temp_file.name)
            print(f"[TTS] Попытка {attempt}/{TTS_ATTEMPTS} не удалась: {e}")
            if attempt < TTS_ATTEMPTS:
                await asyncio.sleep(0.7 * attempt)
    return None


@app.post("/api/translate", dependencies=[Depends(authenticate)])
async def translate(request: TranslationRequest):
    if not request.text.strip():
        return {"original_text": request.text, "translated_text": "", "audio_url": None}

    prompt = (
        f"Ты точный переводчик. Переведи текст с языка '{request.source_lang}' на язык "
        f"'{request.target_lang}'. Возвращай ИСКЛЮЧИТЕЛЬНО готовый перевод без вводных слов, "
        "пояснений и кавычек."
    )

    try:
        translated_text = await run_in_threadpool(translate_text, prompt, request.text)

        voice = get_voice_for_language(request.target_lang)
        print(f"[TTS LOG] Входной язык: '{request.target_lang}' -> Выбран голос: '{voice}'")
        tts_text = latin_to_cyrillic(translated_text) if voice.startswith("sr-") else translated_text
        audio_name = await synthesize_speech(tts_text, voice)

        return {
            "original_text": request.text,
            "translated_text": translated_text,
            "audio_url": f"/api/audio/{audio_name}" if audio_name else None,
        }
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail="Ошибка обработки запроса")


def remove_file(path: str):
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception as e:
        print(f"Ошибка при удалении временного файла {path}: {e}")


@app.get("/api/audio/{filename}", dependencies=[Depends(authenticate)])
async def get_audio(filename: str, background_tasks: BackgroundTasks):
    safe_filename = os.path.basename(filename)
    if safe_filename != filename or not AUDIO_NAME_RE.match(safe_filename):
        raise HTTPException(status_code=404, detail="Аудио не найдено")

    temp_dir = os.path.realpath(tempfile.gettempdir())
    file_path = os.path.join(temp_dir, safe_filename)
    real_path = os.path.realpath(file_path)
    if (
        os.path.commonpath([temp_dir, real_path]) != temp_dir
        or os.path.islink(file_path)
        or not os.path.isfile(real_path)
    ):
        raise HTTPException(status_code=404, detail="Аудио не найдено")

    try:
        if os.path.getsize(real_path) > MAX_AUDIO_BYTES:
            raise HTTPException(status_code=413, detail="Файл слишком большой")
        # Отдаём весь файл одним ответом из памяти: браузер не делает повторных Range-запросов
        # к уже удалённому файлу (из-за них озвучка периодически обрывалась с 416/404)
        with open(real_path, "rb") as f:
            data = f.read()
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail="Ошибка обработки запроса")

    background_tasks.add_task(remove_file, real_path)
    return Response(content=data, media_type="audio/mpeg")


# Монтируется последним, чтобы API-роуты, объявленные выше, имели приоритет.
app.mount("/", AuthStaticFiles(directory=BASE_DIR.parent / "static", html=True), name="static")
