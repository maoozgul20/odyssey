"""Small helpers shared by the station APIs."""

from __future__ import annotations

import json
import re

from fastapi.responses import StreamingResponse


def sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


def stream(gen) -> StreamingResponse:
    return StreamingResponse(gen, media_type="text/event-stream", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


def numbered(blocks: list[str]) -> str:
    return "\n\n".join(f"[{i}] {b}" for i, b in enumerate(blocks, 1))


def first_json(text: str):
    """The first {...} object in a model reply (models sometimes wrap JSON in prose or ```)."""
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
