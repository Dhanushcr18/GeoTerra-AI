"""Bengaluru Critical Infrastructure Protection engine fusing DEM flood, S1 water, S2 land-change & Landsat heat."""

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
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds
from shapely.geometry import LineString, Point, shape
from skimage.morphology import binary_closing, disk, remove_small_objects

from backend.app import config
from backend.app.image_utils import save_sharp_overlay_png, stretch_sentinel_rgb

INFRA_DATA_PATH = config.DATA_DIR / "infrastructure_protection.json"
INFRA_GEO_PATH = config.DATA_DIR / "infrastructure_corridors.geojson"
INFRA_IMAGES_DIR = config.IMAGES_DIR / "infra"
TARGET_UTM_CRS = "EPSG:32643"

S2_BEFORE_ID = "S2B_MSIL2A_20190330T050659_R019_T43PGQ_20201007T122704"
S2_AFTER_ID = "S2C_MSIL2A_20261123T051121_R019_T43PGQ_20261123T095510"

PROTECTION_HONESTY_NOTICE = (
    "Satellite detections, flood-exposure overlaps, and land-disturbance alerts are AI & remote-sensing risk screens for "
    "preventive safety inspection — NOT verified field structural incidents."
)

# Real Bengaluru critical infrastructure nodes (roads, bridges, metro, power, water)
CRITICAL_ASSETS: List[Dict[str, Any]] = [
    {
        "id": "orr_ecospace_corridor",
        "name": "Outer Ring Rd – Bellandur Ecospace Flyover",
        "category": "roads_bridges",
        "category_label": "Roads & Bridges",
        "lat": 12.9278,
        "lon": 77.6762,
        "operator": "BBMP / BDA",
        "criticality": "Tier-1 IT & Arterial Spine",
    },
    {
        "id": "silk_board_interchange",
        "name": "Central Silk Board Flyover & Metro Hub",
        "category": "roads_bridges",
        "category_label": "Roads & Bridges",
        "lat": 12.9177,
        "lon": 77.6238,
        "operator": "BMRCL / NHAI",
        "criticality": "Multi-Corridor Junction",
    },
    {
        "id": "hebbal_flyover",
        "name": "Hebbal Flyover & NH-44 Airport Viaduct",
        "category": "roads_bridges",
        "category_label": "Roads & Bridges",
        "lat": 13.0359,
        "lon": 77.5919,
        "operator": "NHAI / BDA",
        "criticality": "Primary Airport Link",
    },
    {
        "id": "kr_puram_bridge",
        "name": "KR Puram Cable-Stayed Bridge & Metro",
        "category": "roads_bridges",
        "category_label": "Roads & Bridges",
        "lat": 13.0012,
        "lon": 77.6768,
        "operator": "BMRCL / NHAI",
        "criticality": "East Rail–Road Bridge",
    },
    {
        "id": "nayandahalli_underpass",
        "name": "Nayandahalli Flyover & Vrishabhavathi Culvert",
        "category": "roads_bridges",
        "category_label": "Roads & Bridges",
        "lat": 12.9422,
        "lon": 77.5236,
        "operator": "BBMP / PWD",
        "criticality": "Valley Drain Crossing",
    },
    {
        "id": "metro_whitefield",
        "name": "Namma Metro Kadugodi – Whitefield Depot",
        "category": "metro",
        "category_label": "Metro Rail",
        "lat": 12.9854,
        "lon": 77.7470,
        "operator": "BMRCL Purple Line",
        "criticality": "East Metro Terminal & Depot",
    },
    {
        "id": "metro_majestic",
        "name": "Kempegowda (Majestic) Underground Interchange",
        "category": "metro",
        "category_label": "Metro Rail",
        "lat": 12.9756,
        "lon": 77.5728,
        "operator": "BMRCL Purple/Green",
        "criticality": "Central Transit Hub",
    },
    {
        "id": "metro_ecity",
        "name": "Electronic City Elevated Metro Corridor",
        "category": "metro",
        "category_label": "Metro Rail",
        "lat": 12.8452,
        "lon": 77.6602,
        "operator": "BMRCL Yellow Line",
        "criticality": "Hosur Rd Viaduct",
    },
    {
        "id": "power_hoodi_gis",
        "name": "Hoodi 220 kV GIS Power Substation",
        "category": "power",
        "category_label": "Power Grid",
        "lat": 12.9908,
        "lon": 77.7115,
        "operator": "KPTCL / BESCOM",
        "criticality": "East Tech Grid Feed",
    },
    {
        "id": "power_peenya_220kv",
        "name": "Peenya 220 kV Receiving Substation",
        "category": "power",
        "category_label": "Power Grid",
        "lat": 13.0305,
        "lon": 77.5192,
        "operator": "KPTCL",
        "criticality": "West Industrial Grid",
    },
    {
        "id": "power_yelahanka_gen",
        "name": "Yelahanka 220 kV Substation & Gas Plant Corridor",
        "category": "power",
        "category_label": "Power Grid",
        "lat": 13.1120,
        "lon": 77.5890,
        "operator": "KPCL / KPTCL",
        "criticality": "North Bengaluru Feed",
    },
    {
        "id": "water_bellandur_stp",
        "name": "Bellandur 90 MLD Sewage & Lake Weir Plant",
        "category": "water",
        "category_label": "Water & Drainage",
        "lat": 12.9362,
        "lon": 77.6845,
        "operator": "BWSSB",
        "criticality": "Valley Wastewater Treatment",
    },
    {
        "id": "water_kengeri_stp",
        "name": "Vrishabhavathi Valley Water & STP Complex",
        "category": "water",
        "category_label": "Water & Drainage",
        "lat": 12.9125,
        "lon": 77.4985,
        "operator": "BWSSB",
        "criticality": "South-West Trunk Drain",
    },
    {
        "id": "water_cjf_south",
        "name": "BWSSB Cauvery CJF South Ground Reservoir",
        "category": "water",
        "category_label": "Water & Drainage",
        "lat": 12.9102,
        "lon": 77.6012,
        "operator": "BWSSB",
        "criticality": "Drinking Water Distribution",
    },
]

# Key linear lifelines (Metro lines, Power transmission corridor, Outer Ring Road flood spine)
LIFELINE_CORRIDORS: List[Dict[str, Any]] = [
    {
        "id": "corridor_orr_east",
        "name": "ORR East Flood-Exposed Tech Spine (KR Puram – Silk Board)",
        "category": "roads_bridges",
        "coords": [(77.6768, 13.0012), (77.6940, 12.9660), (77.6762, 12.9278), (77.6410, 12.9170), (77.6238, 12.9177)],
    },
    {
        "id": "corridor_metro_purple",
        "name": "Namma Metro Purple Line (Whitefield – Majestic – Kengeri)",
        "category": "metro",
        "coords": [(77.7470, 12.9854), (77.7050, 12.9960), (77.6768, 13.0012), (77.5728, 12.9756), (77.5236, 12.9422), (77.4840, 12.9050)],
    },
    {
        "id": "corridor_kptcl_220kv",
        "name": "KPTCL 220 kV North–East Transmission Spine (Yelahanka – Hoodi)",
        "category": "power",
        "coords": [(77.5890, 13.1120), (77.6320, 13.0580), (77.6850, 13.0250), (77.7115, 12.9908)],
    },
    {
        "id": "corridor_cauvery_trunk",
        "name": "BWSSB Water & Valley Trunk Corridor (CJF South – Bellandur)",
        "category": "water",
        "coords": [(77.6012, 12.9102), (77.6380, 12.9150), (77.6680, 12.9310), (77.6845, 12.9362)],
    },
]


def _load_gdf(path: Path) -> gpd.GeoDataFrame:
    if not path.exists():
        return gpd.GeoDataFrame(geometry=[], crs="EPSG:4326")
    data = json.loads(path.read_text(encoding="utf-8"))
    feats = data.get("features", [])
    if not feats:
        return gpd.GeoDataFrame(geometry=[], crs="EPSG:4326")
    return gpd.GeoDataFrame.from_features(feats, crs="EPSG:4326")


def _read_s2_crop(item: Any, bbox: Tuple[float, float, float, float], target_shape: Optional[Tuple[int, int]] = None) -> Dict[str, Any]:
    with rasterio.open(item.assets["B04"].href) as src_ref:
        left, bottom, right, top = transform_bounds("EPSG:4326", src_ref.crs, *bbox)
        win = from_bounds(left, bottom, right, top, src_ref.transform).round_offsets().round_lengths()
        if target_shape is not None:
            red = src_ref.read(1, window=win, out_shape=target_shape, boundless=True, fill_value=0, resampling=rasterio.enums.Resampling.bilinear).astype(np.float32) / 10000.0
        else:
            red = src_ref.read(1, window=win, boundless=True, fill_value=0).astype(np.float32) / 10000.0

    def _b(key: str, res=rasterio.enums.Resampling.bilinear) -> np.ndarray:
        with rasterio.open(item.assets[key].href) as s:
            w = from_bounds(left, bottom, right, top, s.transform).round_offsets().round_lengths()
            return s.read(1, window=w, out_shape=red.shape, boundless=True, fill_value=0, resampling=res).astype(np.float32)

    blue = _b("B02") / 10000.0
    green = _b("B03") / 10000.0
    nir = _b("B08") / 10000.0
    swir = _b("B11") / 10000.0
    scl = _b("SCL", res=rasterio.enums.Resampling.nearest).astype(np.int16)

    valid = ~np.isin(scl, [0, 3, 8, 9, 10])
    ndvi = (nir - red) / np.maximum(nir + red, 1e-4)
    ndbi = (swir - nir) / np.maximum(swir + nir, 1e-4)
    mndwi = (green - swir) / np.maximum(green + swir, 1e-4)
    bsi = ((swir + red) - (nir + blue)) / np.maximum((swir + red) + (nir + blue), 1e-4)
    rgb = stretch_sentinel_rgb(red, green, blue)
    return {"valid": valid, "ndvi": ndvi, "ndbi": ndbi, "mndwi": mndwi, "bsi": bsi, "rgb": rgb}


def _save_infra_chip(rgb: np.ndarray, out_path: Path, title: str, change_mask: Optional[np.ndarray] = None, water_mask: Optional[np.ndarray] = None) -> None:
    overlays = []
    if water_mask is not None:
        overlays.append((water_mask, (0.12, 0.72, 0.96), 0.50))
    if change_mask is not None:
        overlays.append((change_mask, (0.98, 0.48, 0.14), 0.55))
    save_sharp_overlay_png(rgb, out_path, overlays=overlays, center_dot=True, figsize=(8.0, 5.0), dpi=200)


def build_or_load_infrastructure(force_refresh: bool = False) -> Dict[str, Any]:
    """Screen Bengaluru critical infrastructure against real DEM flood, S1 water, S2 change & Landsat heat layers."""
    if not force_refresh and INFRA_DATA_PATH.exists() and INFRA_GEO_PATH.exists():
        return json.loads(INFRA_DATA_PATH.read_text(encoding="utf-8"))

    # Load real multi-hazard spatial layers on disk
    flood_gdf = _load_gdf(config.DATA_DIR / "bengaluru_risk_zones.geojson")
    flood_utm = flood_gdf.to_crs(TARGET_UTM_CRS) if not flood_gdf.empty else flood_gdf

    urban_gdf = _load_gdf(config.DATA_DIR / "urban_expansion.geojson")
    urban_utm = urban_gdf.to_crs(TARGET_UTM_CRS) if not urban_gdf.empty else urban_gdf

    heat_gdf = _load_gdf(config.DATA_DIR / "urban_heat.geojson")
    heat_utm = heat_gdf.to_crs(TARGET_UTM_CRS) if not heat_gdf.empty else heat_gdf

    s1_gdf = _load_gdf(config.DATA_DIR / "flood_extent.geojson")
    s1_utm = s1_gdf.to_crs(TARGET_UTM_CRS) if not s1_gdf.empty else s1_gdf

    lakes_gdf = _load_gdf(config.DATA_DIR / "lakes.geojson")
    lakes_utm = lakes_gdf.to_crs(TARGET_UTM_CRS) if not lakes_gdf.empty else lakes_gdf

    # Open Sentinel-2 STAC pair once to export 10m asset buffer verification chips
    cat = pystac_client.Client.open(
        "https://planetarycomputer.microsoft.com/api/stac/v1",
        modifier=planetary_computer.sign_inplace,
    )
    it_before = next(cat.search(collections=["sentinel-2-l2a"], ids=[S2_BEFORE_ID]).items())
    it_after = next(cat.search(collections=["sentinel-2-l2a"], ids=[S2_AFTER_ID]).items())

    INFRA_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    evaluated_assets: List[Dict[str, Any]] = []
    alerts: List[Dict[str, Any]] = []

    for asset in CRITICAL_ASSETS:
        pt_wgs = Point(asset["lon"], asset["lat"])
        pt_utm = gpd.GeoSeries([pt_wgs], crs="EPSG:4326").to_crs(TARGET_UTM_CRS).iloc[0]
        buf_400 = pt_utm.buffer(400.0)
        buf_750 = pt_utm.buffer(750.0)

        # 1. Intersect Copernicus DEM flood risk zone + Sentinel-1 water
        flood_suscept = 45.0
        elevation_m = 900.0
        depression_m = 2.0
        nearest_lake = "Bengaluru Basin"
        dist_lake_km = 2.5
        s1_water_nearby = False
        roads_km = 0.0
        buildings_exposed = 0

        if not flood_utm.empty:
            hit = flood_utm[flood_utm.intersects(buf_750)]
            if hit.empty:
                dists = flood_utm.distance(pt_utm)
                hit = flood_utm.loc[[dists.idxmin()]]
            row = hit.iloc[0]
            flood_suscept = float(row.get("base_susceptibility", 45.0))
            elevation_m = float(row.get("elevation_m", 900.0))
            depression_m = float(row.get("depression_m", 2.0))
            nearest_lake = str(row.get("nearest_lake", "Bengaluru Basin"))
            dist_lake_km = float(row.get("distance_to_lake_km", 2.5))
            roads_km = round(float(hit["estimated_roads_km"].sum()), 2) if "estimated_roads_km" in hit else 0.0
            buildings_exposed = int(hit["estimated_buildings"].sum()) if "estimated_buildings" in hit else 0
            s1_water_nearby = bool(hit["sentinel1_water_detected"].any()) if "sentinel1_water_detected" in hit else False

        if not s1_utm.empty and s1_utm.intersects(buf_750).any():
            s1_water_nearby = True

        # 2. Unusual surrounding land/construction changes (Sentinel-2)
        nearby_constr_ha = 0.0
        nearby_new_urban_ha = 0.0
        nearby_veg_loss_ha = 0.0
        if not urban_utm.empty:
            u_hit = urban_utm[urban_utm.intersects(buf_750)]
            if not u_hit.empty:
                for kind, fld in [("construction", "constr"), ("new_urban", "urb"), ("veg_loss", "veg")]:
                    sub = u_hit[u_hit["layer_kind"] == kind]
                    ha = round(float(sub.geometry.intersection(buf_750).area.sum() / 10_000.0), 2) if not sub.empty else 0.0
                    if fld == "constr":
                        nearby_constr_ha = ha
                    elif fld == "urb":
                        nearby_new_urban_ha = ha
                    else:
                        nearby_veg_loss_ha = ha

        # Lake buffer disturbance proximity
        lake_buffer_shift_ha = 0.0
        if not lakes_utm.empty:
            l_hit = lakes_utm[(lakes_utm["layer_kind"] == "buffer_change") & lakes_utm.intersects(buf_750)]
            if not l_hit.empty:
                lake_buffer_shift_ha = round(float(l_hit.geometry.intersection(buf_750).area.sum() / 10_000.0), 2)

        # 3. Landsat thermal hotspot overlap
        nearby_heat_ha = 0.0
        if not heat_utm.empty:
            h_hit = heat_utm[(heat_utm["layer_kind"] == "heat_hotspot") & heat_utm.intersects(buf_750)]
            if not h_hit.empty:
                nearby_heat_ha = round(float(h_hit.geometry.intersection(buf_750).area.sum() / 10_000.0), 2)

        # 4. Real Sentinel-2 10m RGB + change overlay chip centered on infrastructure asset (landscape 16:10 footprint)
        chip_bbox = (asset["lon"] - 0.0125, asset["lat"] - 0.0078, asset["lon"] + 0.0125, asset["lat"] + 0.0078)
        w19 = _read_s2_crop(it_before, chip_bbox)
        w26 = _read_s2_crop(it_after, chip_bbox, target_shape=w19["rgb"].shape[:2])
        valid = np.logical_and(w19["valid"], w26["valid"])

        s2_change_mask = remove_small_objects(
            binary_closing(
                np.logical_and.reduce(
                    [valid, (w26["ndbi"] - w19["ndbi"]) > 0.07, (w19["ndvi"] - w26["ndvi"]) > 0.06]
                ),
                footprint=disk(1),
            ),
            min_size=6,
        ).astype(np.uint8)
        s2_water_mask = np.logical_and(valid, w26["mndwi"] > 0.05).astype(np.uint8)
        px_change_ha = round(float(np.sum(s2_change_mask)) * 0.01, 2)

        _save_infra_chip(w19["rgb"], INFRA_IMAGES_DIR / f"{asset['id']}_before.png", f"{asset['name'][:32]} (2019-03-30)")
        _save_infra_chip(w26["rgb"], INFRA_IMAGES_DIR / f"{asset['id']}_after.png", f"{asset['name'][:32]} (2026-11-23)")
        _save_infra_chip(
            w26["rgb"],
            INFRA_IMAGES_DIR / f"{asset['id']}_risk.png",
            f"Buffer Screen: Orange=Change ({px_change_ha:.1f}ha), Cyan=Water",
            change_mask=s2_change_mask,
            water_mask=s2_water_mask,
        )

        unusual_change_ha = round(max(px_change_ha, nearby_new_urban_ha + nearby_constr_ha), 2)

        # Risk flags & composite risk score (0-100)
        flood_exposed = flood_suscept >= 58.0 or s1_water_nearby or dist_lake_km <= 1.2
        land_disturbance_flag = unusual_change_ha >= 6.0 or lake_buffer_shift_ha >= 0.5
        thermal_risk_flag = nearby_heat_ha >= 3.0

        risk_score = min(
            98.0,
            max(
                18.0,
                round(
                    (flood_suscept * 0.62)
                    + min(24.0, unusual_change_ha * 0.8)
                    + (8.0 if s1_water_nearby else 0.0)
                    + min(14.0, nearby_heat_ha * 1.4),
                    1,
                ),
            ),
        )
        risk_level = "High" if risk_score >= 64.0 else "Medium" if risk_score >= 42.0 else "Low"
        needs_inspection = risk_level == "High" or (flood_exposed and land_disturbance_flag)

        threat_tags: List[str] = []
        if flood_exposed:
            threat_tags.append("Flood-Prone Zone Exposure")
        if land_disturbance_flag:
            threat_tags.append("Unusual Nearby Land Change")
        if thermal_risk_flag:
            threat_tags.append("Thermal / Urban Heat Stress")
        if not threat_tags:
            threat_tags.append("Baseline Preventive Monitoring")

        recommended_action = (
            "Schedule drainage & structural inspection before heavy monsoon (>50mm/24h); verify nearby earthworks setbacks."
            if needs_inspection
            else "Maintain routine stormwater drain clearance and quarterly Sentinel-2 buffer monitoring."
        )

        item_out = {
            **asset,
            "elevation_m": round(elevation_m, 1),
            "depression_m": round(depression_m, 1),
            "nearest_lake": nearest_lake,
            "distance_to_lake_km": round(dist_lake_km, 2),
            "flood_susceptibility": round(flood_suscept, 1),
            "sentinel1_water_nearby": s1_water_nearby,
            "flood_exposed": flood_exposed,
            "nearby_roads_km": roads_km,
            "nearby_buildings_exposed": buildings_exposed,
            "unusual_land_change_ha": unusual_change_ha,
            "nearby_veg_loss_ha": nearby_veg_loss_ha,
            "lake_buffer_shift_ha": lake_buffer_shift_ha,
            "nearby_heat_hotspot_ha": nearby_heat_ha,
            "land_disturbance_flag": land_disturbance_flag,
            "thermal_risk_flag": thermal_risk_flag,
            "risk_score": risk_score,
            "risk_level": risk_level,
            "needs_inspection": needs_inspection,
            "threat_tags": threat_tags,
            "recommended_action": recommended_action,
            "status_label": "AI / Satellite Prediction — requires safety inspection (not a verified incident)",
            "images": {
                "before": f"/api/images/infra/{asset['id']}_before.png",
                "after": f"/api/images/infra/{asset['id']}_after.png",
                "risk": f"/api/images/infra/{asset['id']}_risk.png",
            },
        }
        evaluated_assets.append(item_out)

        if risk_level == "High" or land_disturbance_flag or flood_exposed:
            alert_type = (
                "MULTI_HAZARD_INFRA_RISK"
                if (flood_exposed and land_disturbance_flag)
                else "FLOOD_ZONE_EXPOSURE"
                if flood_exposed
                else "NEARBY_LAND_DISTURBANCE"
            )
            alerts.append(
                {
                    "id": f"ALT-{asset['id'].upper()[:10]}",
                    "asset_id": asset["id"],
                    "asset_name": asset["name"],
                    "category": asset["category_label"],
                    "severity": "HIGH" if risk_level == "High" else "MEDIUM",
                    "alert_type": alert_type,
                    "title": f"Potential Threat Screen: {asset['name']}",
                    "summary": (
                        f"Flood susceptibility {flood_suscept:.1f}/100 ({nearest_lake}, {dist_lake_km:.2f} km), "
                        f"{unusual_change_ha:.1f} ha nearby land change, {nearby_heat_ha:.1f} ha heat hotspot."
                    ),
                    "verification_label": "AI/Satellite Detection — Not a verified structural incident",
                }
            )

    evaluated_assets.sort(key=lambda x: x["risk_score"], reverse=True)
    alerts.sort(key=lambda x: (0 if x["severity"] == "HIGH" else 1))

    # Build linear corridor GeoJSON so Leaflet renders real Metro, ORR, Power & Water lifeline lines
    geo_features: List[Dict[str, Any]] = []
    for corr in LIFELINE_CORRIDORS:
        line = LineString(corr["coords"])
        geo_features.append(
            {
                "type": "Feature",
                "properties": {"id": corr["id"], "name": corr["name"], "category": corr["category"]},
                "geometry": line.__geo_interface__,
            }
        )
    corridors_geojson = {"type": "FeatureCollection", "features": geo_features}
    INFRA_GEO_PATH.write_text(json.dumps(corridors_geojson), encoding="utf-8")

    summary = {
        "total_assets_monitored": len(evaluated_assets),
        "high_risk_count": sum(1 for a in evaluated_assets if a["risk_level"] == "High"),
        "flood_exposed_count": sum(1 for a in evaluated_assets if a["flood_exposed"]),
        "land_disturbance_count": sum(1 for a in evaluated_assets if a["land_disturbance_flag"]),
        "thermal_exposed_count": sum(1 for a in evaluated_assets if a["thermal_risk_flag"]),
        "inspection_queue_count": sum(1 for a in evaluated_assets if a["needs_inspection"]),
        "total_exposed_roads_km": round(sum(a["nearby_roads_km"] for a in evaluated_assets if a["flood_exposed"]), 1),
        "total_exposed_buildings": sum(a["nearby_buildings_exposed"] for a in evaluated_assets if a["flood_exposed"]),
        "active_alerts_count": len(alerts),
    }

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Fused Copernicus DEM + Sentinel-1 SAR + Sentinel-2 L2A + Landsat 8/9 + Bengaluru Lifelines",
        "honesty_notice": PROTECTION_HONESTY_NOTICE,
        "summary": summary,
        "assets": evaluated_assets,
        "alerts": alerts,
        "corridors_geojson": corridors_geojson,
    }
    INFRA_DATA_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload
