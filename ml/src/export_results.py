"""Export real ML pipeline outputs and PNG previews into backend/data/."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import geopandas as gpd
import matplotlib.pyplot as plt
import numpy as np
from shapely.geometry import box

from ml import config

# Import single-source-of-truth assumptions from backend/app/config.py
if str(config.REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(config.REPO_ROOT))
from backend.app.config import ASSUMPTIONS
from backend.app.schemas import ResultsPayload


def save_sar_preview_png(s1_db: np.ndarray, out_path: Path, title: str, overlay_mask: Optional[np.ndarray] = None) -> None:
    """Render a false-color SAR preview (VV, VH, VV-VH) with optional flood overlay."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    vv = np.clip((s1_db[0] + 25.0) / 25.0, 0.0, 1.0)
    vh = np.clip((s1_db[1] + 30.0) / 25.0, 0.0, 1.0)
    ratio = np.clip((s1_db[0] - s1_db[1]) / 12.0, 0.0, 1.0)
    rgb = np.stack([vv, vh, ratio], axis=-1)

    if overlay_mask is not None:
        flood = overlay_mask > 0
        rgb[flood] = rgb[flood] * 0.35 + np.array([0.05, 0.65, 0.98], dtype=np.float32) * 0.65

    fig, ax = plt.subplots(figsize=(6, 6), dpi=150)
    ax.imshow(rgb)
    ax.set_title(title, color="white", fontsize=11, pad=8)
    ax.axis("off")
    fig.patch.set_facecolor("#0b1220")
    fig.savefig(out_path, bbox_inches="tight", pad_inches=0.05, facecolor=fig.get_facecolor())
    plt.close(fig)


def save_rgb_preview_png(rgb: np.ndarray, out_path: Path, title: str, overlay_mask: Optional[np.ndarray] = None) -> None:
    """Render a Sentinel-2 RGB preview PNG with optional amber land-change overlay."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img = np.nan_to_num(rgb.copy(), nan=0.1)
    if overlay_mask is not None:
        m = overlay_mask > 0
        img[m] = img[m] * 0.35 + np.array([0.96, 0.45, 0.09], dtype=np.float32) * 0.65

    fig, ax = plt.subplots(figsize=(6, 6), dpi=150)
    ax.imshow(np.clip(img, 0.0, 1.0))
    ax.set_title(title, color="white", fontsize=11, pad=8)
    ax.axis("off")
    fig.patch.set_facecolor("#0b1220")
    fig.savefig(out_path, bbox_inches="tight", pad_inches=0.05, facecolor=fig.get_facecolor())
    plt.close(fig)


def export_pipeline_outputs(
    model_card: Dict[str, Any],
    scenes: List[Dict[str, Any]],
    flood_gdf: gpd.GeoDataFrame,
    assets_gdf: gpd.GeoDataFrame,
    change_gdf: gpd.GeoDataFrame,
    flood_summary: Dict[str, Any],
    change_summary: Dict[str, Any],
    scene_before_id: str,
    scene_after_id: str,
    date_before: str,
    date_after: str,
    change_dates: Dict[str, str],
    aoi_bbox: Tuple[float, float, float, float] = config.DEFAULT_AOI_BBOX,
    aoi_name: str = config.DEFAULT_AOI_NAME,
    change_site_name: str = config.CHANGE_SITE_NAME,
    settlements_affected: Optional[List[Dict[str, Any]]] = None,
    output_dir: Path = config.BACKEND_DATA_DIR,
) -> Path:
    """Write validated real pipeline outputs (sample=False) into backend/data/."""
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "images").mkdir(parents=True, exist_ok=True)

    aoi_gdf = gpd.GeoDataFrame(
        [{"name": aoi_name, "geometry": box(*aoi_bbox)}],
        crs="EPSG:4326",
    )
    aoi_gdf.to_file(output_dir / "aoi.geojson", driver="GeoJSON")
    flood_gdf.to_file(output_dir / "flood_extent.geojson", driver="GeoJSON")
    assets_gdf.to_file(output_dir / "assets.geojson", driver="GeoJSON")
    change_gdf.to_file(output_dir / "change_polygons.geojson", driver="GeoJSON")

    clean_scenes = [{k: v for k, v in s.items() if k != "_item"} for s in scenes]
    (output_dir / "scenes.json").write_text(json.dumps(clean_scenes, indent=2), encoding="utf-8")

    payload = {
        "sample": False,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": {
            "name": model_card["model_name"],
            "trained_on": model_card["dataset"],
            "metrics": {
                "val": {
                    "iou": model_card["metrics"]["val"]["iou"],
                    "f1": model_card["metrics"]["val"]["f1"],
                },
                "test": {
                    "iou": model_card["metrics"]["test"]["iou"],
                    "f1": model_card["metrics"]["test"]["f1"],
                },
                "bolivia": {
                    "iou": model_card["metrics"]["bolivia"]["iou"],
                    "f1": model_card["metrics"]["bolivia"]["f1"],
                },
            },
            "baseline_metrics": {
                "test": {
                    "iou": model_card["baseline_metrics"]["test"]["iou"],
                    "f1": model_card["baseline_metrics"]["test"]["f1"],
                },
                "bolivia": {
                    "iou": model_card["baseline_metrics"]["bolivia"]["iou"],
                    "f1": model_card["baseline_metrics"]["bolivia"]["f1"],
                },
            },
        },
        "flood": {
            "aoi_name": aoi_name,
            "scene_before": scene_before_id,
            "scene_after": scene_after_id,
            "date_before": date_before,
            "date_after": date_after,
            "validated": False,
            "flooded_area_ha": flood_summary["flooded_area_ha"],
            "cropland_affected_ha": flood_summary["cropland_affected_ha"],
            "built_up_affected_ha": flood_summary["built_up_affected_ha"],
            "roads_affected_km": flood_summary["roads_affected_km"],
            "settlements_affected": settlements_affected or [],
            "critical_infrastructure_affected": flood_summary["critical_infrastructure_affected"],
        },
        "change": {
            "site_name": change_site_name,
            "dates": change_dates,
            "changed_area_ha": change_summary["changed_area_ha"],
            "vegetation_loss_ha": change_summary["vegetation_loss_ha"],
            "bare_soil_increase_ha": change_summary["bare_soil_increase_ha"],
            "polygons": change_summary["polygons"],
        },
        "economics": {
            "loss_per_ha_inr": ASSUMPTIONS.loss_per_ha_inr,
            "assessment_time_manual_days": ASSUMPTIONS.assessment_time_manual_days,
            "assessment_time_geoterra_hours": ASSUMPTIONS.assessment_time_geoterra_hours,
        },
        "onboard_sim": {
            "raw_scene_size_mb": ASSUMPTIONS.raw_scene_size_mb,
            "insight_packet_size_kb": ASSUMPTIONS.insight_packet_size_kb,
            "downlink_rate_mbps": ASSUMPTIONS.downlink_rate_mbps,
        },
    }

    validated = ResultsPayload.model_validate(payload)
    results_path = output_dir / "results.json"
    results_path.write_text(validated.model_dump_json(indent=2), encoding="utf-8")
    return results_path
