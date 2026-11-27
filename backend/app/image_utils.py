"""Shared high-resolution satellite PNG stretching, sharpening, and thermal fusion helpers."""

from __future__ import annotations

from pathlib import Path
from typing import Optional, Tuple

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import gaussian_filter


def stretch_sentinel_rgb(red: np.ndarray, green: np.ndarray, blue: np.ndarray) -> np.ndarray:
    """Apply natural 2%-98% percentile contrast stretch with gentle highlight protection (avoids white blowout)."""
    stack = np.stack([red, green, blue], axis=-1).astype(np.float32)
    valid = stack[np.isfinite(stack) & (stack > 0.001)]
    if valid.size > 100:
        lo, hi = np.percentile(stack, [2.0, 98.5])
        if hi - lo > 0.02:
            norm = (stack - lo) / (hi - lo)
        else:
            norm = stack * 2.8
    else:
        norm = stack * 2.8
    # Gentle filmic tone curve + gamma 0.92 keeps roofs textured instead of clipping to pure white
    norm = np.clip(norm, 0.0, 1.0)
    return np.power(norm, 0.90).astype(np.float32)


def _save_fig_sharpened(fig: plt.Figure, out_path: Path, radius: float = 1.15, percent: int = 135) -> None:
    """Save matplotlib figure tightly cropped and apply PIL unsharp mask for crisp street/roof detail."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, bbox_inches="tight", pad_inches=0.0, facecolor=fig.get_facecolor())
    plt.close(fig)
    with Image.open(out_path) as im:
        rgb = im.convert("RGB").filter(ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=2))
        rgb.save(out_path, format="PNG", optimize=True)


def save_sharp_overlay_png(
    rgb: np.ndarray,
    out_path: Path,
    overlays: Optional[list[Tuple[np.ndarray, Tuple[float, float, float], float]]] = None,
    center_dot: bool = False,
    figsize: Tuple[float, float] = (8.0, 5.0),
    dpi: int = 200,
) -> None:
    """Render an HD sharpened satellite image with optional crisp translucent masks & center reticle."""
    img = np.clip(rgb, 0.0, 1.0).copy()
    if overlays:
        for mask, col, alpha in overlays:
            if mask is None:
                continue
            m = mask > 0
            if np.any(m):
                c_arr = np.array(col, dtype=np.float32)
                img[m] = img[m] * (1.0 - alpha) + c_arr * alpha

    fig, ax = plt.subplots(figsize=figsize, dpi=dpi)
    ax.imshow(np.clip(img, 0.0, 1.0), interpolation="lanczos")
    if center_dot:
        cy, cx = img.shape[0] // 2, img.shape[1] // 2
        ax.scatter([cx], [cy], s=140, facecolors="none", edgecolors="#fbbf24", linewidths=2.2, zorder=6)
        ax.scatter([cx], [cy], s=28, c="#fbbf24", edgecolors="#001710", linewidths=1.0, zorder=7)
    ax.set_position([0, 0, 1, 1])
    ax.axis("off")
    fig.patch.set_facecolor("#001710")
    _save_fig_sharpened(fig, out_path, radius=1.25, percent=145)


def save_fused_thermal_png(
    s2_rgb: Optional[np.ndarray],
    lst_c: np.ndarray,
    out_path: Path,
    vmin: float = 24.0,
    vmax: float = 45.0,
    figsize: Tuple[float, float] = (8.0, 5.0),
    dpi: int = 200,
) -> None:
    """Composite smooth bilinear Landsat thermal LST heatmap over sharp 10m Sentinel-2 imagery."""
    smooth_lst = np.where(np.isfinite(lst_c), lst_c, np.nanmean(lst_c))
    smooth_lst = gaussian_filter(smooth_lst.astype(np.float32), sigma=0.85)

    fig, ax = plt.subplots(figsize=figsize, dpi=dpi)
    if s2_rgb is not None:
        ax.imshow(np.clip(s2_rgb, 0.0, 1.0), interpolation="lanczos", extent=[0, 1, 0, 1], aspect="auto")
        im = ax.imshow(
            np.clip(smooth_lst, vmin, vmax),
            cmap="inferno",
            vmin=vmin,
            vmax=vmax,
            alpha=0.52,
            interpolation="bilinear",
            extent=[0, 1, 0, 1],
            aspect="auto",
        )
    else:
        im = ax.imshow(np.clip(smooth_lst, vmin, vmax), cmap="inferno", vmin=vmin, vmax=vmax, interpolation="bilinear", aspect="auto")

    cbar = fig.colorbar(im, ax=ax, fraction=0.032, pad=0.015)
    cbar.ax.tick_params(colors="#F5F1E6", labelsize=8)
    cbar.set_label("LST (°C)", color="#F5F1E6", fontsize=8)
    ax.axis("off")
    fig.patch.set_facecolor("#001710")
    _save_fig_sharpened(fig, out_path, radius=1.1, percent=120)
