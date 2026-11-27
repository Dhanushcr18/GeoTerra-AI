"""Preprocessing for Sentinel-1 RTC (linear to dB), Sentinel-2 L2A (SCL cloud mask, NDVI/BSI), and JRC/WorldCover."""

from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import reproject, transform_bounds
from rasterio.windows import from_bounds
from scipy.ndimage import uniform_filter

from ml import config


def lee_speckle_filter(arr: np.ndarray, window_size: int = config.SPECKLE_FILTER_SIZE) -> np.ndarray:
    """Apply a Lee local-statistics SAR speckle filter to linear backscatter power."""
    if window_size <= 1:
        return arr.astype(np.float32)

    filtered = np.empty_like(arr, dtype=np.float32)
    for b in range(arr.shape[0]):
        band = np.where(np.isfinite(arr[b]) & (arr[b] > 0), arr[b], 1e-6).astype(np.float64)
        mean = uniform_filter(band, size=window_size, mode="reflect")
        sqr_mean = uniform_filter(band ** 2, size=window_size, mode="reflect")
        var = np.maximum(sqr_mean - mean ** 2, 0.0)
        noise_var = float(np.median(var))
        weight = np.where(var > 0, np.maximum(var - noise_var, 0.0) / (var + 1e-12), 0.0)
        filtered[b] = (mean + weight * (band - mean)).astype(np.float32)
    return filtered


def linear_power_to_db(arr: np.ndarray, clip_min: float = config.DB_CLIP_MIN, clip_max: float = config.DB_CLIP_MAX) -> np.ndarray:
    """Convert Planetary Computer Sentinel-1 RTC linear power to decibels (dB) matching Sen1Floods11."""
    safe = np.where(np.isfinite(arr) & (arr > 0), arr, 1e-6)
    db = 10.0 * np.log10(safe)
    return np.clip(db.astype(np.float32), clip_min, clip_max)


def read_s1_rtc_db(
    item: Any,
    bbox: Tuple[float, float, float, float] = config.DEFAULT_AOI_BBOX,
    apply_speckle_filter: bool = True,
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """Read VV and VH from a signed Sentinel-1 RTC STAC item, apply Lee speckle filter, and convert to dB."""
    vv_href = item.assets["vv"].href
    vh_href = item.assets["vh"].href

    with rasterio.open(vv_href) as src_vv:
        left, bottom, right, top = transform_bounds("EPSG:4326", src_vv.crs, *bbox)
        window = from_bounds(left, bottom, right, top, src_vv.transform).round_offsets().round_lengths()
        vv_lin = src_vv.read(1, window=window, boundless=True, fill_value=np.nan).astype(np.float32)
        win_transform = src_vv.window_transform(window)
        profile = {
            "crs": src_vv.crs,
            "transform": win_transform,
            "height": vv_lin.shape[0],
            "width": vv_lin.shape[1],
        }

    with rasterio.open(vh_href) as src_vh:
        vh_lin = src_vh.read(
            1,
            window=from_bounds(left, bottom, right, top, src_vh.transform).round_offsets().round_lengths(),
            out_shape=vv_lin.shape,
            boundless=True,
            fill_value=np.nan,
            resampling=Resampling.bilinear,
        ).astype(np.float32)

    stacked_lin = np.stack([vv_lin, vh_lin], axis=0)
    if apply_speckle_filter:
        stacked_lin = lee_speckle_filter(stacked_lin)
    stacked_db = linear_power_to_db(stacked_lin)
    return stacked_db, profile


def reproject_asset_to_grid(
    href: str,
    target_profile: Dict[str, Any],
    resampling: Resampling = Resampling.nearest,
    dtype: np.dtype = np.float32,
) -> np.ndarray:
    """Reproject a single-band raster asset to match a target grid profile."""
    dst = np.zeros((target_profile["height"], target_profile["width"]), dtype=dtype)
    with rasterio.open(href) as src:
        reproject(
            source=rasterio.band(src, 1),
            destination=dst,
            src_transform=src.transform,
            src_crs=src.crs,
            dst_transform=target_profile["transform"],
            dst_crs=target_profile["crs"],
            resampling=resampling,
        )
    return dst


def read_s2_l2a_indices(
    item: Any,
    bbox: Tuple[float, float, float, float] = config.CHANGE_AOI_BBOX,
) -> Tuple[Dict[str, np.ndarray], Dict[str, Any]]:
    """Read cloud-masked Sentinel-2 L2A bands (B02, B04, B08, B11, SCL) and compute NDVI & BSI."""
    asset_map = {
        "B02": item.assets["B02"].href,
        "B04": item.assets["B04"].href,
        "B08": item.assets["B08"].href,
        "B11": item.assets["B11"].href,
        "SCL": item.assets["SCL"].href,
    }

    with rasterio.open(asset_map["B04"]) as ref:
        left, bottom, right, top = transform_bounds("EPSG:4326", ref.crs, *bbox)
        window = from_bounds(left, bottom, right, top, ref.transform).round_offsets().round_lengths()
        b04 = ref.read(1, window=window, boundless=True, fill_value=0).astype(np.float32) / 10000.0
        profile = {
            "crs": ref.crs,
            "transform": ref.window_transform(window),
            "height": b04.shape[0],
            "width": b04.shape[1],
        }

    bands: Dict[str, np.ndarray] = {"B04": b04}
    for key in ("B02", "B08", "B11", "SCL"):
        resamp = Resampling.nearest if key == "SCL" else Resampling.bilinear
        raw = reproject_asset_to_grid(asset_map[key], profile, resampling=resamp, dtype=np.float32)
        bands[key] = raw if key == "SCL" else raw / 10000.0

    # SCL valid clear land/water classes: 4=vegetation, 5=bare/not-vegetated, 6=water, 7=unclassified
    scl = bands["SCL"].astype(np.int32)
    valid_mask = np.isin(scl, [4, 5, 6, 7])

    b02, b04, b08, b11 = bands["B02"], bands["B04"], bands["B08"], bands["B11"]
    ndvi = np.where(valid_mask, (b08 - b04) / (b08 + b04 + 1e-6), np.nan)
    bsi = np.where(
        valid_mask,
        ((b11 + b04) - (b08 + b02)) / ((b11 + b04) + (b08 + b02) + 1e-6),
        np.nan,
    )
    rgb = np.stack(
        [
            np.clip(b04 * 3.0, 0.0, 1.0),
            np.clip(reproject_asset_to_grid(item.assets["B03"].href, profile, Resampling.bilinear) / 10000.0 * 3.0, 0.0, 1.0)
            if "B03" in item.assets
            else np.clip((b04 + b02) * 1.5, 0.0, 1.0),
            np.clip(b02 * 3.0, 0.0, 1.0),
        ],
        axis=-1,
    )

    return {"ndvi": ndvi, "bsi": bsi, "valid": valid_mask, "rgb": rgb}, profile
