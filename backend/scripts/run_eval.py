"""Evaluate retrieval (and optionally answers). Run from the backend folder:

    python scripts/run_eval.py             retrieval metrics only (about 1 minute)
    python scripts/run_eval.py --answers   also generate and judge 25 answers (uses Groq, about 3 minutes)

Results are saved to data/eval_results.json and shown on the website's Evaluation page.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.evaluate import run  # noqa: E402

if __name__ == "__main__":
    res = run(with_answers="--answers" in sys.argv)
    print(f"\n{res['questions']} answerable questions, {res['unanswerable']} unanswerable\n")
    print(f"{'method':16}{'hit@1':>8}{'hit@3':>8}{'hit@5':>8}{'mrr@10':>9}")
    for m, s in res["summary"].items():
        print(f"{m:16}{s['hit@1']:>8.2f}{s['hit@3']:>8.2f}{s['hit@5']:>8.2f}{s['mrr@10']:>9.3f}")
    print(f"\nCoverage accuracy (knows when it doesn't know): {res['coverage_accuracy']:.0%}")
    if "answers" in res:
        a = res["answers"]
        print(f"Answer faithfulness: {a['faithfulness']}  keyword accuracy: {a['keyword_accuracy']}")
    print("\nSaved data/eval_results.json")
