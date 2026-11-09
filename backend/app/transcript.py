"""Parse an Apollo mission transcript (Spacelog format) into utterances and RAG chunks.

Spacelog format, one block per utterance:

    [02:07:55:35]                      <- mission elapsed time, DD:HH:MM:SS
    _page : 12                         <- optional metadata lines starting with "_"
    CDR: Houston, we've had a problem. <- SPEAKER: text
         continued text is indented

Inline markup: [glossary:LM] -> LM, [glossary:LM|lunar module] -> lunar module,
[time:00:00:08:38|8 plus 38] -> 8 plus 38.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

STAMP = re.compile(r"^\[(-?)(\d\d):(\d\d):(\d\d):(\d\d)\]\s*$")
SPEAKER = re.compile(r"^([A-Z][A-Z0-9_\-]*)\s*:\s?(.*)$")
META = re.compile(r"^_(\w+)\s*:\s*(.*)$")
MARKUP = re.compile(r"\[(?:glossary|time):([^\]|]+)(?:\|([^\]]+))?\]")


def met_to_seconds(sign: str, d: str, h: str, m: str, s: str) -> int:
    total = int(d) * 86400 + int(h) * 3600 + int(m) * 60 + int(s)
    return -total if sign == "-" else total


def parse_met(label: str) -> int:
    """'02:07:55:35' -> seconds. Accepts a leading '-'."""
    sign = "-" if label.startswith("-") else ""
    d, h, m, s = label.lstrip("-").split(":")
    return met_to_seconds(sign, d, h, m, s)


def format_met(seconds: int) -> str:
    sign = "-" if seconds < 0 else ""
    s = abs(seconds)
    return f"{sign}{s // 86400:02d}:{s % 86400 // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}"


def clean_markup(text: str) -> str:
    text = MARKUP.sub(lambda m: (m.group(2) or m.group(1)).strip(), text)
    return re.sub(r"\s+", " ", text).strip()


@dataclass
class Utterance:
    met: int
    speaker: str
    text: str
    page: int | None = None
    tape: str | None = None
    labels: list[str] = field(default_factory=list)

    @property
    def label(self) -> str:
        return format_met(self.met)


def parse_transcript(raw: str) -> list[Utterance]:
    out: list[Utterance] = []
    met: int | None = None
    page: int | None = None
    tape: str | None = None
    labels: list[str] = []
    current: Utterance | None = None

    def flush():
        nonlocal current
        if current and current.text:
            current.text = clean_markup(current.text)
            if current.text:
                out.append(current)
        current = None

    for line in raw.splitlines():
        m = STAMP.match(line.strip())
        if m:
            flush()
            met = met_to_seconds(*m.groups())
            labels = []
            continue
        if met is None or not line.strip():
            continue
        meta = META.match(line)
        if meta:
            key, value = meta.groups()
            if key == "page" and value.strip().isdigit():
                page = int(value.strip())
            elif key == "tape":
                tape = value.strip()
            elif key == "labels":
                labels = re.findall(r'"([^"]+)"', value)
            continue
        sp = SPEAKER.match(line)
        if sp and not line.startswith((" ", "\t")):
            flush()
            current = Utterance(met=met, speaker=sp.group(1), text=sp.group(2), page=page, tape=tape, labels=list(labels))
        elif current is not None:
            current.text += " " + line.strip()  # continuation line
    flush()
    return out


@dataclass
class Chunk:
    start_met: int
    end_met: int
    speakers: list[str]
    act: str | None
    content: str  # what the model and the reader see, with times and names
    embed_text: str  # what gets embedded: names and words, no timestamps


def act_for(met: int, acts: list[dict]) -> str | None:
    for a in acts:
        if a["start_met"] <= met < a["end_met"]:
            return a["title"]
    return acts[-1]["title"] if acts and met >= acts[-1]["start_met"] else None


def split_long(u: Utterance, limit: int) -> list[Utterance]:
    """Split one very long utterance (a long procedure read-up) at sentence ends."""
    if len(u.text) <= limit:
        return [u]
    parts, cur = [], ""
    for sentence in re.split(r"(?<=[.?!])\s+", u.text):
        if cur and len(cur) + len(sentence) > limit:
            parts.append(cur)
            cur = sentence
        else:
            cur = f"{cur} {sentence}".strip()
    if cur:
        parts.append(cur)
    return [Utterance(u.met, u.speaker, p, u.page, u.tape, u.labels) for p in parts]


def chunk_utterances(
    utts: list[Utterance],
    names: dict[str, str],
    acts: list[dict],
    max_chars: int = 600,
    max_gap: int = 300,
    overlap: int = 1,
) -> list[Chunk]:
    """Group consecutive utterances into chunks of a short conversation.

    A chunk ends when it would pass max_chars, when there is a silence longer than
    max_gap seconds, or when the mission moves into a new act. The last `overlap`
    utterances are repeated at the start of the next chunk, so an exchange cut at a
    boundary still appears whole in one of the two chunks (the overlap idea from the
    Day 2 notebook, applied to dialogue instead of characters).
    """

    def line(u: Utterance, with_time: bool) -> str:
        who = names.get(u.speaker, u.speaker)
        return f"[{u.label}] {who}: {u.text}" if with_time else f"{who}: {u.text}"

    utts = [piece for u in utts for piece in split_long(u, max_chars)]
    chunks: list[Chunk] = []
    group: list[Utterance] = []

    def emit():
        if not group:
            return
        chunks.append(
            Chunk(
                start_met=group[0].met,
                end_met=group[-1].met,
                speakers=sorted({u.speaker for u in group}),
                act=act_for(group[0].met, acts),
                content="\n".join(line(u, True) for u in group),
                embed_text=" ".join(line(u, False) for u in group),
            )
        )

    for u in utts:
        if group:
            size = sum(len(x.text) for x in group) + len(u.text)
            gap = u.met - group[-1].met
            new_act = act_for(u.met, acts) != act_for(group[0].met, acts)
            if size > max_chars or gap > max_gap or new_act:
                emit()
                keep = group[-overlap:] if overlap and gap <= max_gap and not new_act else []
                group = list(keep)
        group.append(u)
    emit()
    return chunks
