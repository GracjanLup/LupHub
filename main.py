import asyncio
import logging
import os
from typing import List, Optional

import requests
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from static.CreatorAPI import GenerationError, generate_price_list

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
    try:
        output = await asyncio.to_thread(generate_price_list, language)
        return {"message": "PDF wygenerowany", "output": output, "language": language}
    except GenerationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # pragma: no cover - defensive
        logging.error("WANO generation error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Błąd generowania cennika.")
