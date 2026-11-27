"""Evaluation metrics for flood segmentation (water class) and VH threshold baseline."""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
import torch
from torch.utils.data import DataLoader

from ml import config
from ml.src.dataset import load_label_chip, load_s1_chip


def compute_binary_metrics(
    preds: np.ndarray,
    targets: np.ndarray,
    ignore_index: int = config.IGNORE_INDEX,
) -> Dict[str, object]:
    """Compute water-class IoU, F1, precision, recall, and 2x2 confusion matrix on valid pixels."""
    valid = targets != ignore_index
    if not valid.any():
        return {
            "iou": 0.0,
            "f1": 0.0,
            "precision": 0.0,
            "recall": 0.0,
            "confusion_matrix": [[0, 0], [0, 0]],
            "valid_pixels": 0,
        }

    p = preds[valid].astype(bool)
    t = targets[valid] == 1

    tp = int(np.logical_and(p, t).sum())
    fp = int(np.logical_and(p, ~t).sum())
    fn = int(np.logical_and(~p, t).sum())
    tn = int(np.logical_and(~p, ~t).sum())

    iou = tp / (tp + fp + fn) if (tp + fp + fn) > 0 else 0.0
    f1 = (2 * tp) / (2 * tp + fp + fn) if (2 * tp + fp + fn) > 0 else 0.0
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0

    return {
        "iou": round(float(iou), 4),
        "f1": round(float(f1), 4),
        "precision": round(float(precision), 4),
        "recall": round(float(recall), 4),
        "confusion_matrix": [[tn, fp], [fn, tp]],
        "valid_pixels": int(valid.sum()),
    }


@torch.no_grad()
def evaluate_model(
    model: torch.nn.Module,
    loader: DataLoader,
    device: torch.device,
    criterion: Optional[torch.nn.Module] = None,
    prob_threshold: float = config.PROB_THRESHOLD,
) -> Dict[str, object]:
    """Evaluate a PyTorch segmentation model over a labeled split DataLoader."""
    model.eval()
    total_loss = 0.0
    batches = 0
    tp = fp = fn = tn = 0

    for x, y in loader:
        x = x.to(device, non_blocking=True)
        y = y.to(device, non_blocking=True)
        logits = model(x)
        if criterion is not None:
            total_loss += float(criterion(logits, y).item())
            batches += 1

        probs = torch.sigmoid(logits.squeeze(1))
        preds = (probs >= prob_threshold)
        valid = y != config.IGNORE_INDEX
        if not valid.any():
            continue

        p = preds[valid]
        t = y[valid] == 1
        tp += int((p & t).sum().item())
        fp += int((p & ~t).sum().item())
        fn += int((~p & t).sum().item())
        tn += int((~p & ~t).sum().item())

    iou = tp / (tp + fp + fn) if (tp + fp + fn) > 0 else 0.0
    f1 = (2 * tp) / (2 * tp + fp + fn) if (2 * tp + fp + fn) > 0 else 0.0
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0

    return {
        "loss": round(total_loss / max(batches, 1), 5),
        "iou": round(float(iou), 4),
        "f1": round(float(f1), 4),
        "precision": round(float(precision), 4),
        "recall": round(float(recall), 4),
        "confusion_matrix": [[tn, fp], [fn, tp]],
    }


def _evaluate_vh_split(
    pairs: Sequence[Tuple[str, str]],
    vh_threshold_db: float,
    s1_dir: Path = config.S1_HAND_DIR,
    label_dir: Path = config.LABEL_HAND_DIR,
) -> Dict[str, object]:
    """Evaluate a fixed VH backscatter threshold (VH < threshold -> water) across a split."""
    tp = fp = fn = tn = 0
    chips_evaluated = 0

    for s1_name, lbl_name in pairs:
        s1_path = s1_dir / s1_name
        lbl_path = label_dir / lbl_name
        if not s1_path.exists() or not lbl_path.exists():
            continue
        arr = load_s1_chip(s1_path)
        lbl = load_label_chip(lbl_path)
        valid = lbl != config.IGNORE_INDEX
        if not valid.any():
            continue
        vh = arr[1]  # Band 1 is VH in dB
        preds = vh < vh_threshold_db
        p = preds[valid]
        t = lbl[valid] == 1
        tp += int(np.logical_and(p, t).sum())
        fp += int(np.logical_and(p, ~t).sum())
        fn += int(np.logical_and(~p, t).sum())
        tn += int(np.logical_and(~p, ~t).sum())
        chips_evaluated += 1

    iou = tp / (tp + fp + fn) if (tp + fp + fn) > 0 else 0.0
    f1 = (2 * tp) / (2 * tp + fp + fn) if (2 * tp + fp + fn) > 0 else 0.0
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0

    return {
        "chips": chips_evaluated,
        "iou": round(float(iou), 4),
        "f1": round(float(f1), 4),
        "precision": round(float(precision), 4),
        "recall": round(float(recall), 4),
        "confusion_matrix": [[tn, fp], [fn, tp]],
    }


def tune_and_evaluate_baseline(
    val_pairs: Sequence[Tuple[str, str]],
    test_pairs: Sequence[Tuple[str, str]],
    bolivia_pairs: Sequence[Tuple[str, str]],
    threshold_grid: Iterable[float] = config.VH_THRESHOLD_GRID,
    s1_dir: Path = config.S1_HAND_DIR,
    label_dir: Path = config.LABEL_HAND_DIR,
) -> Dict[str, object]:
    """Tune VH dB threshold on validation split only, then report val, test, and Bolivia metrics."""
    best_thresh = None
    best_val_metrics: Dict[str, object] = {}
    best_iou = -1.0
    sweep: List[Dict[str, object]] = []

    for thresh in threshold_grid:
        m = _evaluate_vh_split(val_pairs, float(thresh), s1_dir=s1_dir, label_dir=label_dir)
        sweep.append({"threshold_db": float(thresh), "val_iou": m["iou"], "val_f1": m["f1"]})
        if float(m["iou"]) > best_iou:
            best_iou = float(m["iou"])
            best_thresh = float(thresh)
            best_val_metrics = m

    assert best_thresh is not None
    test_metrics = _evaluate_vh_split(test_pairs, best_thresh, s1_dir=s1_dir, label_dir=label_dir)
    bolivia_metrics = _evaluate_vh_split(bolivia_pairs, best_thresh, s1_dir=s1_dir, label_dir=label_dir)

    return {
        "method": "Fixed VH backscatter threshold (tuned on validation split only)",
        "best_vh_threshold_db": best_thresh,
        "validation_sweep": sweep,
        "val": best_val_metrics,
        "test": test_metrics,
        "bolivia": bolivia_metrics,
    }
