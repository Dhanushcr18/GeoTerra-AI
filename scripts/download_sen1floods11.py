"""Download the Sen1Floods11 hand-labeled subset (446 S1Hand + LabelHand chips) via public HTTPS GCS."""

from __future__ import annotations

import concurrent.futures
import sys
import urllib.request
from pathlib import Path
from typing import List, Tuple

from tqdm import tqdm

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ml import config
from ml.src.dataset import read_split_csv

BASE_HTTPS = "https://storage.googleapis.com/sen1floods11/v1.1"
SPLIT_NAMES = (
    "flood_train_data.csv",
    "flood_valid_data.csv",
    "flood_test_data.csv",
    "flood_bolivia_data.csv",
)


def _download_file(task: Tuple[str, Path]) -> str:
    url, dst = task
    if dst.exists() and dst.stat().st_size > 0:
        return "skipped"
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(dst.suffix + ".tmp")
    urllib.request.urlretrieve(url, tmp)
    tmp.replace(dst)
    return "downloaded"


def main() -> None:
    config.SPLITS_DIR.mkdir(parents=True, exist_ok=True)
    config.S1_HAND_DIR.mkdir(parents=True, exist_ok=True)
    config.LABEL_HAND_DIR.mkdir(parents=True, exist_ok=True)

    all_pairs: List[Tuple[str, str]] = []
    for fname in SPLIT_NAMES:
        url = f"{BASE_HTTPS}/splits/flood_handlabeled/{fname}"
        dst = config.SPLITS_DIR / fname
        _download_file((url, dst))
        pairs = read_split_csv(dst)
        print(f"Split {fname}: {len(pairs)} chips")
        all_pairs.extend(pairs)

    tasks: List[Tuple[str, Path]] = []
    for s1_name, lbl_name in all_pairs:
        tasks.append((f"{BASE_HTTPS}/data/flood_events/HandLabeled/S1Hand/{s1_name}", config.S1_HAND_DIR / s1_name))
        tasks.append((f"{BASE_HTTPS}/data/flood_events/HandLabeled/LabelHand/{lbl_name}", config.LABEL_HAND_DIR / lbl_name))

    downloaded = 0
    skipped = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        for status in tqdm(pool.map(_download_file, tasks), total=len(tasks), desc="Sen1Floods11 HandLabeled"):
            if status == "downloaded":
                downloaded += 1
            else:
                skipped += 1

    print(f"Done. Downloaded={downloaded}, Already cached={skipped}, Total files={len(tasks)}")


if __name__ == "__main__":
    main()
