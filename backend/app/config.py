"""Settings from environment variables (and a local .env file)."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "")
LLM_API_KEY = os.getenv("LLM_API_KEY", "") or os.getenv("GROQ_API_KEY", "")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")
LLM_MODEL = os.getenv("LLM_MODEL", "openai/gpt-oss-120b")
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]

EMBED_MODEL = "BAAI/bge-small-en-v1.5"  # 384 numbers per text, same as the course model's size
RERANK_MODEL = "Xenova/ms-marco-MiniLM-L-6-v2"
EMBED_DIM = 384
