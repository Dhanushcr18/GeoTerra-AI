"""Training entrypoint for Sen1Floods11 U-Net flood segmentation."""

from __future__ import annotations

import json
import random
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

import numpy as np
import torch
from torch.utils.data import DataLoader

from ml import config
from ml.src.dataset import Sen1Floods11Dataset, compute_channel_stats, read_split_csv
from ml.src.evaluate import evaluate_model, tune_and_evaluate_baseline
from ml.src.model import MaskedBCEDiceLoss, build_unet


def set_seed(seed: int = config.SEED) -> None:
    """Fix random seeds across Python, NumPy, and PyTorch for reproducible runs."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def train_unet(
    epochs: int = config.EPOCHS,
    batch_size: int = config.BATCH_SIZE,
    lr: float = config.LEARNING_RATE,
    checkpoints_dir: Path = config.CHECKPOINTS_DIR,
    backend_data_dir: Path = config.BACKEND_DATA_DIR,
    baseline_results: Optional[Dict[str, object]] = None,
) -> Dict[str, object]:
    """Train ResNet-34 U-Net on Sen1Floods11 hand-labeled train/val splits and evaluate on test & Bolivia."""
    set_seed(config.SEED)
    checkpoints_dir.mkdir(parents=True, exist_ok=True)
    backend_data_dir.mkdir(parents=True, exist_ok=True)

    train_pairs = read_split_csv(config.SPLITS_DIR / "flood_train_data.csv")
    val_pairs = read_split_csv(config.SPLITS_DIR / "flood_valid_data.csv")
    test_pairs = read_split_csv(config.SPLITS_DIR / "flood_test_data.csv")
    bolivia_pairs = read_split_csv(config.SPLITS_DIR / "flood_bolivia_data.csv")

    stats = compute_channel_stats(train_pairs)
    mean, std = stats["mean"], stats["std"]

    train_ds = Sen1Floods11Dataset(train_pairs, mean=mean, std=std, crop_size=config.CROP_SIZE, augment=True)
    val_ds = Sen1Floods11Dataset(val_pairs, mean=mean, std=std, crop_size=None, augment=False)
    test_ds = Sen1Floods11Dataset(test_pairs, mean=mean, std=std, crop_size=None, augment=False)
    bolivia_ds = Sen1Floods11Dataset(bolivia_pairs, mean=mean, std=std, crop_size=None, augment=False)

    pin = torch.cuda.is_available()
    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=config.NUM_WORKERS, pin_memory=pin)
    val_loader = DataLoader(val_ds, batch_size=max(1, batch_size // 2), shuffle=False, num_workers=config.NUM_WORKERS, pin_memory=pin)
    test_loader = DataLoader(test_ds, batch_size=max(1, batch_size // 2), shuffle=False, num_workers=config.NUM_WORKERS, pin_memory=pin)
    bolivia_loader = DataLoader(bolivia_ds, batch_size=max(1, batch_size // 2), shuffle=False, num_workers=config.NUM_WORKERS, pin_memory=pin)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = build_unet().to(device)
    criterion = MaskedBCEDiceLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=config.WEIGHT_DECAY)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(epochs, 1), eta_min=1e-6)
    scaler = torch.amp.GradScaler("cuda", enabled=torch.cuda.is_available())

    best_val_iou = -1.0
    patience_counter = 0
    best_ckpt_path = checkpoints_dir / "best_model.pt"
    training_log = []

    for epoch in range(1, epochs + 1):
        model.train()
        running_loss = 0.0
        steps = 0

        for x, y in train_loader:
            x = x.to(device, non_blocking=True)
            y = y.to(device, non_blocking=True)
            optimizer.zero_grad(set_to_none=True)

            with torch.amp.autocast("cuda", enabled=torch.cuda.is_available()):
                logits = model(x)
                loss = criterion(logits, y)

            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()

            running_loss += float(loss.item())
            steps += 1

        scheduler.step()
        train_loss = round(running_loss / max(steps, 1), 5)
        val_metrics = evaluate_model(model, val_loader, device, criterion=criterion)

        entry = {
            "epoch": epoch,
            "train_loss": train_loss,
            "val_loss": val_metrics["loss"],
            "val_iou": val_metrics["iou"],
            "val_f1": val_metrics["f1"],
            "lr": round(float(optimizer.param_groups[0]["lr"]), 7),
        }
        training_log.append(entry)
        print(
            f"Epoch {epoch:02d}/{epochs} | train_loss={train_loss:.4f} "
            f"| val_loss={val_metrics['loss']:.4f} | val_iou={val_metrics['iou']:.4f} | val_f1={val_metrics['f1']:.4f}"
        )

        if float(val_metrics["iou"]) > best_val_iou:
            best_val_iou = float(val_metrics["iou"])
            patience_counter = 0
            torch.save(
                {
                    "model_state_dict": model.state_dict(),
                    "encoder_name": config.ENCODER_NAME,
                    "in_channels": config.IN_CHANNELS,
                    "channel_mean": mean,
                    "channel_std": std,
                    "db_clip_min": config.DB_CLIP_MIN,
                    "db_clip_max": config.DB_CLIP_MAX,
                    "best_epoch": epoch,
                    "best_val_iou": best_val_iou,
                },
                best_ckpt_path,
            )
        else:
            patience_counter += 1
            if patience_counter >= config.EARLY_STOP_PATIENCE:
                print(f"Early stopping triggered at epoch {epoch} (best val IoU={best_val_iou:.4f}).")
                break

    # Load best checkpoint for official test & Bolivia evaluation
    ckpt = torch.load(best_ckpt_path, map_location=device, weights_only=True)
    model.load_state_dict(ckpt["model_state_dict"])

    val_eval = evaluate_model(model, val_loader, device, criterion=criterion)
    test_eval = evaluate_model(model, test_loader, device, criterion=criterion)
    bolivia_eval = evaluate_model(model, bolivia_loader, device, criterion=criterion)

    if baseline_results is None:
        baseline_results = tune_and_evaluate_baseline(val_pairs, test_pairs, bolivia_pairs)

    model_card = {
        "model_name": config.MODEL_NAME,
        "encoder": config.ENCODER_NAME,
        "in_channels": ["VV (dB)", "VH (dB)"],
        "normalization": {"mean": list(mean), "std": list(std)},
        "dataset": config.DATASET_NAME,
        "citation": config.DATASET_CITATION,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "split_sizes": {
            "train": len(train_ds),
            "val": len(val_ds),
            "test": len(test_ds),
            "bolivia": len(bolivia_ds),
        },
        "metrics": {
            "val": val_eval,
            "test": test_eval,
            "bolivia": bolivia_eval,
        },
        "baseline_metrics": {
            "method": baseline_results["method"],
            "best_vh_threshold_db": baseline_results["best_vh_threshold_db"],
            "val": baseline_results["val"],
            "test": baseline_results["test"],
            "bolivia": baseline_results["bolivia"],
        },
        "limitations": list(config.MODEL_LIMITATIONS),
        "karnataka_validation_note": (
            "Karnataka inference outputs have NO ground-truth flood labels and are "
            "marked 'Model prediction (unvalidated)'."
        ),
    }

    for target_dir in (checkpoints_dir, backend_data_dir):
        (target_dir / "training_log.json").write_text(json.dumps(training_log, indent=2), encoding="utf-8")
    (backend_data_dir / "model_card.json").write_text(json.dumps(model_card, indent=2), encoding="utf-8")
    (checkpoints_dir / "model_card.json").write_text(json.dumps(model_card, indent=2), encoding="utf-8")

    return model_card
