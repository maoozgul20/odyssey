"""Streams a chat answer from any OpenAI-compatible API (Groq by default)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from .config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL


class LLMError(Exception):
    pass


def configured() -> bool:
    return bool(LLM_API_KEY) or "localhost" in LLM_BASE_URL or "127.0.0.1" in LLM_BASE_URL


async def stream_chat(system: str, user: str, temperature: float = 0.2, max_tokens: int = 900) -> AsyncIterator[str]:
    payload: dict = {
        "model": LLM_MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
    }
    if LLM_MODEL.startswith("openai/gpt-oss"):
        payload["reasoning_effort"] = "low"
    headers = {"Content-Type": "application/json"}
    if LLM_API_KEY:
        headers["Authorization"] = f"Bearer {LLM_API_KEY}"

    async with httpx.AsyncClient(timeout=httpx.Timeout(60, connect=15)) as client:
        try:
            async with client.stream("POST", f"{LLM_BASE_URL}/chat/completions", json=payload, headers=headers) as r:
                if r.status_code != 200:
                    detail = (await r.aread()).decode(errors="ignore")[:300]
                    if r.status_code in (401, 403):
                        raise LLMError("The AI provider rejected the API key. Check LLM_API_KEY.")
                    if r.status_code == 429:
                        raise LLMError("The AI provider's free limit was reached. Wait a minute and try again.")
                    if r.status_code == 404 or (r.status_code == 400 and "model" in detail.lower()):
                        raise LLMError(f'The model "{LLM_MODEL}" is not available. Set LLM_MODEL.')
                    raise LLMError(f"The AI provider returned HTTP {r.status_code}.")
                async for line in r.aiter_lines():
                    line = line.strip()
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        piece = json.loads(data)["choices"][0]["delta"].get("content")
                    except (KeyError, IndexError, json.JSONDecodeError):
                        continue
                    if piece:
                        yield piece
        except httpx.HTTPError as e:
            raise LLMError("Could not reach the AI provider. Check the internet connection.") from e


async def complete(system: str, user: str, max_tokens: int = 300) -> str:
    """A short, non-streamed answer (used to rewrite search queries)."""
    out = []
    async for piece in stream_chat(system, user, temperature=0.0, max_tokens=max_tokens):
        out.append(piece)
    return "".join(out).strip()
