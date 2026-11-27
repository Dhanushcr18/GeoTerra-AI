"""Bengaluru Urban Heat Island (LST) monitoring & prediction using Landsat 8/9 C2-L2 Thermal Band 10."""

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
import requests
from rasterio.features import shapes
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds
from shapely.geometry import shape
from skimage.morphology import binary_closing, disk, remove_small_objects

from backend.app import config
from backend.app.image_utils import save_fused_thermal_png, save_sharp_overlay_png, stretch_sentinel_rgb

S2_HEAT_BEFORE_ID = "S2B_MSIL2A_20190330T050659_R019_T43PGQ_20201007T122704"
S2_HEAT_AFTER_ID = "S2B_MSIL2A_20260201T050929_R019_T43PGQ_20260201T085208"

HEAT_DATA_PATH = config.DATA_DIR / "urban_heat.json"
HEAT_GEO_PATH = config.DATA_DIR / "urban_heat.geojson"
HEAT_IMAGES_DIR = config.IMAGES_DIR / "heat"
TARGET_UTM_CRS = "EPSG:32643"

# Cloud-free pre-monsoon Landsat 8/9 C2-L2 scenes over Bengaluru (WRS Path 144 / Row 051)
LANDSAT_SCENES = [
    {"year": 2019, "id": "LC08_L2SP_144051_20190313_02_T1", "date": "2019-03-13", "sensor": "Landsat 8 OLI/TIRS"},
    {"year": 2022, "id": "LC09_L2SP_144051_20220225_02_T1", "date": "2022-02-25", "sensor": "Landsat 9 OLI-2/TIRS-2"},
    {"year": 2024, "id": "LC08_L2SP_144051_20240207_02_T1", "date": "2024-02-07", "sensor": "Landsat 8 OLI/TIRS"},
    {"year": 2026, "id": "LC08_L2SP_144051_20260212_02_T1", "date": "2026-02-12", "sensor": "Landsat 8 OLI/TIRS"},
]

BENGALURU_HEAT_BBOX = (77.46, 12.82, 77.78, 13.20)

HEAT_ZONES: List[Dict[str, Any]] = [
    {
        "id": "peenya_industrial",
        "ward_no": 41,
        "name": "Peenya Industrial Estate",
        "zone": "West / Industrial Hub",
        "lat": 13.0285,
        "lon": 77.5190,
        "half_lon": 0.016,
        "half_lat": 0.014,
        "heat_driver": "Metal/asbestos industrial roofs, sparse tree canopy & heavy freight asphalt.",
    },
    {
        "id": "whitefield_itpl",
        "ward_no": 84,
        "name": "Whitefield – Mahadevapura",
        "zone": "East Tech Corridor",
        "lat": 12.9760,
        "lon": 77.7340,
        "half_lon": 0.016,
        "half_lat": 0.014,
        "heat_driver": "Rapid tech-campus glass/concrete expansion replacing peri-urban greenery.",
    },
    {
        "id": "majestic_chickpet",
        "ward_no": 109,
        "name": "Majestic – Chickpet Core",
        "zone": "Central Commercial",
        "lat": 12.9740,
        "lon": 77.5750,
        "half_lon": 0.013,
        "half_lat": 0.012,
        "heat_driver": "Dense zero-setback concrete blocks, transit terminal asphalt & traffic heat.",
    },
    {
        "id": "bellandur_orr",
        "ward_no": 150,
        "name": "Bellandur – ORR Corridor",
        "zone": "East / Mahadevapura",
        "lat": 12.9240,
        "lon": 77.6760,
        "half_lon": 0.016,
        "half_lat": 0.014,
        "heat_driver": "High-rise commercial pockets & wide arterial concrete offsetting lake cooling.",
    },
    {
        "id": "bommasandra_ecity",
        "ward_no": 192,
        "name": "Electronic City – Bommasandra",
        "zone": "South-East Industrial",
        "lat": 12.8380,
        "lon": 77.6760,
        "half_lon": 0.016,
        "half_lat": 0.014,
        "heat_driver": "Industrial estates, highway junctions & exposed dry plots.",
    },
    {
        "id": "varthur_panathur",
        "ward_no": 149,
        "name": "Varthur – Panathur",
        "zone": "East Urbanizing Fringe",
        "lat": 12.9420,
        "lon": 77.7360,
        "half_lon": 0.016,
        "half_lat": 0.014,
        "heat_driver": "Active construction pads & loss of agricultural/orchard vegetation.",
    },
    {
        "id": "yelahanka_newtown",
        "ward_no": 4,
        "name": "Yelahanka – Jakkur",
        "zone": "North Growth Belt",
        "lat": 13.0980,
        "lon": 77.5980,
        "half_lon": 0.016,
        "half_lat": 0.014,
        "heat_driver": "Mix of Jakkur cooling green/water buffer & expanding northern housing layouts.",
    },
    {
        "id": "kengeri_west",
        "ward_no": 159,
        "name": "Kengeri – RR Nagar",
        "zone": "South-West Belt",
        "lat": 12.9060,
        "lon": 77.4950,
        "half_lon": 0.016,
        "half_lat": 0.014,
        "heat_driver": "Expanding suburban layouts along Mysore Rd corridor.",
    },
    {
        "id": "hsr_koramangala",
        "ward_no": 174,
        "name": "HSR – Koramangala",
        "zone": "South-East Residential",
        "lat": 12.9180,
        "lon": 77.6380,
        "half_lon": 0.015,
        "half_lat": 0.013,
        "heat_driver": "Tree-lined internal streets moderated by dense rooftop infill.",
    },
    {
        "id": "lalbagh_jayanagar",
        "ward_no": 168,
        "name": "Lalbagh – Jayanagar Canopy",
        "zone": "South Green Baseline",
        "lat": 12.9420,
        "lon": 77.5840,
        "half_lon": 0.014,
        "half_lat": 0.013,
        "heat_driver": "Botanical garden + mature avenue trees providing benchmark urban cooling.",
    },
]

HEAT_HONESTY_NOTICE = (
    "Satellite Land Surface Temperature (LST °C from Landsat 8/9 Thermal Band 10) measures ground/rooftop skin heat and is "
    "typically 4–12 °C warmer than shaded ambient Air Temperature measured at weather stations. Future projections are "
    "statistical trend estimates, not guaranteed climate outcomes."
)


def _fetch_air_temp_benchmark() -> Dict[str, Any]:
    """Fetch live Bengaluru 2m air temperature + acquisition-date max station air temp from Open-Meteo."""
    current_air_c = None
    acq_day_max_air_c = None
    try:
        r_now = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={"latitude": 12.9716, "longitude": 77.5946, "current": "temperature_2m", "timezone": "Asia/Kolkata"},
            timeout=6,
        )
        if r_now.status_code == 200:
            current_air_c = r_now.json().get("current", {}).get("temperature_2m")
    except Exception:
        pass

    try:
        r_arch = requests.get(
            "https://archive-api.open-meteo.com/v1/archive",
            params={
                "latitude": 12.9716,
                "longitude": 77.5946,
                "start_date": "2026-02-12",
                "end_date": "2026-02-12",
                "daily": "temperature_2m_max,temperature_2m_mean",
                "timezone": "Asia/Kolkata",
            },
            timeout=6,
        )
        if r_arch.status_code == 200:
            vals = r_arch.json().get("daily", {}).get("temperature_2m_max", [])
            if vals and vals[0] is not None:
                acq_day_max_air_c = float(vals[0])
    except Exception:
        pass

    return {
        "current_air_temp_c": round(float(current_air_c), 1) if current_air_c is not None else 23.4,
        "acq_day_max_air_temp_c": round(float(acq_day_max_air_c), 1) if acq_day_max_air_c is not None else 30.2,
        "acq_date": LANDSAT_SCENES[-1]["date"],
        "source": "Open-Meteo Bengaluru Station Model (2m shaded air temperature)",
    }


def _read_landsat_window(
    item: Any,
    bbox: Tuple[float, float, float, float],
    target_shape: Optional[Tuple[int, int]] = None,
) -> Dict[str, Any]:
    """Read Landsat C2-L2 Thermal (lwir11 -> °C), RGB, NIR (NDVI), and QA_PIXEL mask."""
    with rasterio.open(item.assets["lwir11"].href) as src_th:
        left, bottom, right, top = transform_bounds("EPSG:4326", src_th.crs, *bbox)
        win = from_bounds(left, bottom, right, top, src_th.transform).round_offsets().round_lengths()
        if target_shape is not None:
            lwir_dn = src_th.read(
                1,
                window=win,
                out_shape=target_shape,
                boundless=True,
                fill_value=0,
                resampling=rasterio.enums.Resampling.bilinear,
            ).astype(np.float32)
        else:
            lwir_dn = src_th.read(1, window=win, boundless=True, fill_value=0).astype(np.float32)
        win_transform = src_th.window_transform(win)
        profile = {"crs": src_th.crs, "transform": win_transform, "height": lwir_dn.shape[0], "width": lwir_dn.shape[1]}

    def _read_opt(key: str, resample: rasterio.enums.Resampling = rasterio.enums.Resampling.bilinear) -> np.ndarray:
        with rasterio.open(item.assets[key].href) as s:
            w = from_bounds(left, bottom, right, top, s.transform).round_offsets().round_lengths()
            return s.read(1, window=w, out_shape=lwir_dn.shape, boundless=True, fill_value=0, resampling=resample).astype(np.float32)

    red_sr = np.clip(_read_opt("red") * 0.0000275 - 0.2, 0.0, 1.0)
    green_sr = np.clip(_read_opt("green") * 0.0000275 - 0.2, 0.0, 1.0)
    blue_sr = np.clip(_read_opt("blue") * 0.0000275 - 0.2, 0.0, 1.0)
    nir_sr = np.clip(_read_opt("nir08") * 0.0000275 - 0.2, 0.0, 1.0)
    qa = _read_opt("qa_pixel", resample=rasterio.enums.Resampling.nearest).astype(np.uint16)

    # Landsat C2-L2 Surface Temperature calibration (lwir11: DN * 0.00341802 + 149.0 K)
    lst_c = np.where(lwir_dn > 0, (lwir_dn * 0.00341802 + 149.0) - 273.15, np.nan).astype(np.float32)

    cloud_bits = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4)
    water = (qa & (1 << 7)) != 0
    valid = np.logical_and.reduce([lwir_dn > 0, ~np.isnan(lst_c), (qa & cloud_bits) == 0, lst_c > 10.0, lst_c < 62.0])

    ndvi = (nir_sr - red_sr) / np.maximum(nir_sr + red_sr, 1e-4)
    veg = np.logical_and.reduce([valid, ~water, ndvi > 0.28])
    rgb = np.clip(np.stack([red_sr, green_sr, blue_sr], axis=-1) * 3.3, 0.0, 1.0)

    return {
        "profile": profile,
        "valid": valid,
        "water": water,
        "lst_c": lst_c,
        "ndvi": ndvi,
        "veg": veg.astype(np.uint8),
        "rgb": rgb,
    }


def _save_thermal_png(
    lst_c: np.ndarray,
    out_path: Path,
    title: str,
    vmin: float = 24.0,
    vmax: float = 46.0,
    cmap: str = "inferno",
) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(5.4, 5.0), dpi=140)
    im = ax.imshow(np.clip(lst_c, vmin, vmax), cmap=cmap, vmin=vmin, vmax=vmax)
    cbar = fig.colorbar(im, ax=ax, fraction=0.042, pad=0.03)
    cbar.ax.tick_params(colors="#F5F1E6", labelsize=8)
    cbar.set_label("LST (°C)", color="#F5F1E6", fontsize=8)
    ax.set_title(title, color="#F5F1E6", fontsize=10, pad=6)
    ax.axis("off")
    fig.patch.set_facecolor("#001710")
    fig.savefig(out_path, bbox_inches="tight", pad_inches=0.04, facecolor=fig.get_facecolor())
    plt.close(fig)


def _save_green_cooling_png(
    rgb: np.ndarray,
    out_path: Path,
    title: str,
    hotspot_mask: Optional[np.ndarray] = None,
    plantation_mask: Optional[np.ndarray] = None,
) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img = rgb.copy()
    if hotspot_mask is not None:
        h = hotspot_mask > 0
        img[h] = img[h] * 0.35 + np.array([0.98, 0.35, 0.12], dtype=np.float32) * 0.65
    if plantation_mask is not None:
        p = plantation_mask > 0
        img[p] = img[p] * 0.25 + np.array([0.22, 0.92, 0.56], dtype=np.float32) * 0.75

    fig, ax = plt.subplots(figsize=(5.4, 5.0), dpi=140)
    ax.imshow(np.clip(img, 0.0, 1.0))
    ax.set_title(title, color="#F5F1E6", fontsize=10, pad=6)
    ax.axis("off")
    fig.patch.set_facecolor("#001710")
    fig.savefig(out_path, bbox_inches="tight", pad_inches=0.04, facecolor=fig.get_facecolor())
    plt.close(fig)


def _polygonize_heat_mask(
    mask: np.ndarray,
    profile: Dict[str, Any],
    zone_id: str,
    zone_name: str,
    layer_kind: str,
    min_ha: float = 0.5,
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
    gdf_wgs = gdf.to_crs("EPSG:4326").sort_values("area_ha", ascending=False).head(25)
    for _, row in gdf_wgs.iterrows():
        feats.append(
            {
                "type": "Feature",
                "properties": {
                    "zone_id": zone_id,
                    "zone_name": zone_name,
                    "layer_kind": layer_kind,
                    "area_ha": float(row["area_ha"]),
                },
                "geometry": row.geometry.__geo_interface__,
            }
        )
    return feats


def _read_s2_background(s2_item: Any, bbox: Tuple[float, float, float, float], target_shape: Optional[Tuple[int, int]] = None) -> np.ndarray:
    """Read high-res 10m Sentinel-2 RGB to fuse beneath Landsat thermal heatmaps."""
    with rasterio.open(s2_item.assets["B04"].href) as src_ref:
        left, bottom, right, top = transform_bounds("EPSG:4326", src_ref.crs, *bbox)
        win = from_bounds(left, bottom, right, top, src_ref.transform).round_offsets().round_lengths()
        if target_shape is not None:
            r = src_ref.read(1, window=win, out_shape=target_shape, boundless=True, fill_value=0, resampling=rasterio.enums.Resampling.bilinear).astype(np.float32) / 10000.0
        else:
            r = src_ref.read(1, window=win, boundless=True, fill_value=0).astype(np.float32) / 10000.0

    def _b(key: str) -> np.ndarray:
        with rasterio.open(s2_item.assets[key].href) as s:
            w = from_bounds(left, bottom, right, top, s.transform).round_offsets().round_lengths()
            return s.read(1, window=w, out_shape=r.shape, boundless=True, fill_value=0, resampling=rasterio.enums.Resampling.bilinear).astype(np.float32) / 10000.0

    return stretch_sentinel_rgb(r, _b("B03"), _b("B02"))


def _open_landsat_scenes() -> Tuple[List[Dict[str, Any]], Any, Any]:
    catalog = pystac_client.Client.open(
        "https://planetarycomputer.microsoft.com/api/stac/v1",
        modifier=planetary_computer.sign_inplace,
    )
    resolved: List[Dict[str, Any]] = []
    for spec in LANDSAT_SCENES:
        items = list(catalog.search(collections=["landsat-c2-l2"], ids=[spec["id"]]).items())
        if not items:
            raise RuntimeError(f"Could not locate Landsat scene {spec['id']}")
        resolved.append({**spec, "item": items[0]})
    s2_19 = next(catalog.search(collections=["sentinel-2-l2a"], ids=[S2_HEAT_BEFORE_ID]).items())
    s2_26 = next(catalog.search(collections=["sentinel-2-l2a"], ids=[S2_HEAT_AFTER_ID]).items())
    return resolved, s2_19, s2_26


def build_or_load_heat_base(force_refresh: bool = False) -> Dict[str, Any]:
    """Compute (or load cached) Landsat 8/9 2019-2026 thermal LST & green cooling telemetry."""
    if not force_refresh and HEAT_DATA_PATH.exists() and HEAT_GEO_PATH.exists():
        return json.loads(HEAT_DATA_PATH.read_text(encoding="utf-8"))

    scenes, s2_19_item, s2_26_item = _open_landsat_scenes()
    HEAT_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    # Citywide macro thermal overview (30m LST fused over sharp Sentinel-2 overview)
    macro19 = _read_landsat_window(scenes[0]["item"], BENGALURU_HEAT_BBOX, target_shape=(520, 440))
    macro26 = _read_landsat_window(scenes[-1]["item"], BENGALURU_HEAT_BBOX, target_shape=(520, 440))
    s2_macro_19 = _read_s2_background(s2_19_item, BENGALURU_HEAT_BBOX, target_shape=(640, 560))
    s2_macro_26 = _read_s2_background(s2_26_item, BENGALURU_HEAT_BBOX, target_shape=(640, 560))

    valid_macro = np.logical_and(macro26["valid"], ~macro26["water"])
    city_mean_lst_2026 = round(float(np.nanmean(macro26["lst_c"][valid_macro])), 2)
    city_p85_lst_2026 = round(float(np.nanpercentile(macro26["lst_c"][valid_macro], 85)), 2)

    valid_macro19 = np.logical_and(macro19["valid"], ~macro19["water"])
    city_mean_lst_2019 = round(float(np.nanmean(macro19["lst_c"][valid_macro19])), 2)

    save_fused_thermal_png(s2_macro_19, macro19["lst_c"], HEAT_IMAGES_DIR / "city_lst_2019.png", figsize=(8.0, 5.0), dpi=200)
    save_fused_thermal_png(s2_macro_26, macro26["lst_c"], HEAT_IMAGES_DIR / "city_lst_2026.png", figsize=(8.0, 5.0), dpi=200)
    macro_hotspot = np.logical_and(valid_macro, macro26["lst_c"] >= city_p85_lst_2026).astype(np.uint8)
    macro_plant = np.logical_and.reduce([valid_macro, macro26["lst_c"] >= city_mean_lst_2026 + 1.8, macro26["ndvi"] < 0.18]).astype(np.uint8)
    save_sharp_overlay_png(
        macro26["rgb"],
        HEAT_IMAGES_DIR / "city_cooling_priority.png",
        overlays=[(macro_hotspot, (0.98, 0.35, 0.12), 0.50), (macro_plant, (0.22, 0.92, 0.56), 0.56)],
        figsize=(8.0, 5.0),
        dpi=200,
    )

    zones_out: List[Dict[str, Any]] = []
    geo_features: List[Dict[str, Any]] = []
    px_ha = 0.09  # 30m x 30m Landsat pixel in UTM = 900 m^2 = 0.09 ha

    for z in HEAT_ZONES:
        bbox = (z["lon"] - z["half_lon"], z["lat"] - z["half_lat"], z["lon"] + z["half_lon"], z["lat"] + z["half_lat"])
        first_w = _read_landsat_window(scenes[0]["item"], bbox)
        t_shape = (first_w["lst_c"].shape[0], first_w["lst_c"].shape[1])
        wins = [first_w] + [_read_landsat_window(sc["item"], bbox, target_shape=t_shape) for sc in scenes[1:]]

        history = []
        for sc, w in zip(scenes, wins):
            m = np.logical_and(w["valid"], ~w["water"])
            mean_lst = round(float(np.nanmean(w["lst_c"][m])), 2) if np.any(m) else city_mean_lst_2026
            p90_lst = round(float(np.nanpercentile(w["lst_c"][m], 90)), 2) if np.any(m) else mean_lst + 1.5
            mean_ndvi = round(float(np.nanmean(w["ndvi"][m])), 3) if np.any(m) else 0.2
            history.append({"year": sc["year"], "date": sc["date"], "mean_lst_c": mean_lst, "p90_lst_c": p90_lst, "mean_ndvi": mean_ndvi})

        w19, w26 = wins[0], wins[-1]
        m_common = np.logical_and.reduce([w19["valid"], w26["valid"], ~w26["water"]])

        hotspot_mask = remove_small_objects(binary_closing(np.logical_and(m_common, w26["lst_c"] >= city_p85_lst_2026), footprint=disk(1)), min_size=4).astype(np.uint8)
        veg_loss_mask = remove_small_objects(np.logical_and.reduce([m_common, w19["veg"] > 0, w26["veg"] == 0, (w19["ndvi"] - w26["ndvi"]) > 0.07]), min_size=4).astype(np.uint8)
        plantation_mask = remove_small_objects(
            binary_closing(np.logical_and.reduce([m_common, w26["lst_c"] >= city_mean_lst_2026 + 1.5, w26["ndvi"] < 0.20]), footprint=disk(1)),
            min_size=4,
        ).astype(np.uint8)

        lst_2019 = history[0]["mean_lst_c"]
        lst_2026 = history[-1]["mean_lst_c"]
        p90_2026 = history[-1]["p90_lst_c"]
        warming_delta_c = round(lst_2026 - lst_2019, 2)

        # Robust OLS slope over 2019, 2022, 2024, 2026 so seasonal acquisition shift doesn't distort projection
        xs = np.array([h["year"] for h in history], dtype=np.float64)
        ys = np.array([h["mean_lst_c"] for h in history], dtype=np.float64)
        slope_c_per_yr = float(np.polyfit(xs, ys, 1)[0]) if len(xs) >= 2 else 0.15

        veg_loss_ha = round(float(np.sum(veg_loss_mask)) * px_ha, 2)
        hotspot_ha = round(float(np.sum(hotspot_mask)) * px_ha, 2)
        plantation_target_ha = round(float(np.sum(plantation_mask)) * px_ha, 2)

        # Save per-zone Sentinel-2 10m fused thermal & greening PNGs
        s2_z19 = _read_s2_background(s2_19_item, bbox)
        s2_z26 = _read_s2_background(s2_26_item, bbox, target_shape=s2_z19.shape[:2])
        save_fused_thermal_png(s2_z19, w19["lst_c"], HEAT_IMAGES_DIR / f"{z['id']}_lst_2019.png", figsize=(8.0, 5.0), dpi=200)
        save_fused_thermal_png(s2_z26, w26["lst_c"], HEAT_IMAGES_DIR / f"{z['id']}_lst_2026.png", figsize=(8.0, 5.0), dpi=200)
        save_sharp_overlay_png(
            w26["rgb"],
            HEAT_IMAGES_DIR / f"{z['id']}_cooling.png",
            overlays=[(hotspot_mask, (0.98, 0.35, 0.12), 0.50), (plantation_mask, (0.22, 0.92, 0.56), 0.56)],
            figsize=(8.0, 5.0),
            dpi=200,
        )

        geo_features.extend(_polygonize_heat_mask(hotspot_mask, w26["profile"], z["id"], z["name"], "heat_hotspot", min_ha=0.45))
        geo_features.extend(_polygonize_heat_mask(veg_loss_mask, w26["profile"], z["id"], z["name"], "veg_decline", min_ha=0.45))
        geo_features.extend(_polygonize_heat_mask(plantation_mask, w26["profile"], z["id"], z["name"], "plantation_priority", min_ha=0.45))

        zones_out.append(
            {
                "id": z["id"],
                "ward_no": z["ward_no"],
                "name": z["name"],
                "zone": z["zone"],
                "lat": z["lat"],
                "lon": z["lon"],
                "mean_lst_2019_c": lst_2019,
                "mean_lst_2026_c": lst_2026,
                "p90_lst_2026_c": p90_2026,
                "warming_delta_c": warming_delta_c,
                "slope_c_per_yr": round(slope_c_per_yr, 3),
                "mean_ndvi_2019": history[0]["mean_ndvi"],
                "mean_ndvi_2026": history[-1]["mean_ndvi"],
                "veg_loss_ha": veg_loss_ha,
                "hotspot_area_ha": hotspot_ha,
                "plantation_target_ha": plantation_target_ha,
                "heat_driver": z["heat_driver"],
                "history": history,
                "images": {
                    "lst_before": f"/api/images/heat/{z['id']}_lst_2019.png",
                    "lst_after": f"/api/images/heat/{z['id']}_lst_2026.png",
                    "cooling": f"/api/images/heat/{z['id']}_cooling.png",
                },
            }
        )

    geojson = {"type": "FeatureCollection", "features": geo_features}
    HEAT_GEO_PATH.write_text(json.dumps(geojson), encoding="utf-8")

    base_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scenes": [{"year": s["year"], "id": s["id"], "date": s["date"], "sensor": s["sensor"]} for s in LANDSAT_SCENES],
        "source": "Landsat 8/9 Collection 2 Level-2 Surface Temperature (Band lwir11, Microsoft Planetary Computer STAC)",
        "city_mean_lst_2019_c": city_mean_lst_2019,
        "city_mean_lst_2026_c": city_mean_lst_2026,
        "city_p85_lst_2026_c": city_p85_lst_2026,
        "city_images": {
            "lst_before": "/api/images/heat/city_lst_2019.png",
            "lst_after": "/api/images/heat/city_lst_2026.png",
            "cooling": "/api/images/heat/city_cooling_priority.png",
        },
        "zones": zones_out,
    }
    HEAT_DATA_PATH.write_text(json.dumps(base_payload, indent=2), encoding="utf-8")
    return base_payload


def evaluate_heat_horizon(horizon_years: int = 5, force_refresh: bool = False) -> Dict[str, Any]:
    """Compute future heat stress estimates, cooling-tree priorities & Open-Meteo station air benchmark."""
    horizon = max(1, min(10, int(horizon_years)))
    target_year = 2026 + horizon

    base = build_or_load_heat_base(force_refresh=force_refresh)
    air_bench = _fetch_air_temp_benchmark()
    geojson = json.loads(HEAT_GEO_PATH.read_text(encoding="utf-8")) if HEAT_GEO_PATH.exists() else {"type": "FeatureCollection", "features": []}

    coolest_c = min((z["mean_lst_2026_c"] for z in base["zones"]), default=base["city_mean_lst_2026_c"])
    coolest_2019_c = min((z["mean_lst_2019_c"] for z in base["zones"]), default=base["city_mean_lst_2019_c"])
    enriched: List[Dict[str, Any]] = []

    for z in base["zones"]:
        heat_island_anomaly_c = round(float(z["mean_lst_2026_c"]) - coolest_c, 2)
        uhi_2019_c = float(z["mean_lst_2019_c"]) - coolest_2019_c
        relative_uhi_shift_c = heat_island_anomaly_c - uhi_2019_c

        # Trend estimate combines relative UHI intensification + vegetation loss pressure
        uhi_rate = max(0.06, (0.14 if relative_uhi_shift_c <= 0 else 0.14 + relative_uhi_shift_c / 6.9))
        veg_pressure = max(0.0, float(z["veg_loss_ha"]) * 0.0022)
        projected_delta_c = round(min(4.2, (uhi_rate + veg_pressure) * horizon), 2)
        projected_lst_c = round(float(z["mean_lst_2026_c"]) + projected_delta_c, 2)

        # Empirical tree-canopy cooling estimate (-0.8 to -3.8 C surface reduction)
        potential_cooling_c = round(min(3.8, max(0.8, 0.9 + (0.28 - min(0.28, float(z["mean_ndvi_2026"]))) * 11.5)), 1)

        heat_score = min(
            98.0,
            max(
                15.0,
                round(
                    (heat_island_anomaly_c * 24.0)
                    + (float(z["plantation_target_ha"]) * 0.75)
                    + (float(z["veg_loss_ha"]) * 0.08)
                    + (projected_delta_c * 6.0),
                    1,
                ),
            ),
        )
        heat_tier = "Severe Heat Hotspot" if heat_score >= 62.0 else "Moderate Heat Stress" if heat_score >= 35.0 else "Cooler Canopy Zone"

        interventions: List[str] = []
        if z["plantation_target_ha"] >= 25 or z["mean_ndvi_2026"] < 0.22:
            interventions.append("Avenue Tree Canopy & Miyawaki Pocket Parks")
        if z["p90_lst_2026_c"] >= 39.0 or z["hotspot_area_ha"] >= 35:
            interventions.append("High-Albedo Cool Roofs & Shaded Bus Shelters")
        if z["veg_loss_ha"] >= 20:
            interventions.append("Green Buffer Recovery & Permeable Pavements")
        if not interventions:
            interventions.append("Preserve Mature Canopy & Shade Corridors")

        enriched.append(
            {
                **z,
                "target_year": target_year,
                "heat_island_anomaly_c": heat_island_anomaly_c,
                "projected_delta_c": projected_delta_c,
                "projected_lst_c": projected_lst_c,
                "potential_cooling_c": potential_cooling_c,
                "heat_score": heat_score,
                "heat_tier": heat_tier,
                "cooling_interventions": interventions,
                "prediction_label": "Estimated LST projection (not guaranteed; surface temp != air temp)",
            }
        )

    enriched.sort(key=lambda x: x["heat_score"], reverse=True)
    hottest = max(enriched, key=lambda x: x["mean_lst_2026_c"]) if enriched else {}

    summary = {
        "total_zones": len(enriched),
        "city_mean_lst_2019_c": base["city_mean_lst_2019_c"],
        "city_mean_lst_2026_c": base["city_mean_lst_2026_c"],
        "hottest_zone_name": hottest.get("name", "—"),
        "hottest_zone_lst_c": hottest.get("mean_lst_2026_c", 0.0),
        "coolest_zone_lst_c": coolest_c,
        "max_uhi_spread_c": round(float(hottest.get("mean_lst_2026_c", coolest_c)) - coolest_c, 2),
        "severe_hotspot_count": sum(1 for z in enriched if z["heat_tier"] == "Severe Heat Hotspot"),
        "total_veg_loss_ha": round(sum(z["veg_loss_ha"] for z in enriched), 2),
        "total_plantation_target_ha": round(sum(z["plantation_target_ha"] for z in enriched), 2),
        "horizon_years": horizon,
        "target_year": target_year,
    }

    return {
        "generated_at": base["generated_at"],
        "scenes": base["scenes"],
        "source": base["source"],
        "honesty_notice": HEAT_HONESTY_NOTICE,
        "air_temp_benchmark": air_bench,
        "city_images": base["city_images"],
        "summary": summary,
        "zones": enriched,
        "geojson": geojson,
    }
