"""Generate realistic Bengaluru/Karnataka sample outputs (sample=True) so GeoTerra AI runs on day one."""

from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.app import config
from backend.app.schemas import ResultsPayload


def _polygon_ring(lon: float, lat: float, rx: float, ry: float, points: int = 12, seed: int = 0) -> list[list[float]]:
    rng = np.random.default_rng(seed)
    ring = []
    for i in range(points):
        ang = (2.0 * math.pi * i) / points
        jitter = 0.8 + 0.35 * float(rng.random())
        ring.append([round(lon + rx * jitter * math.cos(ang), 5), round(lat + ry * jitter * math.sin(ang), 5)])
    ring.append(ring[0])
    return ring


def _generate_preview_png(path: Path, mode: str) -> None:
    """Create deterministic synthetic SAR/Optical PNG previews for before/after sliders and PDF."""
    w, h = 512, 512
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    base = 0.35 + 0.12 * np.sin(xx / 28.0) * np.cos(yy / 26.0) + 0.08 * np.sin((xx + yy) / 19.0)

    # Diagonal valley/river channel
    channel_dist = np.abs((yy - 0.62 * xx - 85.0) / 1.18)
    perm_river = channel_dist < 14.0
    flood_zone = (channel_dist < 46.0) & (xx > 90) & (xx < 430) & (yy > 110) & (yy < 430)

    if mode in ("s1_before", "s1_after", "flood_overlay"):
        # SAR false-color RGB (VV, VH, ratio)
        r = np.clip(base + 0.15, 0.05, 0.92)
        g = np.clip(base + 0.08, 0.05, 0.88)
        b = np.clip(base * 0.85, 0.05, 0.80)
        # Permanent river dark specular return
        r[perm_river] *= 0.25
        g[perm_river] *= 0.30
        b[perm_river] = np.clip(b[perm_river] * 0.6 + 0.15, 0, 1)

        if mode in ("s1_after", "flood_overlay"):
            r[flood_zone] *= 0.28
            g[flood_zone] *= 0.35
            b[flood_zone] = np.clip(b[flood_zone] * 0.55 + 0.18, 0, 1)
        if mode == "flood_overlay":
            mask = flood_zone & (~perm_river)
            r[mask] = 0.08
            g[mask] = 0.72
            b[mask] = 0.98
        rgb = np.stack([r, g, b], axis=-1)
    else:
        # Sentinel-2 natural/false-color peri-urban vegetation + exposed soil patch
        r = np.clip(base * 0.65 + 0.12, 0.05, 0.85)
        g = np.clip(base * 0.95 + 0.18, 0.10, 0.92)
        b = np.clip(base * 0.50 + 0.08, 0.05, 0.75)

        patch1 = ((xx - 210) ** 2 / 48**2 + (yy - 185) ** 2 / 34**2) < 1.0
        patch2 = ((xx - 340) ** 2 / 36**2 + (yy - 295) ** 2 / 28**2) < 1.0
        patches = patch1 | patch2

        if mode in ("s2_after", "change_overlay"):
            # Exposed bare soil (bright tan/ochre)
            r[patches] = 0.78
            g[patches] = 0.63
            b[patches] = 0.44
        if mode == "change_overlay":
            r[patches] = 0.96
            g[patches] = 0.48
            b[patches] = 0.12
        rgb = np.stack([r, g, b], axis=-1)

    img = Image.fromarray((np.clip(rgb, 0.0, 1.0) * 255).astype(np.uint8))
    draw = ImageDraw.Draw(img)
    label = {
        "s1_before": "S1 RTC (dB) | BEFORE | SAMPLE",
        "s1_after": "S1 RTC (dB) | AFTER | SAMPLE",
        "flood_overlay": "U-Net Flood Mask (Unvalidated) | SAMPLE",
        "s2_before": "Sentinel-2 L2A | BEFORE | SAMPLE",
        "s2_after": "Sentinel-2 L2A | AFTER | SAMPLE",
        "change_overlay": "NDVI Drop + BSI Overlay | SAMPLE",
    }[mode]
    draw.rectangle([10, 10, 325, 34], fill=(11, 18, 32))
    draw.text((18, 16), label, fill=(226, 232, 240))
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG")


def generate() -> None:
    data_dir = config.DATA_DIR
    images_dir = config.IMAGES_DIR
    data_dir.mkdir(parents=True, exist_ok=True)
    images_dir.mkdir(parents=True, exist_ok=True)

    # 1. Previews
    for name in ("s1_before", "s1_after", "flood_overlay", "s2_before", "s2_after", "change_overlay"):
        _generate_preview_png(images_dir / f"{name}.png", name)

    # 2. Training log (22 epochs realistic Sen1Floods11 U-Net ResNet-34 curve)
    training_log = []
    for ep in range(1, 23):
        t_loss = round(0.58 * math.exp(-0.14 * ep) + 0.12, 4)
        v_loss = round(0.56 * math.exp(-0.12 * ep) + 0.15 + 0.012 * math.sin(ep), 4)
        v_iou = round(min(0.692, 0.34 + 0.35 * (1 - math.exp(-0.19 * ep)) + 0.008 * math.cos(ep)), 4)
        v_f1 = round(min(0.818, (2 * v_iou) / (1 + v_iou)), 4)
        lr = round(3e-4 * 0.5 * (1 + math.cos(math.pi * ep / 30)), 7)
        training_log.append(
            {
                "epoch": ep,
                "train_loss": t_loss,
                "val_loss": v_loss,
                "val_iou": v_iou,
                "val_f1": v_f1,
                "lr": lr,
            }
        )
    (data_dir / "training_log.json").write_text(json.dumps(training_log, indent=2), encoding="utf-8")

    # 3. Model card
    model_card = {
        "model_name": "U-Net (ResNet-34, SMP)",
        "encoder": "resnet34",
        "in_channels": ["VV (dB)", "VH (dB)"],
        "normalization": {"mean": [-11.82, -18.47], "std": [4.61, 5.18]},
        "dataset": "Sen1Floods11 hand-labeled",
        "citation": (
            "Bonafilia, D., Tellman, B., Anderson, T., & Issenberg, E. (2020). "
            "Sen1Floods11: A Georeferenced Dataset to Train and Test Deep Learning Flood Algorithms "
            "for Sentinel-1. IEEE/CVF CVPR Workshops, pp. 210-211."
        ),
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "split_sizes": {"train": 252, "val": 89, "test": 90, "bolivia": 15},
        "metrics": {
            "val": {"iou": 0.692, "f1": 0.818, "precision": 0.841, "recall": 0.796, "confusion_matrix": [[20145210, 412300], [568400, 2212100]]},
            "test": {"iou": 0.671, "f1": 0.803, "precision": 0.824, "recall": 0.783, "confusion_matrix": [[20412000, 468900], [612300, 2204800]]},
            "bolivia": {"iou": 0.614, "f1": 0.761, "precision": 0.792, "recall": 0.732, "confusion_matrix": [[3310400, 88200], [124100, 339200]]},
        },
        "baseline_metrics": {
            "method": "Fixed VH backscatter threshold (tuned on validation split only)",
            "best_vh_threshold_db": -16.5,
            "val": {"iou": 0.482, "f1": 0.650, "precision": 0.618, "recall": 0.686},
            "test": {"iou": 0.461, "f1": 0.631, "precision": 0.594, "recall": 0.673},
            "bolivia": {"iou": 0.412, "f1": 0.584, "precision": 0.548, "recall": 0.625},
        },
        "limitations": [
            "Domain shift: trained on global Sen1Floods11 flood events and applied unvalidated to Bengaluru/Karnataka terrain.",
            "SAR speckle noise in single-date GRD/RTC imagery can cause isolated false positives without multi-temporal filtering.",
            "Urban radar layover, foreshortening, and building shadow in dense Bengaluru wards can mimic open-water backscatter.",
            "Flooded vegetation and paddy fields produce double-bounce backscatter rather than specular dark returns.",
        ],
        "karnataka_validation_note": "Karnataka inference outputs have NO ground-truth flood labels and are marked 'Model prediction (unvalidated)'.",
    }
    (data_dir / "model_card.json").write_text(json.dumps(model_card, indent=2), encoding="utf-8")

    # 4. Scenes catalog (Planetary Computer sentinel-1-rtc style metadata)
    scenes = [
        {"id": "S1A_IW_GRDH_1SDV_20260314T003412_RTC", "datetime": "2026-03-14T00:34:12Z", "orbit_direction": "descending", "relative_orbit": 63, "polarizations": ["VV", "VH"], "selected_role": "before"},
        {"id": "S1A_IW_GRDH_1SDV_20260326T003413_RTC", "datetime": "2026-03-26T00:34:13Z", "orbit_direction": "descending", "relative_orbit": 63, "polarizations": ["VV", "VH"], "selected_role": None},
        {"id": "S1A_IW_GRDH_1SDV_20261004T123819_RTC", "datetime": "2026-10-04T12:38:19Z", "orbit_direction": "ascending", "relative_orbit": 114, "polarizations": ["VV", "VH"], "selected_role": None},
        {"id": "S1A_IW_GRDH_1SDV_20261016T003418_RTC", "datetime": "2026-10-16T00:34:18Z", "orbit_direction": "descending", "relative_orbit": 63, "polarizations": ["VV", "VH"], "selected_role": None},
        {"id": "S1A_IW_GRDH_1SDV_20261028T003419_RTC", "datetime": "2026-10-28T00:34:19Z", "orbit_direction": "descending", "relative_orbit": 63, "polarizations": ["VV", "VH"], "selected_role": None},
        {"id": "S1A_IW_GRDH_1SDV_20261102T123821_RTC", "datetime": "2026-11-02T12:38:21Z", "orbit_direction": "ascending", "relative_orbit": 114, "polarizations": ["VV", "VH"], "selected_role": None},
        {"id": "S1A_IW_GRDH_1SDV_20261109T003420_RTC", "datetime": "2026-11-09T00:34:20Z", "orbit_direction": "descending", "relative_orbit": 63, "polarizations": ["VV", "VH"], "selected_role": None},
        {"id": "S1A_IW_GRDH_1SDV_20261114T123822_RTC", "datetime": "2026-11-14T12:38:22Z", "orbit_direction": "ascending", "relative_orbit": 114, "polarizations": ["VV", "VH"], "selected_role": None},
        {"id": "S1A_IW_GRDH_1SDV_20261121T003421_RTC", "datetime": "2026-11-21T00:34:21Z", "orbit_direction": "descending", "relative_orbit": 63, "polarizations": ["VV", "VH"], "selected_role": "after"},
        {"id": "S1A_IW_GRDH_1SDV_20261124T123823_RTC", "datetime": "2026-11-24T12:38:23Z", "orbit_direction": "ascending", "relative_orbit": 114, "polarizations": ["VV", "VH"], "selected_role": None},
    ]
    (data_dir / "scenes.json").write_text(json.dumps(scenes, indent=2), encoding="utf-8")

    # 5. GeoJSON layers
    aoi_geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"name": "Bengaluru Urban & Peri-Urban Catchment"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[77.35, 12.75], [77.85, 12.75], [77.85, 13.20], [77.35, 13.20], [77.35, 12.75]]],
                },
            }
        ],
    }
    (data_dir / "aoi.geojson").write_text(json.dumps(aoi_geojson, indent=2), encoding="utf-8")

    flood_zones = [
        ("FL-01", "Bellandur–Varthur Overflow Basin", 77.678, 12.936, 0.024, 0.015, 486.4, 0.89),
        ("FL-02", "Vrishabhavathi Valley Floodplain", 77.495, 12.912, 0.019, 0.013, 342.1, 0.85),
        ("FL-03", "Hebbal–Nagavara Tank Spillway", 77.598, 13.045, 0.016, 0.011, 248.7, 0.82),
        ("FL-04", "Anekal–Chandapura Lowland Cropland", 77.705, 12.792, 0.021, 0.012, 315.8, 0.84),
        ("FL-05", "Yelahanka Puttenahalli Catchment", 77.575, 13.105, 0.014, 0.010, 198.2, 0.79),
        ("FL-06", "Kengeri–Byramangala Feeder Channel", 77.448, 12.878, 0.017, 0.011, 253.0, 0.81),
    ]
    flood_features = []
    for idx, (fid, zone, lon, lat, rx, ry, area_ha, conf) in enumerate(flood_zones):
        flood_features.append(
            {
                "type": "Feature",
                "properties": {
                    "id": fid,
                    "zone": zone,
                    "area_ha": area_ha,
                    "mean_confidence": conf,
                    "validated": False,
                    "label": "Model prediction (unvalidated)",
                },
                "geometry": {"type": "Polygon", "coordinates": [_polygon_ring(lon, lat, rx, ry, points=14, seed=100 + idx)]},
            }
        )
    (data_dir / "flood_extent.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": flood_features}, indent=2), encoding="utf-8"
    )

    infra_items = [
        {"type": "hospital", "name": "Sakra World Hospital (Bellandur Corridor)", "lat": 12.9278, "lon": 77.6812},
        {"type": "substation", "name": "BESCOM 220kV Hebbal Substation", "lat": 13.0424, "lon": 77.5942},
        {"type": "bridge", "name": "Outer Ring Road Bellandur Culvert Bridge", "lat": 12.9345, "lon": 77.6749},
        {"type": "substation", "name": "KPTCL 66kV Kengeri Receiving Station", "lat": 12.9054, "lon": 77.4841},
        {"type": "hospital", "name": "Rajarajeshwari Medical Centre (Mysore Rd)", "lat": 12.8981, "lon": 77.4622},
        {"type": "bridge", "name": "Varthur Kodi Spillway Crossing", "lat": 12.9412, "lon": 77.7420},
    ]
    asset_features = []
    for item in infra_items:
        asset_features.append(
            {
                "type": "Feature",
                "properties": {"layer_type": "infrastructure", **item},
                "geometry": {"type": "Point", "coordinates": [item["lon"], item["lat"]]},
            }
        )
    # Permanent water (JRC GSW exclusion reference)
    for idx, (name, lon, lat, rx, ry) in enumerate([
        ("Bellandur Lake (JRC Permanent Water)", 77.668, 12.937, 0.011, 0.006),
        ("Varthur Lake (JRC Permanent Water)", 77.738, 12.942, 0.009, 0.005),
        ("Hebbal Lake (JRC Permanent Water)", 77.586, 13.047, 0.007, 0.004),
    ]):
        asset_features.append(
            {
                "type": "Feature",
                "properties": {"layer_type": "permanent_water", "name": name},
                "geometry": {"type": "Polygon", "coordinates": [_polygon_ring(lon, lat, rx, ry, points=10, seed=200 + idx)]},
            }
        )
    # Affected road corridors & built-up clusters
    road_segments = [
        ("Outer Ring Road — Bellandur Stretch", [[77.662, 12.926], [77.675, 12.933], [77.689, 12.941]]),
        ("Mysore Road — Kengeri Lowland", [[77.465, 12.891], [77.484, 12.905], [77.503, 12.917]]),
        ("Bellary Road — Hebbal Flyover Approach", [[77.589, 13.034], [77.594, 13.044], [77.598, 13.056]]),
        ("Anekal–Chandapura Link Road", [[77.694, 12.785], [77.706, 12.794], [77.717, 12.804]]),
    ]
    for name, coords in road_segments:
        asset_features.append(
            {
                "type": "Feature",
                "properties": {"layer_type": "road", "name": name},
                "geometry": {"type": "LineString", "coordinates": coords},
            }
        )
    for idx, (name, lon, lat) in enumerate([
        ("Yemalur Low-Lying Residential Cluster", 77.682, 12.945),
        ("Panathur Railway Underpass Block", 77.702, 12.933),
        ("Nayandahalli Industrial Estate", 77.523, 12.941),
        ("Manyata South Perimeter Ward", 77.619, 13.044),
    ]):
        asset_features.append(
            {
                "type": "Feature",
                "properties": {"layer_type": "building", "name": name},
                "geometry": {"type": "Polygon", "coordinates": [_polygon_ring(lon, lat, 0.004, 0.003, points=6, seed=300 + idx)]},
            }
        )
    (data_dir / "assets.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": asset_features}, indent=2), encoding="utf-8"
    )

    change_polys = [
        {"id": "CHG-001", "lon": 77.556, "lat": 13.112, "rx": 0.0038, "ry": 0.0029, "area_ha": 14.2, "ndvi_drop": 0.34, "confidence": 0.91, "near_river": True},
        {"id": "CHG-002", "lon": 77.614, "lat": 13.089, "rx": 0.0031, "ry": 0.0024, "area_ha": 9.8, "ndvi_drop": 0.29, "confidence": 0.86, "near_river": True},
        {"id": "CHG-003", "lon": 77.532, "lat": 13.068, "rx": 0.0027, "ry": 0.0021, "area_ha": 7.4, "ndvi_drop": 0.26, "confidence": 0.81, "near_river": False},
        {"id": "CHG-004", "lon": 77.638, "lat": 13.124, "rx": 0.0024, "ry": 0.0019, "area_ha": 5.9, "ndvi_drop": 0.25, "confidence": 0.77, "near_river": True},
        {"id": "CHG-005", "lon": 77.584, "lat": 13.055, "rx": 0.0019, "ry": 0.0016, "area_ha": 4.1, "ndvi_drop": 0.23, "confidence": 0.69, "near_river": False},
    ]
    change_features = []
    change_list = []
    status_txt = "Potential suspicious activity: requires official verification"
    for idx, cp in enumerate(change_polys):
        props = {
            "id": cp["id"],
            "area_ha": cp["area_ha"],
            "ndvi_drop": cp["ndvi_drop"],
            "confidence": cp["confidence"],
            "near_river": cp["near_river"],
            "status": status_txt,
            "method": "NDVI drop + bare soil index",
        }
        change_list.append({k: props[k] for k in ("id", "area_ha", "ndvi_drop", "confidence", "near_river", "status")})
        change_features.append(
            {
                "type": "Feature",
                "properties": props,
                "geometry": {"type": "Polygon", "coordinates": [_polygon_ring(cp["lon"], cp["lat"], cp["rx"], cp["ry"], points=9, seed=400 + idx)]},
            }
        )
    (data_dir / "change_polygons.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": change_features}, indent=2), encoding="utf-8"
    )

    # 6. results.json validated against Pydantic schema
    settlements = [
        {"name": "Bellandur–Yemalur Ward", "lat": 12.936, "lon": 77.678, "population_estimate": 18400, "priority": "high"},
        {"name": "Varthur–Panathur Basin", "lat": 12.941, "lon": 77.728, "population_estimate": 14200, "priority": "high"},
        {"name": "Kengeri–Vrishabhavathi Belt", "lat": 12.907, "lon": 77.488, "population_estimate": 11500, "priority": "high"},
        {"name": "Hebbal–Nagavara Lowlands", "lat": 13.044, "lon": 77.596, "population_estimate": 9200, "priority": "medium"},
        {"name": "Chandapura Peri-Urban Cluster", "lat": 12.796, "lon": 77.704, "population_estimate": 6400, "priority": "medium"},
        {"name": "Puttenahalli Tank Fringe", "lat": 13.104, "lon": 77.575, "population_estimate": 4100, "priority": "low"},
    ]

    payload = {
        "sample": True,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": {
            "name": model_card["model_name"],
            "trained_on": model_card["dataset"],
            "metrics": {
                "val": {"iou": 0.692, "f1": 0.818},
                "test": {"iou": 0.671, "f1": 0.803},
                "bolivia": {"iou": 0.614, "f1": 0.761},
            },
            "baseline_metrics": {
                "test": {"iou": 0.461, "f1": 0.631},
                "bolivia": {"iou": 0.412, "f1": 0.584},
            },
        },
        "flood": {
            "aoi_name": "Bengaluru Urban & Peri-Urban Catchment",
            "scene_before": "S1A_IW_GRDH_1SDV_20260314T003412_RTC",
            "scene_after": "S1A_IW_GRDH_1SDV_20261121T003421_RTC",
            "date_before": "2026-03-14",
            "date_after": "2026-11-21",
            "validated": False,
            "flooded_area_ha": 1844.2,
            "cropland_affected_ha": 712.5,
            "built_up_affected_ha": 438.6,
            "roads_affected_km": 46.8,
            "settlements_affected": settlements,
            "critical_infrastructure_affected": infra_items,
        },
        "change": {
            "site_name": "Yelahanka–Hebbal Peri-Urban Corridor",
            "dates": {"before": "2026-01-18", "after": "2026-11-19"},
            "changed_area_ha": round(sum(c["area_ha"] for c in change_list), 2),
            "vegetation_loss_ha": 58.6,
            "bare_soil_increase_ha": 44.3,
            "polygons": change_list,
        },
        "economics": {
            "loss_per_ha_inr": config.ASSUMPTIONS.loss_per_ha_inr,
            "assessment_time_manual_days": config.ASSUMPTIONS.assessment_time_manual_days,
            "assessment_time_geoterra_hours": config.ASSUMPTIONS.assessment_time_geoterra_hours,
        },
        "onboard_sim": {
            "raw_scene_size_mb": config.ASSUMPTIONS.raw_scene_size_mb,
            "insight_packet_size_kb": config.ASSUMPTIONS.insight_packet_size_kb,
            "downlink_rate_mbps": config.ASSUMPTIONS.downlink_rate_mbps,
        },
    }

    validated = ResultsPayload.model_validate(payload)
    (data_dir / "results.json").write_text(validated.model_dump_json(indent=2), encoding="utf-8")
    print(f"Generated sample data successfully in {data_dir} (sample=True).")


if __name__ == "__main__":
    generate()
