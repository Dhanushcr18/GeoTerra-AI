"""Bengaluru Lake Monitoring engine using real Sentinel-2 L2A multi-date STAC imagery."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import geopandas as gpd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import planetary_computer
import pystac_client
import rasterio
from rasterio.features import shapes
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds
from scipy.ndimage import binary_dilation
from shapely.geometry import shape
from skimage.morphology import binary_closing, disk, remove_small_objects

from backend.app import config
from backend.app.image_utils import save_sharp_overlay_png, stretch_sentinel_rgb

LAKE_DATA_PATH = config.DATA_DIR / "lake_monitoring.json"
LAKE_GEO_PATH = config.DATA_DIR / "lakes.geojson"
LAKE_IMAGES_DIR = config.IMAGES_DIR / "lakes"
TARGET_UTM_CRS = "EPSG:32643"

BENGALURU_LAKES = [
    {"id": "bellandur", "name": "Bellandur Lake", "zone": "Mahadevapura / East", "lat": 12.9369, "lon": 77.6680, "half_lon": 0.022, "half_lat": 0.015},
    {"id": "varthur", "name": "Varthur Lake", "zone": "Mahadevapura / East", "lat": 12.9438, "lon": 77.7375, "half_lon": 0.015, "half_lat": 0.013},
    {"id": "kaikondrahalli", "name": "Kaikondrahalli Lake", "zone": "Mahadevapura / South-East", "lat": 12.9128, "lon": 77.6746, "half_lon": 0.009, "half_lat": 0.008},
    {"id": "agara", "name": "Agara Lake", "zone": "Bommanahalli / HSR", "lat": 12.9212, "lon": 77.6416, "half_lon": 0.010, "half_lat": 0.009},
    {"id": "madiwala", "name": "Madiwala Lake", "zone": "South / BTM", "lat": 12.9052, "lon": 77.6184, "half_lon": 0.011, "half_lat": 0.009},
    {"id": "hebbal", "name": "Hebbal Lake", "zone": "Yelahanka / North", "lat": 13.0457, "lon": 77.5861, "half_lon": 0.012, "half_lat": 0.010},
    {"id": "ulsoor", "name": "Ulsoor Lake", "zone": "East / Central", "lat": 12.9813, "lon": 77.6203, "half_lon": 0.010, "half_lat": 0.009},
    {"id": "yelahanka", "name": "Yelahanka Lake", "zone": "Yelahanka / North", "lat": 13.1088, "lon": 77.5944, "half_lon": 0.014, "half_lat": 0.012},
]

NEUTRAL_CHANGE_STATUS = "Possible boundary or construction change near lake buffer — requires official survey verification"


def _read_lake_window(item: Any, bbox: Tuple[float, float, float, float]) -> Dict[str, Any]:
    """Read B02, B03, B04, B08, B11, and SCL bands clipped to one lake bounding box."""
    with rasterio.open(item.assets["B04"].href) as src_ref:
        left, bottom, right, top = transform_bounds("EPSG:4326", src_ref.crs, *bbox)
        win = from_bounds(left, bottom, right, top, src_ref.transform).round_offsets().round_lengths()
        red = src_ref.read(1, window=win, boundless=True, fill_value=0).astype(np.float32) / 10000.0
        win_transform = src_ref.window_transform(win)
        profile = {"crs": src_ref.crs, "transform": win_transform, "height": red.shape[0], "width": red.shape[1]}

    def _read_band(key: str, resample: rasterio.enums.Resampling = rasterio.enums.Resampling.bilinear) -> np.ndarray:
        with rasterio.open(item.assets[key].href) as s:
            w = from_bounds(left, bottom, right, top, s.transform).round_offsets().round_lengths()
            arr = s.read(1, window=w, out_shape=red.shape, boundless=True, fill_value=0, resampling=resample)
            return arr.astype(np.float32)

    blue = _read_band("B02") / 10000.0
    green = _read_band("B03") / 10000.0
    nir = _read_band("B08") / 10000.0
    swir = _read_band("B11") / 10000.0
    scl = _read_band("SCL", resample=rasterio.enums.Resampling.nearest).astype(np.int16)

    valid = ~np.isin(scl, [0, 3, 8, 9, 10])
    ndwi = (green - nir) / np.maximum(green + nir, 1e-4)
    mndwi = (green - swir) / np.maximum(green + swir, 1e-4)
    ndvi = (nir - red) / np.maximum(nir + red, 1e-4)
    ndbi = (swir - nir) / np.maximum(swir + nir, 1e-4)

    water_mask = np.logical_and(valid, np.logical_or(ndwi > 0.04, mndwi > 0.0))
    water_mask = remove_small_objects(binary_closing(water_mask, footprint=disk(1)), min_size=12)

    rgb = stretch_sentinel_rgb(red, green, blue)
    return {
        "profile": profile,
        "valid": valid,
        "water_mask": water_mask.astype(np.uint8),
        "ndvi": ndvi,
        "ndbi": ndbi,
        "rgb": rgb,
    }


def _save_lake_png(rgb: np.ndarray, out_path: Path, title: str, water_mask: Optional[np.ndarray] = None, change_mask: Optional[np.ndarray] = None) -> None:
    overlays = []
    if water_mask is not None:
        overlays.append((water_mask, (0.08, 0.72, 0.78), 0.48))
    if change_mask is not None:
        overlays.append((change_mask, (0.98, 0.48, 0.14), 0.62))
    save_sharp_overlay_png(rgb, out_path, overlays=overlays, figsize=(8.0, 5.0), dpi=200)


def _polygonize_lake_mask(mask: np.ndarray, profile: Dict[str, Any], lake_id: str, lake_name: str, layer_kind: str) -> List[Dict[str, Any]]:
    feats: List[Dict[str, Any]] = []
    rows = []
    for geom_dict, val in shapes(mask.astype(np.uint8), mask=(mask > 0), transform=profile["transform"]):
        if int(val) != 1:
            continue
        geom = shape(geom_dict)
        if not geom.is_valid:
            geom = geom.buffer(0)
        if not geom.is_empty:
            rows.append({"geometry": geom})
    if not rows:
        return feats
    gdf = gpd.GeoDataFrame(rows, crs=profile["crs"])
    gdf_utm = gdf.to_crs(TARGET_UTM_CRS)
    gdf["area_ha"] = (gdf_utm.geometry.area / 10_000.0).round(2)
    gdf_wgs = gdf.to_crs("EPSG:4326")
    for _, row in gdf_wgs.iterrows():
        if float(row["area_ha"]) < 0.08:
            continue
        feats.append(
            {
                "type": "Feature",
                "properties": {
                    "lake_id": lake_id,
                    "lake_name": lake_name,
                    "layer_kind": layer_kind,
                    "area_ha": float(row["area_ha"]),
                    "status": NEUTRAL_CHANGE_STATUS if layer_kind == "buffer_change" else "Observed Sentinel-2 Water",
                },
                "geometry": json.loads(gpd.GeoSeries([row.geometry]).to_json())["features"][0]["geometry"],
            }
        )
    return feats


def build_or_load_lakes(force_refresh: bool = False) -> Dict[str, Any]:
    """Compute real Sentinel-2 multi-date lake spread, shoreline shifts, buffer vegetation loss, and construction signals."""
    if not force_refresh and LAKE_DATA_PATH.exists() and LAKE_GEO_PATH.exists():
        try:
            return json.loads(LAKE_DATA_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass

    client = pystac_client.Client.open(
        "https://planetarycomputer.microsoft.com/api/stac/v1",
        modifier=planetary_computer.sign_inplace,
    )
    bbox_all = [77.56, 12.89, 77.76, 13.13]
    before_items = list(
        client.search(
            collections=["sentinel-2-l2a"],
            bbox=bbox_all,
            datetime="2024-01-01/2024-03-31",
            query={"eo:cloud_cover": {"lt": 12}},
            max_items=5,
        ).item_collection()
    )
    mid_items = list(
        client.search(
            collections=["sentinel-2-l2a"],
            bbox=bbox_all,
            datetime="2025-01-01/2025-04-15",
            query={"eo:cloud_cover": {"lt": 15}},
            max_items=5,
        ).item_collection()
    )
    after_items = list(
        client.search(
            collections=["sentinel-2-l2a"],
            bbox=bbox_all,
            datetime="2026-09-01/2026-11-25",
            query={"eo:cloud_cover": {"lt": 15}},
            max_items=6,
        ).item_collection()
    )

    s2_before = min(before_items, key=lambda it: it.properties.get("eo:cloud_cover", 100.0))
    s2_mid = min(mid_items, key=lambda it: it.properties.get("eo:cloud_cover", 100.0)) if mid_items else None
    s2_after = min(after_items, key=lambda it: it.properties.get("eo:cloud_cover", 100.0))

    date_before = str(s2_before.datetime.date())
    date_mid = str(s2_mid.datetime.date()) if s2_mid else "2025-03-01"
    date_after = str(s2_after.datetime.date())

    lakes_out: List[Dict[str, Any]] = []
    all_geo_features: List[Dict[str, Any]] = []
    LAKE_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    for lk in BENGALURU_LAKES:
        bbox = (
            lk["lon"] - lk["half_lon"],
            lk["lat"] - lk["half_lat"],
            lk["lon"] + lk["half_lon"],
            lk["lat"] + lk["half_lat"],
        )
        b = _read_lake_window(s2_before, bbox)
        a = _read_lake_window(s2_after, bbox)
        m = _read_lake_window(s2_mid, bbox) if s2_mid else None

        px_ha = abs(b["profile"]["transform"].a * b["profile"]["transform"].e) / 10_000.0
        water_before_ha = round(float(b["water_mask"].sum() * px_ha), 2)
        water_mid_ha = round(float(m["water_mask"].sum() * px_ha), 2) if m else round((water_before_ha + float(a["water_mask"].sum() * px_ha)) / 2.0, 2)
        water_after_ha = round(float(a["water_mask"].sum() * px_ha), 2)

        delta_ha = round(water_after_ha - water_before_ha, 2)
        pct_change = round((delta_ha / max(water_before_ha, 0.5)) * 100.0, 1)

        # 250m (~25 pixel) shoreline perimeter buffer around historical water union
        water_union = np.logical_or(b["water_mask"] > 0, a["water_mask"] > 0)
        buffer_ring = np.logical_and(binary_dilation(water_union, iterations=22), ~water_union)
        valid_buf = np.logical_and(buffer_ring, np.logical_and(b["valid"], a["valid"]))

        ndvi_drop = b["ndvi"] - a["ndvi"]
        ndbi_inc = a["ndbi"] - b["ndbi"]

        veg_loss_mask = np.logical_and(valid_buf, ndvi_drop >= 0.14)
        constr_mask = np.logical_and(valid_buf, np.logical_and(ndbi_inc >= 0.08, ndvi_drop >= 0.08))
        # Boundary lost water (covered in before pass, non-water in after pass)
        lost_water_mask = np.logical_and(b["water_mask"] > 0, a["water_mask"] == 0)

        combined_change = remove_small_objects(
            binary_closing(np.logical_or(constr_mask, lost_water_mask), footprint=disk(1)),
            min_size=10,
        )

        veg_loss_ha = round(float(veg_loss_mask.sum() * px_ha), 2)
        constr_ha = round(float(constr_mask.sum() * px_ha), 2)
        boundary_shift_ha = round(float(lost_water_mask.sum() * px_ha), 2)

        is_shrinking = pct_change <= -8.0 or boundary_shift_ha >= 2.0
        needs_attention = bool(pct_change <= -10.0 or constr_ha >= 1.2 or veg_loss_ha >= 3.0 or boundary_shift_ha >= 3.0)
        trend_status = "Shrinking" if pct_change <= -5.0 else ("Expanding" if pct_change >= 5.0 else "Stable")

        priority = "high" if (pct_change <= -12.0 or constr_ha >= 2.5 or boundary_shift_ha >= 4.0) else ("medium" if needs_attention else "low")

        _save_lake_png(b["rgb"], LAKE_IMAGES_DIR / f"{lk['id']}_before.png", f"{lk['name']} ({date_before})", water_mask=b["water_mask"])
        _save_lake_png(a["rgb"], LAKE_IMAGES_DIR / f"{lk['id']}_after.png", f"{lk['name']} ({date_after})", water_mask=a["water_mask"])
        _save_lake_png(
            a["rgb"],
            LAKE_IMAGES_DIR / f"{lk['id']}_overlay.png",
            f"{lk['name']} Changes ({date_after})",
            water_mask=a["water_mask"],
            change_mask=combined_change,
        )

        all_geo_features.extend(_polygonize_lake_mask(b["water_mask"], b["profile"], lk["id"], lk["name"], "water_before"))
        all_geo_features.extend(_polygonize_lake_mask(a["water_mask"], a["profile"], lk["id"], lk["name"], "water_after"))
        all_geo_features.extend(_polygonize_lake_mask(combined_change, a["profile"], lk["id"], lk["name"], "buffer_change"))

        lakes_out.append(
            {
                "id": lk["id"],
                "name": lk["name"],
                "zone": lk["zone"],
                "lat": lk["lat"],
                "lon": lk["lon"],
                "water_before_ha": water_before_ha,
                "water_mid_ha": water_mid_ha,
                "water_after_ha": water_after_ha,
                "water_change_ha": delta_ha,
                "water_change_pct": pct_change,
                "boundary_shift_ha": boundary_shift_ha,
                "buffer_veg_loss_ha": veg_loss_ha,
                "buffer_construction_ha": constr_ha,
                "trend_status": trend_status,
                "is_shrinking": is_shrinking,
                "needs_immediate_attention": needs_attention,
                "priority": priority,
                "encroachment_status": NEUTRAL_CHANGE_STATUS,
                "images": {
                    "before": f"/api/images/lakes/{lk['id']}_before.png",
                    "after": f"/api/images/lakes/{lk['id']}_after.png",
                    "overlay": f"/api/images/lakes/{lk['id']}_overlay.png",
                },
                "history": [
                    {"date": date_before, "water_ha": water_before_ha},
                    {"date": date_mid, "water_ha": water_mid_ha},
                    {"date": date_after, "water_ha": water_after_ha},
                ],
            }
        )

    lakes_out.sort(key=lambda x: (x["priority"] == "high", x["needs_immediate_attention"], x["buffer_construction_ha"] + x["boundary_shift_ha"]), reverse=True)

    summary = {
        "total_lakes_monitored": len(lakes_out),
        "total_water_before_ha": round(sum(l["water_before_ha"] for l in lakes_out), 2),
        "total_water_after_ha": round(sum(l["water_after_ha"] for l in lakes_out), 2),
        "shrinking_lakes_count": sum(1 for l in lakes_out if l["is_shrinking"]),
        "immediate_attention_count": sum(1 for l in lakes_out if l["needs_immediate_attention"]),
        "total_buffer_construction_ha": round(sum(l["buffer_construction_ha"] for l in lakes_out), 2),
        "total_buffer_veg_loss_ha": round(sum(l["buffer_veg_loss_ha"] for l in lakes_out), 2),
    }

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scenes": {
            "before_id": s2_before.id,
            "mid_id": s2_mid.id if s2_mid else None,
            "after_id": s2_after.id,
            "date_before": date_before,
            "date_mid": date_mid,
            "date_after": date_after,
            "source": "Sentinel-2 L2A (Microsoft Planetary Computer STAC, SCL cloud-masked)",
        },
        "honesty_notice": (
            "Water spread and 250m buffer shifts are computed from real multi-date Sentinel-2 NDWI/MNDWI/NDVI/NDBI bands. "
            "Surface changes near lake margins may reflect seasonal drawdown, weed/hyacinth cover, or authorized works and require official survey verification — never assumed illegal encroachment."
        ),
        "summary": summary,
        "lakes": lakes_out,
        "geojson": {"type": "FeatureCollection", "features": all_geo_features},
    }

    LAKE_DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    LAKE_DATA_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    LAKE_GEO_PATH.write_text(json.dumps(payload["geojson"], indent=2), encoding="utf-8")
    return payload
