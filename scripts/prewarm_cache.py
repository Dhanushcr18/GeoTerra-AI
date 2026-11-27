"""Prewarm NVIDIA NIM disk cache in backend/cache/ for offline-safe hackathon demos."""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.app import config, nim_client
from backend.app.main import compute_derived_metrics
from backend.app.schemas import ResultsPayload

EXAMPLE_QUESTIONS = [
    "What is the predicted flooded area and cropland loss in INR?",
    "What are the Sen1Floods11 test and Bolivia IoU/F1 metrics?",
    "How many land-change polygons are near rivers and what is their verification status?",
]


def main() -> None:
    results_path = config.DATA_DIR / "results.json"
    if not results_path.exists():
        print("Error: backend/data/results.json missing. Run scripts/generate_sample_data.py first.")
        sys.exit(1)

    results = ResultsPayload.model_validate(json.loads(results_path.read_text(encoding="utf-8")))
    derived = compute_derived_metrics(results)

    if not config.get_nvidia_api_key():
        print("Notice: NVIDIA_API_KEY is not set in backend/.env. Skipping live NIM calls; deterministic template fallbacks are active.")
    else:
        print(f"Prewarming NIM cache using LLM={config.LLM_MODEL}, VLM={config.VLM_MODEL}...")

    tasks = [
        ("alert_ksdma", nim_client.generate_authority_alert(results, derived, "Karnataka State Disaster Management Authority (KSDMA)")),
        ("alert_agri", nim_client.generate_authority_alert(results, derived, "Karnataka State Department of Agriculture")),
        ("describe_site", nim_client.describe_site_tiles(results, "s2_before.png", "s2_after.png")),
        ("triage", nim_client.triage_flagged_sites(results)),
    ]
    for idx, q in enumerate(EXAMPLE_QUESTIONS, start=1):
        tasks.append((f"ask_{idx}", nim_client.answer_grounded_question(q, results, derived)))

    for name, res in tasks:
        print(f"  - {name:14s}: ai_mode={res['ai_mode']}, source={res['detail_source']}")

    cache_files = list(config.CACHE_DIR.glob("*.json"))
    print(f"Done. Cached JSON entries in backend/cache/: {len(cache_files)}")


if __name__ == "__main__":
    main()
