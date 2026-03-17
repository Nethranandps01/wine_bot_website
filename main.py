from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

app = FastAPI()

# Enable CORS for frontend interaction
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Gemini
API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise ValueError("GEMINI_API_KEY is not set in environmental variables or .env file")
genai.configure(api_key=API_KEY)

model = genai.GenerativeModel('models/gemini-flash-latest')

SYSTEM_PROMPT = """
You are a world-class wine expert bot. Your only purpose is to provide expert advice and recommendations about wine.
- You MUST only respond to wine-related queries.
- If a user asks about anything else, politely decline and suggest a wine topic instead.
- **CRITICAL**: Your responses MUST be concise (under 2 sentences).
- **CRITICAL**: DO NOT use any markdown formatting (no bolding **, no bullet points - or *, no headers #). 
- Use plain text only. Avoid special characters. Your output will be read aloud by a computer voice, so make it read naturally.
- Be professional and elegant.
"""

class ChatRequest(BaseModel):
    message: str
    history: list = []

@app.post("/chat")
async def chat(request: ChatRequest):
    try:
        # Construct chat context
        chat_session = model.start_chat(history=[])
        
        full_prompt = f"{SYSTEM_PROMPT}\n\nUser: {request.message}"
        response = chat_session.send_message(full_prompt)
        
        return {"response": response.text}
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "ok"}

# Serve static files (the website)
# This allows the site to be accessed via http://localhost:8000 which is necessary for Web Speech API
static_dir = os.path.dirname(os.path.abspath(__file__))
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    # Use PORT environment variable for Render deployment
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
