"""Unit tests for the station logic that needs no database. Run:  pytest -q"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.planets import describe, esi, feature_vector, in_hz, size_class  # noqa: E402
from app.starship import build_sql  # noqa: E402
from app.util import first_json  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def test_plan_whitelist_blocks_injection():
    sql, params, clean = build_sql(
        {
            "filters": [
                {"column": "radius", "op": "<=", "value": "1.6"},
                {"column": "name; drop table planets", "op": "=", "value": 1},
                {"column": "host", "op": "contains", "value": "x' or 1=1 --"},
                {"column": "radius", "op": "or 1=1", "value": 1},
            ],
            "sort": {"column": "dist_pc; delete", "dir": "asc"},
            "limit": 999,
        }
    )
    assert "drop" not in sql and "delete" not in sql and "1=1" not in sql
    assert params == [1.6, "%x' or 1=1 --%"]  # values only ever travel as parameters
    assert sql.endswith("limit 25") and len(clean["filters"]) == 2


def test_plan_aggregate():
    sql, params, clean = build_sql({"filters": [{"column": "in_hz", "op": "=", "value": "true"}], "aggregate": {"fn": "count", "group_by": "disc_method"}})
    assert sql.startswith("select disc_method, count(*)") and params == [True]


def test_planet_facts():
    assert size_class(1.0) == "Earth-size" and size_class(1.7) == "Super-Earth" and size_class(11) == "Gas giant"
    assert size_class(None, 300) == "Gas giant"
    assert in_hz(1.0) and not in_hz(10) and in_hz(None) is None
    assert esi(1, 1) == 1.0 and esi(11, 400) < 0.3
    assert feature_vector({"radius": 1, "mass": 1, "period": 365, "insolation": 1, "star_teff": 5772}) is not None
    assert feature_vector({"radius": None}) is None
    card = describe({"name": "X b", "host": "X", "radius": 1.0, "size_class": "Earth-size", "insolation": 1.0, "in_hz": True, "star_teff": 3300})
    assert "red dwarf" in card and "habitable zone" in card


def test_first_json():
    assert first_json('Sure! ```json\n{"a": 1}\n```') == {"a": 1}
    assert first_json("no json here") is None


def test_data_files_are_valid():
    decisions = json.loads((ROOT / "data" / "decisions.json").read_text(encoding="utf-8"))
    assert len(decisions) == 7
    for d in decisions:
        assert d["nasa"] in {o["id"] for o in d["options"]}
    evalset = json.loads((ROOT / "data" / "eval_set.json").read_text(encoding="utf-8"))
    assert len(evalset) >= 25 and any(not q["expect"] for q in evalset)
