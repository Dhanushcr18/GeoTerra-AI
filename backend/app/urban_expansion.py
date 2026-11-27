"""Bengaluru Urban Expansion & Green Cover Loss Prediction using multi-year Sentinel-2 L2A STAC scenes."""

from __future__ import annotations

import json
import math
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
from shapely.geometry import shape
from skimage.morphology import binary_closing, disk, remove_small_objects

from backend.app import config
from backend.app.image_utils import save_sharp_overlay_png, stretch_sentinel_rgb

URBAN_DATA_PATH = config.DATA_DIR / "urban_expansion.json"
URBAN_GEO_PATH = config.DATA_DIR / "urban_expansion.geojson"
URBAN_IMAGES_DIR = config.IMAGES_DIR / "urban"
TARGET_UTM_CRS = "EPSG:32643"

# Four dry-season (Feb-Mar) Sentinel-2 L2A dates on tile 43PGQ so vegetation phenology stays comparable across years
SCENE_TARGETS = [
    {"year": 2019, "id": "S2B_MSIL2A_20190330T050659_R019_T43PGQ_20201007T122704", "date": "2019-03-30"},
    {"year": 2022, "id": "S2B_MSIL2A_20220304T050709_R019_T43PGQ_20220305T000024", "date": "2022-03-04"},
    {"year": 2024, "id": "S2B_MSIL2A_20240313T050649_R019_T43PGQ_20240313T171334", "date": "2024-03-13"},
    {"year": 2026, "id": "S2B_MSIL2A_20260201T050929_R019_T43PGQ_20260201T085208", "date": "2026-02-01"},
]

BENGALURU_MACRO_BBOX = (77.46, 12.82, 77.78, 13.22)
BENGALURU_CORE_LATLON = (12.9716, 77.5946)

# 10 representative Bengaluru wards & peripheral growth corridors inside tile 43PGQ
URBAN_CORRIDORS: List[Dict[str, Any]] = [
    {
        "id": "bellandur_sarjapur",
        "ward_no": 150,
        "name": "Bellandur – Sarjapur Rd",
        "zone": "Mahadevapura / East",
        "lat": 12.9220,
        "lon": 77.6820,
        "half_lon": 0.015,
        "half_lat": 0.013,
        "water_note": "Bellandur–Varthur valley corridor; high stormwater & Cauvery tail-end demand.",
    },
    {
        "id": "varthur_panathur",
        "ward_no": 149,
        "name": "Varthur – Panathur",
        "zone": "East Growth Fringe",
        "lat": 12.9420,
        "lon": 77.7320,
        "half_lon": 0.015,
        "half_lat": 0.013,
        "water_note": "Rapid apartment infill along narrow village roads; acute feeder road & UGD need.",
    },
    {
        "id": "whitefield_mahadevapura",
        "ward_no": 84,
        "name": "Whitefield – Hoodi",
        "zone": "Mahadevapura / East",
        "lat": 12.9780,
        "lon": 77.7380,
        "half_lon": 0.015,
        "half_lat": 0.013,
        "water_note": "IT corridor densification; high stormwater & Metro last-mile feeder demand.",
    },
    {
        "id": "thanisandra_nagavara",
        "ward_no": 6,
        "name": "Thanisandra – Nagavara",
        "zone": "North / Yelahanka",
        "lat": 13.0580,
        "lon": 77.6320,
        "half_lon": 0.015,
        "half_lat": 0.013,
        "water_note": "High-rise housing belt; groundwater stress & Hebbal valley drain bottleneck.",
    },
    {
        "id": "yelahanka_kogilu",
        "ward_no": 4,
        "name": "Yelahanka – Kogilu",
        "zone": "North Growth Fringe",
        "lat": 13.1050,
        "lon": 77.6060,
        "half_lon": 0.015,
        "half_lat": 0.013,
        "water_note": "Peri-urban residential expansion near airport road; needs trunk drainage.",
    },
    {
        "id": "devanahalli_kiadb",
        "ward_no": 0,
        "name": "Devanahalli – Aerospace Park",
        "zone": "North Airport Corridor",
        "lat": 13.1950,
        "lon": 77.6900,
        "half_lon": 0.016,
        "half_lat": 0.014,
        "water_note": "Greenfield logistics/industrial conversion; early piped-water & transit planning critical.",
    },
    {
        "id": "electronic_city",
        "ward_no": 192,
        "name": "Electronic City – Bommasandra",
        "zone": "South-East Fringe",
        "lat": 12.8380,
        "lon": 77.6740,
        "half_lon": 0.015,
        "half_lat": 0.013,
        "water_note": "Tech/industrial belt; high tanker dependency & arterial junction congestion.",
    },
    {
        "id": "kengeri_mysore_rd",
        "ward_no": 159,
        "name": "Kengeri – Mysore Rd",
        "zone": "South-West Fringe",
        "lat": 12.9050,
        "lon": 77.4840,
        "half_lon": 0.015,
        "half_lat": 0.013,
        "water_note": "Metro-induced suburban infill along Vrishabhavathi valley; sanitation & feeder roads.",
    },
    {
        "id": "hsr_bommanahalli",
        "ward_no": 175,
        "name": "HSR – Bommanahalli",
        "zone": "Bommanahalli / South-East",
        "lat": 12.9040,
        "lon": 77.6380,
        "half_lon": 0.014,
        "half_lat": 0.012,
        "water_note": "Dense commercial-residential infill; urban heat & local drainage capacity upgrades.",
    },
    {
        "id": "jayanagar_baseline",
        "ward_no": 168,
        "name": "Jayanagar – Basavanagudi",
        "zone": "South Core Baseline",
        "lat": 12.9300,
        "lon": 77.5830,
        "half_lon": 0.014,
        "half_lat": 0.012,
        "water_note": "Mature planned core baseline with established canopy & gridded drainage.",
    },
]

PREDICTION_DISCLAIMER = (
    "Future projections are estimates extrapolated from 2019–2026 Sentinel-2 trends and remaining open land, "
    "not guaranteed urban development outcomes."
)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return r * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _read_s2_window(
    item: Any,
    bbox: Tuple[float, float, float, float],
    target_shape: Optional[Tuple[int, int]] = None,
) -> Dict[str, Any]:
    """Read Sentinel-2 L2A bands (B02, B03, B04, B08, B11, SCL) and compute spectral indices."""
    with rasterio.open(item.assets["B04"].href) as src_ref:
        left, bottom, right, top = transform_bounds("EPSG:4326", src_ref.crs, *bbox)
        win = from_bounds(left, bottom, right, top, src_ref.transform).round_offsets().round_lengths()
        if target_shape is not None:
            red = src_ref.read(
                1,
                window=win,
                out_shape=target_shape,
                boundless=True,
                fill_value=0,
                resampling=rasterio.enums.Resampling.bilinear,
            ).astype(np.float32) / 10000.0
        else:
            red = src_ref.read(1, window=win, boundless=True, fill_value=0).astype(np.float32) / 10000.0
        win_transform = src_ref.window_transform(win)
        profile = {"crs": src_ref.crs, "transform": win_transform, "height": red.shape[0], "width": red.shape[1]}

    def _band(key: str, resample: rasterio.enums.Resampling = rasterio.enums.Resampling.bilinear) -> np.ndarray:
        with rasterio.open(item.assets[key].href) as s:
            w = from_bounds(left, bottom, right, top, s.transform).round_offsets().round_lengths()
            arr = s.read(1, window=w, out_shape=red.shape, boundless=True, fill_value=0, resampling=resample)
            return arr.astype(np.float32)

    blue = _band("B02") / 10000.0
    green = _band("B03") / 10000.0
    nir = _band("B08") / 10000.0
    swir = _band("B11") / 10000.0
    scl = _band("SCL", resample=rasterio.enums.Resampling.nearest).astype(np.int16)

    valid = ~np.isin(scl, [0, 3, 8, 9, 10])
    ndvi = (nir - red) / np.maximum(nir + red, 1e-4)
    ndbi = (swir - nir) / np.maximum(swir + nir, 1e-4)
    mndwi = (green - swir) / np.maximum(green + swir, 1e-4)
    bsi = ((swir + red) - (nir + blue)) / np.maximum((swir + red) + (nir + blue), 1e-4)

    water = np.logical_and(valid, mndwi > 0.02)
    built = np.logical_and.reduce([valid, ~water, ndbi > -0.02, ndvi < 0.24])
    built = remove_small_objects(binary_closing(built, footprint=disk(1)), min_size=10)

    veg = np.logical_and.reduce([valid, ~water, ndvi > 0.26])
    veg = remove_small_objects(binary_closing(veg, footprint=disk(1)), min_size=10)

    rgb = stretch_sentinel_rgb(red, green, blue)
    return {
        "profile": profile,
        "valid": valid,
        "water": water.astype(np.uint8),
        "built": built.astype(np.uint8),
        "veg": veg.astype(np.uint8),
        "ndvi": ndvi,
        "ndbi": ndbi,
        "bsi": bsi,
        "rgb": rgb,
    }


def _save_urban_png(
    rgb: np.ndarray,
    out_path: Path,
    title: str,
    new_urban_mask: Optional[np.ndarray] = None,
    veg_loss_mask: Optional[np.ndarray] = None,
    constr_mask: Optional[np.ndarray] = None,
) -> None:
    overlays = []
    if veg_loss_mask is not None:
        overlays.append((veg_loss_mask, (0.85, 0.25, 0.72), 0.52))
    if new_urban_mask is not None:
        overlays.append((new_urban_mask, (0.98, 0.55, 0.14), 0.54))
    if constr_mask is not None:
        overlays.append((constr_mask, (0.99, 0.80, 0.16), 0.62))
    save_sharp_overlay_png(rgb, out_path, overlays=overlays, figsize=(8.0, 5.0), dpi=200)


def _polygonize_cluster(
    mask: np.ndarray,
    profile: Dict[str, Any],
    corridor_id: str,
    corridor_name: str,
    layer_kind: str,
    min_ha: float = 0.25,
) -> List[Dict[str, Any]]:
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
    gdf = gdf[gdf["area_ha"] >= min_ha]
    if gdf.empty:
        return feats
    gdf_wgs = gdf.to_crs("EPSG:4326")
    # Limit exported clusters per ward+layer so GeoJSON stays snappy on Leaflet
    gdf_wgs = gdf_wgs.sort_values("area_ha", ascending=False).head(30)
    for _, row in gdf_wgs.iterrows():
        feats.append(
            {
                "type": "Feature",
                "properties": {
                    "corridor_id": corridor_id,
                    "corridor_name": corridor_name,
                    "layer_kind": layer_kind,
                    "area_ha": float(row["area_ha"]),
                },
                "geometry": row.geometry.__geo_interface__,
            }
        )
    return feats


def _open_scene_items() -> List[Dict[str, Any]]:
    catalog = pystac_client.Client.open(
        "https://planetarycomputer.microsoft.com/api/stac/v1",
        modifier=planetary_computer.sign_inplace,
    )
    resolved: List[Dict[str, Any]] = []
    for spec in SCENE_TARGETS:
        items = list(catalog.search(collections=["sentinel-2-l2a"], ids=[spec["id"]]).items())
        if not items:
            raise RuntimeError(f"Could not locate Sentinel-2 scene {spec['id']}")
        resolved.append({**spec, "item": items[0]})
    return resolved


def build_or_load_urban_base(force_refresh: bool = False) -> Dict[str, Any]:
    """Compute (or load cached) multi-year 2019-2026 Bengaluru urban expansion & veg-loss telemetry."""
    if not force_refresh and URBAN_DATA_PATH.exists() and URBAN_GEO_PATH.exists():
        return json.loads(URBAN_DATA_PATH.read_text(encoding="utf-8"))

    scenes = _open_scene_items()
    URBAN_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Citywide before/after overview PNGs (fast COG overview read across Greater Bengaluru)
    macro_before = _read_s2_window(scenes[0]["item"], BENGALURU_MACRO_BBOX, target_shape=(760, 620))
    macro_after = _read_s2_window(scenes[-1]["item"], BENGALURU_MACRO_BBOX, target_shape=(760, 620))
    macro_new_urban = np.logical_and.reduce(
        [
            macro_before["valid"],
            macro_after["valid"],
            macro_after["built"] > 0,
            macro_before["built"] == 0,
            macro_before["water"] == 0,
        ]
    ).astype(np.uint8)
    macro_veg_loss = np.logical_and.reduce(
        [
            macro_before["valid"],
            macro_after["valid"],
            macro_before["veg"] > 0,
            macro_after["veg"] == 0,
            (macro_before["ndvi"] - macro_after["ndvi"]) > 0.10,
        ]
    ).astype(np.uint8)
    _save_urban_png(macro_before["rgb"], URBAN_IMAGES_DIR / "city_2019.png", f"Bengaluru Sentinel-2 ({scenes[0]['date']})")
    _save_urban_png(macro_after["rgb"], URBAN_IMAGES_DIR / "city_2026.png", f"Bengaluru Sentinel-2 ({scenes[-1]['date']})")
    _save_urban_png(
        macro_after["rgb"],
        URBAN_IMAGES_DIR / "city_change.png",
        f"Citywide Urban Growth & Veg Loss ({scenes[0]['year']}->{scenes[-1]['year']})",
        new_urban_mask=macro_new_urban,
        veg_loss_mask=macro_veg_loss,
    )

    corridors_out: List[Dict[str, Any]] = []
    geo_features: List[Dict[str, Any]] = []

    for c in URBAN_CORRIDORS:
        bbox = (
            c["lon"] - c["half_lon"],
            c["lat"] - c["half_lat"],
            c["lon"] + c["half_lon"],
            c["lat"] + c["half_lat"],
        )
        # First read target shape from 2019 scene so every year aligns pixel-for-pixel
        first_win = _read_s2_window(scenes[0]["item"], bbox)
        t_shape = (first_win["built"].shape[0], first_win["built"].shape[1])
        wins = [first_win] + [_read_s2_window(sc["item"], bbox, target_shape=t_shape) for sc in scenes[1:]]

        # 10m Sentinel-2 pixels in UTM Zone 43N -> 0.01 ha per pixel
        px_ha = 0.01
        total_land_ha = round(float(np.sum(wins[0]["water"] == 0)) * px_ha, 2)

        series = []
        for sc, w in zip(scenes, wins):
            built_ha = round(float(np.sum(w["built"])) * px_ha, 2)
            veg_ha = round(float(np.sum(w["veg"])) * px_ha, 2)
            series.append({"year": sc["year"], "date": sc["date"], "built_ha": built_ha, "veg_ha": veg_ha})

        w19, w24, w26 = wins[0], wins[2], wins[3]
        common_valid = np.logical_and(w19["valid"], w26["valid"])

        new_urban_mask = np.logical_and.reduce(
            [common_valid, w26["built"] > 0, w19["built"] == 0, w19["water"] == 0]
        )
        new_urban_mask = remove_small_objects(new_urban_mask, min_size=12).astype(np.uint8)

        # Active bare-soil / newly cleared construction sites (exclude pre-2019 stable buildings)
        constr_mask = np.logical_and.reduce(
            [
                common_valid,
                w26["water"] == 0,
                w19["built"] == 0,
                w26["ndvi"] < 0.16,
                w26["bsi"] > 0.07,
                (w26["bsi"] - w19["bsi"]) > 0.05,
                np.logical_or((w26["bsi"] - w24["bsi"]) > 0.03, (w26["ndbi"] - w24["ndbi"]) > 0.04),
            ]
        )
        constr_mask = remove_small_objects(constr_mask, min_size=10).astype(np.uint8)

        veg_loss_mask = np.logical_and.reduce(
            [common_valid, w19["veg"] > 0, w26["veg"] == 0, (w19["ndvi"] - w26["ndvi"]) > 0.09]
        )
        veg_loss_mask = remove_small_objects(veg_loss_mask, min_size=12).astype(np.uint8)

        new_urban_ha = round(float(np.sum(new_urban_mask)) * px_ha, 2)
        constr_ha = round(float(np.sum(constr_mask)) * px_ha, 2)
        veg_loss_ha = round(float(np.sum(veg_loss_mask)) * px_ha, 2)

        built_2019 = series[0]["built_ha"]
        built_2026 = series[-1]["built_ha"]
        veg_2019 = series[0]["veg_ha"]
        veg_2026 = series[-1]["veg_ha"]

        years_span = 6.84  # 2019-03-30 to 2026-02-01
        net_urban_gain = max(0.0, round(built_2026 - built_2019, 2))
        annual_growth_ha = round(max(new_urban_ha, net_urban_gain) / years_span, 2)
        growth_rate_pct = round(((built_2026 - built_2019) / max(built_2019, 10.0)) * 100.0, 1)
        veg_change_pct = round(((veg_2026 - veg_2019) / max(veg_2019, 10.0)) * 100.0, 1)
        remaining_developable_ha = round(max(0.0, total_land_ha * 0.90 - built_2026), 2)
        dist_core_km = round(_haversine_km(c["lat"], c["lon"], *BENGALURU_CORE_LATLON), 2)

        # Save per-corridor multi-year RGB comparison chips (2019, 2022, 2024, 2026 + change overlay)
        _save_urban_png(w19["rgb"], URBAN_IMAGES_DIR / f"{c['id']}_2019.png", f"{c['name']} ({scenes[0]['date']})")
        _save_urban_png(wins[1]["rgb"], URBAN_IMAGES_DIR / f"{c['id']}_2022.png", f"{c['name']} ({scenes[1]['date']})")
        _save_urban_png(w24["rgb"], URBAN_IMAGES_DIR / f"{c['id']}_2024.png", f"{c['name']} ({scenes[2]['date']})")
        _save_urban_png(w26["rgb"], URBAN_IMAGES_DIR / f"{c['id']}_2026.png", f"{c['name']} ({scenes[-1]['date']})")
        _save_urban_png(
            w26["rgb"],
            URBAN_IMAGES_DIR / f"{c['id']}_change.png",
            f"{c['name']} Growth & Veg Loss (2019–2026)",
            new_urban_mask=new_urban_mask,
            veg_loss_mask=veg_loss_mask,
            constr_mask=constr_mask,
        )

        # Export polygonized vector overlays for Leaflet map
        geo_features.extend(_polygonize_cluster(new_urban_mask, w26["profile"], c["id"], c["name"], "new_urban", min_ha=0.35))
        geo_features.extend(_polygonize_cluster(constr_mask, w26["profile"], c["id"], c["name"], "construction", min_ha=0.30))
        geo_features.extend(_polygonize_cluster(veg_loss_mask, w26["profile"], c["id"], c["name"], "veg_loss", min_ha=0.35))

        corridors_out.append(
            {
                "id": c["id"],
                "ward_no": c["ward_no"],
                "name": c["name"],
                "zone": c["zone"],
                "lat": c["lat"],
                "lon": c["lon"],
                "dist_core_km": dist_core_km,
                "window_land_ha": total_land_ha,
                "built_2019_ha": built_2019,
                "built_2026_ha": built_2026,
                "new_urban_ha": new_urban_ha,
                "active_construction_ha": constr_ha,
                "veg_2019_ha": veg_2019,
                "veg_2026_ha": veg_2026,
                "veg_loss_ha": veg_loss_ha,
                "veg_change_pct": veg_change_pct,
                "annual_growth_ha": annual_growth_ha,
                "growth_rate_pct": growth_rate_pct,
                "remaining_developable_ha": remaining_developable_ha,
                "water_note": c["water_note"],
                "history": series,
                "images": {
                    "before": f"/api/images/urban/{c['id']}_2019.png",
                    "y2022": f"/api/images/urban/{c['id']}_2022.png",
                    "y2024": f"/api/images/urban/{c['id']}_2024.png",
                    "after": f"/api/images/urban/{c['id']}_2026.png",
                    "overlay": f"/api/images/urban/{c['id']}_change.png",
                },
            }
        )

    geojson = {"type": "FeatureCollection", "features": geo_features}
    URBAN_GEO_PATH.write_text(json.dumps(geojson), encoding="utf-8")

    base_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scenes": [{"year": s["year"], "id": s["id"], "date": s["date"]} for s in SCENE_TARGETS],
        "source": "Sentinel-2 L2A (Microsoft Planetary Computer STAC, dry-season Feb-Mar, SCL cloud-masked)",
        "city_images": {
            "before": "/api/images/urban/city_2019.png",
            "after": "/api/images/urban/city_2026.png",
            "overlay": "/api/images/urban/city_change.png",
        },
        "corridors": corridors_out,
    }
    URBAN_DATA_PATH.write_text(json.dumps(base_payload, indent=2), encoding="utf-8")
    return base_payload


def evaluate_urban_horizon(horizon_years: int = 5, force_refresh: bool = False) -> Dict[str, Any]:
    """Combine measured 2019-2026 Sentinel-2 growth with capacity-constrained future expansion estimates."""
    horizon = max(1, min(10, int(horizon_years)))
    target_year = 2026 + horizon

    base = build_or_load_urban_base(force_refresh=force_refresh)
    geojson = json.loads(URBAN_GEO_PATH.read_text(encoding="utf-8")) if URBAN_GEO_PATH.exists() else {"type": "FeatureCollection", "features": []}

    enriched: List[Dict[str, Any]] = []
    for item in base["corridors"]:
        rem = float(item["remaining_developable_ha"])
        annual = float(item["annual_growth_ha"])
        constr = float(item["active_construction_ha"])

        # Damped growth estimate: historical slope + active construction momentum, capped by available land
        momentum_ha = annual + constr * 0.12
        projected_added_ha = round(rem * (1.0 - math.exp(-(momentum_ha * horizon) / max(rem, 15.0))), 2)
        projected_built_ha = round(float(item["built_2026_ha"]) + projected_added_ha, 2)
        projected_veg_loss_ha = round(min(float(item["veg_2026_ha"]), projected_added_ha * 0.58), 2)
        projected_veg_ha = round(max(0.0, float(item["veg_2026_ha"]) - projected_veg_loss_ha), 2)

        # Growth pressure score (0-100) from measured new urban infill, veg decline, projected infill & suburban belt growth
        pressure = min(
            96.0,
            max(
                16.0,
                round(
                    (float(item["new_urban_ha"]) * 0.17)
                    + (float(item["veg_loss_ha"]) * 0.10)
                    + (projected_added_ha * 0.16)
                    + max(0.0, float(item["dist_core_km"]) - 5.5) * 1.2,
                    1,
                ),
            ),
        )
        growth_tier = "Fast-Growing Hotspot" if pressure >= 62.0 else "Moderate Expansion" if pressure >= 42.0 else "Stable Core"

        # Deterministic infrastructure priority needs driven by measured metrics
        infra_needs: List[str] = []
        if item["new_urban_ha"] >= 55 or constr >= 25 or item["dist_core_km"] >= 10:
            infra_needs.append("Arterial Roads & Metro Feeder Transit")
        if item["veg_loss_ha"] >= 45 or item["new_urban_ha"] >= 60:
            infra_needs.append("Stormwater Drainage & Permeable Buffers")
        if projected_added_ha >= 35 or item["dist_core_km"] >= 9:
            infra_needs.append("Piped Water Supply & UGD Sewage")
        if item["veg_change_pct"] <= -12.0:
            infra_needs.append("Urban Canopy & Greenbelt Restoration")
        if not infra_needs:
            infra_needs.append("Routine Drain & Greenbelt Maintenance")

        enriched.append(
            {
                **item,
                "target_year": target_year,
                "projected_added_ha": projected_added_ha,
                "projected_built_ha": projected_built_ha,
                "projected_veg_ha": projected_veg_ha,
                "projected_veg_loss_ha": projected_veg_loss_ha,
                "growth_pressure_score": pressure,
                "growth_tier": growth_tier,
                "infrastructure_needs": infra_needs,
                "prediction_label": "Estimated projection (not guaranteed)",
            }
        )

    enriched.sort(key=lambda x: x["growth_pressure_score"], reverse=True)

    summary = {
        "total_corridors": len(enriched),
        "measured_new_urban_ha": round(sum(c["new_urban_ha"] for c in enriched), 2),
        "measured_active_construction_ha": round(sum(c["active_construction_ha"] for c in enriched), 2),
        "measured_veg_loss_ha": round(sum(c["veg_loss_ha"] for c in enriched), 2),
        "projected_additional_urban_ha": round(sum(c["projected_added_ha"] for c in enriched), 2),
        "fast_growing_count": sum(1 for c in enriched if c["growth_tier"] == "Fast-Growing Hotspot"),
        "infra_priority_count": sum(1 for c in enriched if len(c["infrastructure_needs"]) >= 2),
        "horizon_years": horizon,
        "target_year": target_year,
    }

    return {
        "generated_at": base["generated_at"],
        "scenes": base["scenes"],
        "source": base["source"],
        "city_images": base["city_images"],
        "prediction_notice": PREDICTION_DISCLAIMER,
        "summary": summary,
        "corridors": enriched,
        "geojson": geojson,
    }
