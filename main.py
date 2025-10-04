from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import subprocess
import requests
import logging

# Ustawienie logowania błędów
logging.basicConfig(level=logging.ERROR)

app = FastAPI()

# Mount the static files directory
app.mount("/static", StaticFiles(directory="static"), name="static")

# Set up the templates directory
templates = Jinja2Templates(directory="templates")

# Model dla POST /chat
class Message(BaseModel):
    text: str

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

@app.get("/test")
def test_endpoint():
    return {"message": "Test works!"}

@app.post("/chat")
async def chat_with_model(message: Message):
    try:
        response = requests.post(
            "http://localhost:11434/v1/completions",
            headers={"Content-Type": "application/json"},
            json={
                "model": "smollm2:360m",
                "prompt": message.text
            },
            timeout=90
        )

        logging.info(f"Status code: {response.status_code}")
        logging.info(f"Model response: {response.text}")

        if response.status_code != 200:
            logging.error(f"Error from /v1/completions: {response.text}")
            raise HTTPException(status_code=response.status_code, detail="Model response error")

        model_response = response.json()

        if "choices" not in model_response or not model_response["choices"]:
            logging.error("Missing 'choices' key in model response.")
            raise HTTPException(status_code=500, detail="Invalid response format")

        if "text" not in model_response["choices"][0]:
            logging.error("Missing 'text' key in choices[0].")
            raise HTTPException(status_code=500, detail="Invalid response format")

        return {"response": model_response["choices"][0]["text"]}

    except Exception as e:
        logging.error(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


