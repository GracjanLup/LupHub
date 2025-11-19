import asyncio
import logging
import os
import re
from datetime import datetime
from typing import List, Optional

import requests
from fastapi import File, FastAPI, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from static.assets.CreatorAPI import GenerationError, generate_price_list

# Configure logging
logging.basicConfig(level=logging.ERROR)

app = FastAPI()

# Static & templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# LLM configuration (override via env when Mistral-7B is ready)
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "http://localhost:11434/api/generate")
GENERAL_CHAT_MODEL = os.environ.get("GENERAL_CHAT_MODEL", "smollm2:360m")
SLEEP_COURSE_MODEL = os.environ.get("SLEEP_COURSE_MODEL") or os.environ.get(
    "MISTRAL_MODEL", "mistral:7b-instruct"
)
LLM_TIMEOUT = int(os.environ.get("LLM_TIMEOUT", "90"))

# Upload configuration
WANO_UPLOAD_DIR = os.environ.get("WANO_UPLOAD_DIR", "/home/wano/cenniki")
WANO_PDF_OUTPUT_DIR = os.environ.get("WANO_PDF_OUTPUT_DIR", "/home/wano/cennikiPDF")
WANO_PDFY_DIR = os.environ.get("WANO_PDFY_DIR", "/home/wano/pdfy")
WANO_EX_DIR = os.environ.get("WANO_EX_DIR", "/home/wano/ex")


def _find_latest_file(directory: str, exts: set[str]) -> Optional[str]:
    if not os.path.exists(directory):
        return None
    latest_file = None
    latest_mtime = -1
    for name in os.listdir(directory):
        path = os.path.join(directory, name)
        if not os.path.isfile(path):
            continue
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if ext not in exts:
            continue
        mtime = os.path.getmtime(path)
        if mtime > latest_mtime:
            latest_mtime = mtime
            latest_file = path
    return latest_file


class Message(BaseModel):
    text: str


class SleepLessonRequest(BaseModel):
    day: str
    day_id: Optional[str] = None
    title: str
    questions: List[str]
    answers: List[str] = Field(default_factory=list)
    language: str = "en"


def call_llm(prompt: str, model: str, temperature: float = 0.5) -> str:
    """Shared helper for calling the local LLM endpoint."""
    try:
        payload = {
            "model": model,
            "prompt": prompt,
            "temperature": temperature,
        }

        if LLM_BASE_URL.rstrip("/").endswith("api/generate"):
            payload["stream"] = False

        response = requests.post(
            LLM_BASE_URL,
            headers={"Content-Type": "application/json"},
            json=payload,
            timeout=LLM_TIMEOUT,
        )

        logging.info("LLM status: %s", response.status_code)

        if response.status_code != 200:
            logging.error("LLM error: %s", response.text)
            raise HTTPException(status_code=response.status_code, detail="Model response error")

        model_response = response.json()
        # Support both OpenAI-style responses (choices) and Ollama's /api/generate payloads.
        choices = model_response.get("choices", [])
        if choices:
            choice = choices[0]
            text = choice.get("text")
            if not text:
                # Some providers send chat choices instead of plain text completions.
                text = choice.get("message", {}).get("content")
            if text:
                return text.strip()

        if "response" in model_response:
            return model_response["response"].strip()

        logging.error("Invalid LLM payload: %s", model_response)
        raise HTTPException(status_code=500, detail="Invalid response format")

    except HTTPException:
        raise
    except Exception as exc:
        logging.error("Unexpected LLM error: %s", exc)
        raise HTTPException(status_code=500, detail="Internal Server Error")


def build_sleep_prompt(payload: SleepLessonRequest) -> str:
    """Format participant answers for the AI Sleep Consultant prompt."""
    qna_lines = []
    answers = payload.answers + [""] * (len(payload.questions) - len(payload.answers))

    for idx, question in enumerate(payload.questions):
        answer = answers[idx].strip() if idx < len(answers) else ""
        if not answer:
            answer = "No answer provided."
        qna_lines.append(f"{idx + 1}. Q: {question}\n   A: {answer}")

    qna_block = "\n".join(qna_lines)

    return (
        "You are an empathetic AI Sleep Consultant guiding a participant through a structured 7-day course. "
        "Always reply in English, stay under 200 words, and avoid medical claims. "
        "Reference their answers, keep tone encouraging, and end with motivation.\n\n"
        f"Day context: {payload.day} — {payload.title}\n"
        f"Participant responses:\n{qna_block}\n\n"
        "Deliver your output using the exact structure:\n"
        "Key insight: <2-3 sentences reflecting on their current situation>\n"
        "Actions:\n"
        "- Action 1 tailored to their inputs\n"
        "- Action 2 tailored to their inputs\n"
        "Encouragement: <one uplifting sentence that mentions their effort>\n"
    )


@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("tools.html", {"request": request})


@app.get("/articles", response_class=HTMLResponse)
async def read_articles(request: Request):
    return templates.TemplateResponse("articles.html", {"request": request})


@app.get("/author", response_class=HTMLResponse)
async def read_author(request: Request):
    return templates.TemplateResponse("author.html", {"request": request})


@app.get("/werka", response_class=HTMLResponse)
async def read_werka(request: Request):
    return templates.TemplateResponse("werka.html", {"request": request})


@app.get("/wano", response_class=HTMLResponse)
async def read_wano(request: Request):
    return templates.TemplateResponse("wano.html", {"request": request})


@app.get("/test")
def test_endpoint():
    return {"message": "Test works!"}


@app.post("/chat")
async def chat_with_model(message: Message):
    response_text = call_llm(message.text, GENERAL_CHAT_MODEL, temperature=0.5)
    return {"response": response_text}


@app.post("/sleep/lesson")
async def generate_sleep_lesson(payload: SleepLessonRequest):
    prompt = build_sleep_prompt(payload)
    model_name = SLEEP_COURSE_MODEL or GENERAL_CHAT_MODEL
    try:
        lesson = call_llm(prompt, model_name, temperature=0.3)
    except HTTPException as exc:
        if exc.status_code == 404 and model_name != GENERAL_CHAT_MODEL:
            lesson = call_llm(prompt, GENERAL_CHAT_MODEL, temperature=0.3)
        else:
            raise
    return {"lesson": lesson}


@app.post("/api/wano/generate/{language}")
async def generate_wano_pdf(language: str):
    latest_excel = _find_latest_file(WANO_UPLOAD_DIR, {"xlsm", "xlsx"})
    if not latest_excel:
        raise HTTPException(status_code=400, detail="Brak źródłowego pliku cennika w /home/wano/cenniki.")

    try:
        output = await asyncio.to_thread(generate_price_list, language, latest_excel)
        download_href = f"/api/wano/download/pdf/{os.path.basename(output)}"
        return {"message": "PDF wygenerowany", "output": output, "language": language, "download": download_href}
    except GenerationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # pragma: no cover - defensive
        logging.error("WANO generation error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Błąd generowania cennika.")


@app.post("/api/wano/upload")
async def upload_wano_file(file: UploadFile = File(...)):
    allowed_ext = {"xlsm", "xlsx"}
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext not in allowed_ext:
        raise HTTPException(status_code=400, detail="Dozwolone są jedynie pliki .xlsm lub .xlsx.")

    os.makedirs(WANO_UPLOAD_DIR, exist_ok=True)
    safe_name = os.path.basename(filename)
    base, original_ext = os.path.splitext(safe_name)

    # Znajdź najwyższy sufiks numeryczny dla danego prefixu i przedłuż.
    try:
        existing = os.listdir(WANO_UPLOAD_DIR)
    except FileNotFoundError:
        existing = []

    pattern = re.compile(rf"^{re.escape(base)}(\d+)?{re.escape(original_ext)}$", re.IGNORECASE)
    max_suffix = 0
    for name in existing:
        match = pattern.match(name)
        if match:
            suffix = match.group(1)
            if suffix and suffix.isdigit():
                max_suffix = max(max_suffix, int(suffix))
            else:
                max_suffix = max(max_suffix, 0)

    next_suffix = max_suffix + 1
    numbered_name = f"{base}{next_suffix}{original_ext}"
    dest_path = os.path.abspath(os.path.join(WANO_UPLOAD_DIR, numbered_name))

    try:
        contents = await file.read()
        with open(dest_path, "wb") as out_file:
            out_file.write(contents)
    except Exception as exc:
        logging.error("WANO upload error (write): %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Nie udało się zapisać pliku ({exc}). Ścieżka: {dest_path}",
        )

    return {
        "message": "Plik zapisany",
        "filename": numbered_name,
        "path": f"/api/wano/download/{numbered_name}",
        "info": "Wgrany przez UI",
    }


@app.get("/api/wano/download/{filename}")
async def download_wano_file(filename: str):
    safe_name = os.path.basename(filename)
    file_path = os.path.abspath(os.path.join(WANO_UPLOAD_DIR, safe_name))

    # zabezpieczenie przed wyjściem poza katalog
    if not file_path.startswith(os.path.abspath(WANO_UPLOAD_DIR) + os.sep):
        raise HTTPException(status_code=400, detail="Nieprawidłowa nazwa pliku.")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Plik nie istnieje.")

    return FileResponse(file_path, filename=safe_name)


@app.get("/api/wano/files")
async def list_wano_files():
    if not os.path.exists(WANO_UPLOAD_DIR):
        return {"files": []}

    files = []
    for name in os.listdir(WANO_UPLOAD_DIR):
        safe_name = os.path.basename(name)
        ext = safe_name.rsplit(".", 1)[-1].lower() if "." in safe_name else ""
        if ext not in {"xlsm", "xlsx"}:
            continue
        path = os.path.abspath(os.path.join(WANO_UPLOAD_DIR, safe_name))
        if not os.path.isfile(path):
            continue
        mtime = datetime.fromtimestamp(os.path.getmtime(path))
        files.append(
            {
                "file": safe_name,
                "info": "Wersja z dysku",
                "date": mtime.strftime("%Y-%m-%d %H:%M"),
                "href": f"/api/wano/download/{safe_name}",
            }
        )

    files.sort(key=lambda x: x["date"], reverse=True)
    return {"files": files}


def _is_lang_pdf(name: str, lang: str) -> bool:
    lower = name.lower()
    if not lower.endswith(".pdf"):
        return False
    if lang == "pl":
        if "en" in lower or "price" in lower:
            return False
        return ("pl" in lower) or ("cennik" in lower)
    if lang == "en":
        return ("en" in lower) or ("price" in lower)
    return False


def _latest_pdf(lang: str) -> Optional[dict]:
    if not os.path.exists(WANO_PDF_OUTPUT_DIR):
        return None
    latest = None
    latest_mtime = -1

    for name in os.listdir(WANO_PDF_OUTPUT_DIR):
        if not _is_lang_pdf(name, lang):
            continue
        path = os.path.abspath(os.path.join(WANO_PDF_OUTPUT_DIR, name))
        if not os.path.isfile(path):
            continue
        mtime = os.path.getmtime(path)
        if mtime > latest_mtime:
            latest_mtime = mtime
            latest = {
                "file": name,
                "href": f"/api/wano/download/pdf/{name}",
                "date": datetime.fromtimestamp(mtime).strftime("%d.%m.%Y"),
            }
    return latest


@app.get("/api/wano/latest-pdfs")
async def get_latest_pdfs():
    return {"pl": _latest_pdf("pl"), "en": _latest_pdf("en")}


@app.get("/api/wano/download/pdf/{filename}")
async def download_pdf(filename: str):
    safe_name = os.path.basename(filename)
    file_path = os.path.abspath(os.path.join(WANO_PDF_OUTPUT_DIR, safe_name))

    if not file_path.startswith(os.path.abspath(WANO_PDF_OUTPUT_DIR) + os.sep):
        raise HTTPException(status_code=400, detail="Nieprawidłowa nazwa pliku.")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Plik nie istnieje.")

    return FileResponse(file_path, filename=safe_name)


@app.get("/api/wano/download-latest/{language}")
async def download_latest_pdf(language: str):
    language = language.lower()
    if language not in {"pl", "en"}:
        raise HTTPException(status_code=400, detail="Język musi być pl albo en.")
    latest = _latest_pdf(language)
    if not latest:
        raise HTTPException(status_code=404, detail="Brak wygenerowanego pliku.")
    safe_name = os.path.basename(latest["file"])
    file_path = os.path.abspath(os.path.join(WANO_PDF_OUTPUT_DIR, safe_name))
    return FileResponse(file_path, filename=safe_name)
