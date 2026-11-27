"""Sliding-window tiled U-Net inference with smooth overlap blending."""

from __future__ import annotations

from pathlib import Path
from typing import Optional, Tuple

import numpy as np
import torch

from ml import config
from ml.src.dataset import normalize_s1
from ml.src.model import build_unet


def _make_blend_window(tile_size: int) -> np.ndarray:
    """Create a 2D cosine-tapered blending weight map to eliminate tile seam artifacts."""
    ramp = np.hanning(tile_size + 2)[1:-1].astype(np.float32)
    ramp = np.maximum(ramp, 0.05)
    return np.outer(ramp, ramp)


def load_trained_unet(
    checkpoint_path: Path = config.CHECKPOINTS_DIR / "best_model.pt",
    device: Optional[torch.device] = None,
) -> Tuple[torch.nn.Module, Tuple[float, float], Tuple[float, float], torch.device]:
    """Load the best trained U-Net checkpoint and its training normalization statistics."""
    if device is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    ckpt = torch.load(checkpoint_path, map_location=device, weights_only=True)
    model = build_unet(
        encoder_name=ckpt.get("encoder_name", config.ENCODER_NAME),
        encoder_weights=None,
        in_channels=ckpt.get("in_channels", config.IN_CHANNELS),
    ).to(device)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()

    mean = tuple(float(v) for v in ckpt.get("channel_mean", config.DEFAULT_CHANNEL_STATS["mean"]))
    std = tuple(float(v) for v in ckpt.get("channel_std", config.DEFAULT_CHANNEL_STATS["std"]))
    return model, (mean[0], mean[1]), (std[0], std[1]), device


@torch.no_grad()
def predict_flood_probability(
    s1_db: np.ndarray,
    model: torch.nn.Module,
    mean: Tuple[float, float],
    std: Tuple[float, float],
    device: torch.device,
    tile_size: int = config.TILE_SIZE,
    overlap: int = config.TILE_OVERLAP,
    prob_threshold: float = config.PROB_THRESHOLD,
) -> Tuple[np.ndarray, np.ndarray]:
    """Run sliding-window inference on a (2, H, W) dB array and return (prob_map, binary_mask)."""
    _, h, w = s1_db.shape
    norm_arr = normalize_s1(s1_db.astype(np.float32), mean, std)

    pad_h = max(tile_size - h, 0)
    pad_w = max(tile_size - w, 0)
    if pad_h > 0 or pad_w > 0:
        norm_arr = np.pad(norm_arr, ((0, 0), (0, pad_h), (0, pad_w)), mode="reflect")

    _, ph, pw = norm_arr.shape
    stride = max(tile_size - overlap, 1)

    ys = list(range(0, max(ph - tile_size, 0) + 1, stride))
    if ys[-1] != ph - tile_size:
        ys.append(ph - tile_size)
    xs = list(range(0, max(pw - tile_size, 0) + 1, stride))
    if xs[-1] != pw - tile_size:
        xs.append(pw - tile_size)

    weight = _make_blend_window(tile_size)
    prob_accum = np.zeros((ph, pw), dtype=np.float32)
    weight_accum = np.zeros((ph, pw), dtype=np.float32)

    for y in ys:
        for x in xs:
            patch = norm_arr[:, y : y + tile_size, x : x + tile_size]
            tensor = torch.from_numpy(patch).unsqueeze(0).to(device)
            prob = torch.sigmoid(model(tensor)).squeeze(0).squeeze(0).cpu().numpy()
            prob_accum[y : y + tile_size, x : x + tile_size] += prob * weight
            weight_accum[y : y + tile_size, x : x + tile_size] += weight

    prob_full = prob_accum / np.maximum(weight_accum, 1e-6)
    prob_crop = prob_full[:h, :w]
    binary_mask = (prob_crop >= prob_threshold).astype(np.uint8)
    return prob_crop, binary_mask
