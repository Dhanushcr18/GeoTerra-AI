"""Sen1Floods11 dataset loading, normalization, and augmentations."""

from __future__ import annotations

import csv
import random
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np
import rasterio
import torch
from torch.utils.data import Dataset

from ml import config


def read_split_csv(csv_path: Path) -> List[Tuple[str, str]]:
    """Read (s1_filename, label_filename) pairs from an official Sen1Floods11 split CSV."""
    pairs: List[Tuple[str, str]] = []
    with open(csv_path, "r", encoding="utf-8") as f:
        for row in csv.reader(f):
            if not row or len(row) < 2:
                continue
            s1_name, lbl_name = row[0].strip(), row[1].strip()
            if not s1_name.endswith(".tif"):
                continue
            pairs.append((s1_name, lbl_name))
    return pairs


def load_s1_chip(path: Path, clip_min: float = config.DB_CLIP_MIN, clip_max: float = config.DB_CLIP_MAX) -> np.ndarray:
    """Load a 2-band Sentinel-1 GeoTIFF (VV, VH in dB), replacing NaNs and clipping to dB range."""
    with rasterio.open(path) as src:
        arr = src.read().astype(np.float32)  # (2, H, W)
    if arr.shape[0] < 2:
        raise ValueError(f"Expected 2 bands (VV, VH) in {path}, got shape {arr.shape}")
    arr = arr[:2]
    invalid = ~np.isfinite(arr)
    if invalid.any():
        arr = np.where(invalid, clip_min, arr)
    return np.clip(arr, clip_min, clip_max)


def load_label_chip(path: Path) -> np.ndarray:
    """Load a Sen1Floods11 hand-label GeoTIFF (-1 no data, 0 not water, 1 water)."""
    with rasterio.open(path) as src:
        lbl = src.read(1).astype(np.int64)
    return lbl


def compute_channel_stats(
    pairs: Sequence[Tuple[str, str]],
    s1_dir: Path = config.S1_HAND_DIR,
    label_dir: Path = config.LABEL_HAND_DIR,
) -> Dict[str, Tuple[float, float]]:
    """Compute per-channel (VV, VH) mean and std strictly on the training split."""
    sums = np.zeros(2, dtype=np.float64)
    sq_sums = np.zeros(2, dtype=np.float64)
    count = 0

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
        vals = arr[:, valid].astype(np.float64)  # (2, N)
        sums += vals.sum(axis=1)
        sq_sums += (vals ** 2).sum(axis=1)
        count += vals.shape[1]

    if count == 0:
        return config.DEFAULT_CHANNEL_STATS

    mean = sums / count
    var = np.maximum(sq_sums / count - mean ** 2, 1e-6)
    std = np.sqrt(var)
    return {
        "mean": (float(mean[0]), float(mean[1])),
        "std": (float(std[0]), float(std[1])),
    }


def normalize_s1(
    arr: np.ndarray,
    mean: Tuple[float, float],
    std: Tuple[float, float],
) -> np.ndarray:
    """Normalize a (2, H, W) S1 dB tensor using train-split channel statistics."""
    mean_arr = np.array(mean, dtype=np.float32)[:, None, None]
    std_arr = np.maximum(np.array(std, dtype=np.float32)[:, None, None], 1e-6)
    return (arr - mean_arr) / std_arr


class Sen1Floods11Dataset(Dataset):
    """PyTorch dataset for Sen1Floods11 hand-labeled Sentinel-1 flood chips."""

    def __init__(
        self,
        pairs: Sequence[Tuple[str, str]],
        s1_dir: Path = config.S1_HAND_DIR,
        label_dir: Path = config.LABEL_HAND_DIR,
        mean: Tuple[float, float] = config.DEFAULT_CHANNEL_STATS["mean"],
        std: Tuple[float, float] = config.DEFAULT_CHANNEL_STATS["std"],
        crop_size: Optional[int] = config.CROP_SIZE,
        augment: bool = False,
    ) -> None:
        self.samples: List[Tuple[Path, Path]] = []
        for s1_name, lbl_name in pairs:
            s1_path = s1_dir / s1_name
            lbl_path = label_dir / lbl_name
            if s1_path.exists() and lbl_path.exists():
                self.samples.append((s1_path, lbl_path))
        if not self.samples:
            raise FileNotFoundError(
                f"No Sen1Floods11 chips found in {s1_dir} and {label_dir}. "
                "Run notebook 01_get_sen1floods11.ipynb first."
            )
        self.mean = mean
        self.std = std
        self.crop_size = crop_size
        self.augment = augment

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        s1_path, lbl_path = self.samples[idx]
        x = load_s1_chip(s1_path)
        y = load_label_chip(lbl_path)

        if self.augment and self.crop_size is not None:
            _, h, w = x.shape
            ch = min(self.crop_size, h)
            cw = min(self.crop_size, w)
            top = random.randint(0, h - ch)
            left = random.randint(0, w - cw)
            x = x[:, top : top + ch, left : left + cw]
            y = y[top : top + ch, left : left + cw]

            if random.random() < 0.5:
                x = np.flip(x, axis=2).copy()
                y = np.flip(y, axis=1).copy()
            if random.random() < 0.5:
                x = np.flip(x, axis=1).copy()
                y = np.flip(y, axis=0).copy()
            k = random.randint(0, 3)
            if k > 0:
                x = np.rot90(x, k=k, axes=(1, 2)).copy()
                y = np.rot90(y, k=k, axes=(0, 1)).copy()

        x = normalize_s1(x, self.mean, self.std)
        return torch.from_numpy(x.astype(np.float32)), torch.from_numpy(y.astype(np.int64))
