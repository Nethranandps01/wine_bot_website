# WillsBot Website

A premium AI-powered Wine Specialist bot with a voice-first experience.

## Features
- **Voice Interruption**: Stop the bot anytime by clicking the mic.
- **Premium Aesthetics**: High-end "Wine & Gold" design with glassmorphism.
- **Conditional Greeting**: The bot only greets you when the widget is opened.
- **Render Ready**: Fully configured for hosting on Render with environment variables.

## Local Setup
1. Install dependencies: `pip install fastapi uvicorn google-generativeai python-dotenv`
2. Create a `.env` file with your `GEMINI_API_KEY`.
3. Run the server: `python3 main.py`
4. Access at `http://localhost:8000`
