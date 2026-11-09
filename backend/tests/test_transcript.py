"""Unit tests for the parser, chunker and keyword query. Run:  pytest -q"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.rag import keyword_query  # noqa: E402
from app.transcript import chunk_utterances, clean_markup, format_met, parse_met, parse_transcript  # noqa: E402

SAMPLE = """[-00:00:00:05]
LCC: IGNITION --

[00:00:00:02]
_page : 8
_tape : Tape 1/1
CDR: The clock is running.

[00:00:00:03]
CMP: Okay. [glossary:P11], Jim.

[02:07:55:35]
_labels : {"Key line": null}
CDR: Houston, we've had a problem. We've had a
     MAIN B BUS UNDERVOLT.

[02:07:55:42]
CC:  Roger. MAIN B UNDERVOLT at [time:02:07:55:35|55 minutes].
"""

ACTS = [
    {"title": "Launch", "start_met": -20, "end_met": 720},
    {"title": "To the Moon", "start_met": 720, "end_met": 300000},
]
NAMES = {"CDR": "Jim Lovell (CDR)", "CMP": "Jack Swigert (CMP)", "CC": "CapCom", "LCC": "Launch Control"}


def test_met_round_trip():
    assert parse_met("02:07:55:35") == 2 * 86400 + 7 * 3600 + 55 * 60 + 35
    assert parse_met("-00:00:00:05") == -5
    assert format_met(parse_met("05:22:55:12")) == "05:22:55:12"
    assert format_met(-5) == "-00:00:00:05"


def test_markup_is_cleaned():
    assert clean_markup("Okay. [glossary:P11], Jim.") == "Okay. P11, Jim."
    assert clean_markup("at [time:02:07:55:35|55 minutes].") == "at 55 minutes."
    assert clean_markup("the [glossary:LM|lunar module]") == "the lunar module"


def test_parse_sample():
    u = parse_transcript(SAMPLE)
    assert [x.speaker for x in u] == ["LCC", "CDR", "CMP", "CDR", "CC"]
    assert u[0].met == -5
    assert u[1].page == 8 and u[1].tape == "Tape 1/1"
    assert u[3].text == "Houston, we've had a problem. We've had a MAIN B BUS UNDERVOLT."  # continuation joined
    assert u[3].labels == ["Key line"]
    assert "[" not in u[4].text


def test_chunks_respect_acts_and_order():
    u = parse_transcript(SAMPLE)
    chunks = chunk_utterances(u, NAMES, ACTS, max_chars=600)
    assert all(c.start_met <= c.end_met for c in chunks)
    # the launch lines and the problem lines are in different acts, so different chunks
    assert {c.act for c in chunks} == {"Launch", "To the Moon"}
    problem = [c for c in chunks if "we've had a problem" in c.content][0]
    assert "[02:07:55:35] Jim Lovell (CDR):" in problem.content
    assert "02:07" not in problem.embed_text  # timestamps are not embedded


def test_overlap_repeats_last_line():
    lines = "\n\n".join(f"[00:01:00:{i:02d}]\nCDR: " + "word " * 40 for i in range(10))
    chunks = chunk_utterances(parse_transcript(lines), NAMES, ACTS, max_chars=400)
    assert len(chunks) > 1
    for a, b in zip(chunks, chunks[1:]):
        assert a.content.splitlines()[-1] == b.content.splitlines()[0]


def test_keyword_query_is_safe():
    assert keyword_query("What happened to the O2 tank?") == "happened | o2 | tank"
    assert keyword_query("'; drop table chunks; --") == "drop | table | chunks"
    assert keyword_query("the of and") == ""
