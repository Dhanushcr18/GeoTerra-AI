"""Unified Bengaluru Monitoring Map (6 Valleys/Lakes) & 4-Module AI Prediction Engine aggregator."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from backend.app import (
    flood_prediction,
    infrastructure_protection,
    lake_monitoring,
    urban_expansion,
    urban_heat,
)

ENGINE_HONESTY_NOTICE = (
    "Predictions, future horizon estimates (+years), and risk rankings across all 4 modules are AI/analytical outputs "
    "from real Copernicus DEM, Sentinel-1/2, Landsat 8/9, OSM & Open-Meteo data — clearly labeled estimates, NOT guaranteed outcomes."
)


def _norm_risk(score: float, high_thr: float = 65.0, med_thr: float = 40.0) -> str:
    if score >= high_thr:
        return "High"
    if score >= med_thr:
        return "Medium"
    return "Low"


def build_unified_engine(rainfall_mm: float = 65.0, horizon_years: int = 5) -> Dict[str, Any]:
    """Assemble the 6 flagship Bengaluru monitoring sites and 4 connected AI prediction modules."""
    flood = flood_prediction.evaluate_rainfall_scenario(rainfall_24h_mm=rainfall_mm)
    urban = urban_expansion.evaluate_urban_horizon(horizon_years=horizon_years)
    heat = urban_heat.evaluate_heat_horizon(horizon_years=horizon_years)
    lakes = lake_monitoring.build_or_load_lakes()
    infra = infrastructure_protection.build_or_load_infrastructure()

    wards = {w["name"]: w for w in flood.get("wards", [])}
    corr_map = {c["id"]: c for c in urban.get("corridors", [])}
    heat_map = {z["id"]: z for z in heat.get("zones", [])}
    lake_map = {l["id"]: l for l in lakes.get("lakes", [])}
    asset_map = {a["id"]: a for a in infra.get("assets", [])}

    # --- Six requested Bengaluru Focus Monitoring Locations ---
    hebbal_w = wards.get("Hebbal", {})
    hebbal_l = lake_map.get("hebbal", {})
    hebbal_a = asset_map.get("hebbal_flyover", {})

    kora_w = wards.get("Koramangala", {})
    kora_a = asset_map.get("silk_board_interchange", {})
    kora_h = heat_map.get("hsr_koramangala", {})

    vri_w = wards.get("Vrishabhavathi / Nayandahalli", {})
    vri_a = asset_map.get("nayandahalli_underpass", {})
    vri_u = corr_map.get("kengeri_mysore_rd", {})

    wf_u = corr_map.get("whitefield_mahadevapura", {})
    wf_h = heat_map.get("whitefield_itpl", {})
    wf_w = wards.get("Doddanekundi", {})

    bell_l = lake_map.get("bellandur", {})
    bell_w = wards.get("Bellandur", {})
    bell_u = corr_map.get("bellandur_sarjapur", {})

    var_l = lake_map.get("varthur", {})
    var_u = corr_map.get("varthur_panathur", {})
    var_h = heat_map.get("varthur_panathur", {})

    focus_locations: List[Dict[str, Any]] = [
        {
            "id": "hebbal_valley",
            "name": "Hebbal Valley",
            "focus": "Flood risk and drainage monitoring",
            "lat": 13.0358,
            "lon": 77.5970,
            "primary_module": "flood",
            "risk_level": str(hebbal_w.get("risk_level", "medium")).capitalize(),
            "risk_score": float(hebbal_w.get("risk_score", 55.0)),
            "monitoring_summary": (
                f"Basin elevation {hebbal_w.get('elevation_m', 901.0)} m (depression {hebbal_w.get('depression_m', 3.0)} m); "
                f"{hebbal_w.get('osm_roads_in_zone_km', 0)} km roads exposed under {rainfall_mm:.0f} mm rain; "
                f"Hebbal Flyover infra risk {hebbal_a.get('risk_score', 44.9)}/100."
            ),
            "detected_changes": (
                f"Hebbal Lake spread shifted {hebbal_l.get('water_before_ha', 36.9)} -> {hebbal_l.get('water_after_ha', 9.6)} ha "
                f"({hebbal_l.get('water_change_pct', -74.1):+.1f}%); {hebbal_l.get('buffer_construction_ha', 7.87)} ha buffer built-up shift."
            ),
            "images": {
                "before": hebbal_l.get("images", {}).get("before", "/api/images/lakes/hebbal_before.png"),
                "after": hebbal_l.get("images", {}).get("overlay", "/api/images/lakes/hebbal_overlay.png"),
                "before_label": f"S2 Before ({lakes['scenes']['date_before']})",
                "after_label": f"Change Overlay ({lakes['scenes']['date_after']})",
            },
            "status_label": "Model prediction & satellite change — requires official drainage survey",
        },
        {
            "id": "koramangala_challaghatta",
            "name": "Koramangala–Chellaghatta Valley",
            "focus": "Urban flooding and infrastructure monitoring",
            "lat": 12.9352,
            "lon": 77.6245,
            "primary_module": "flood",
            "risk_level": str(kora_w.get("risk_level", "high")).capitalize(),
            "risk_score": float(kora_w.get("risk_score", 68.0)),
            "monitoring_summary": (
                f"Drainage corridor risk {kora_w.get('risk_score', 68.0)}/100 near {kora_w.get('major_lake', 'Koramangala Drain')}; "
                f"Silk Board Metro Hub infra score {kora_a.get('risk_score', 45.3)}/100; "
                f"{kora_w.get('osm_buildings_in_zone', 0)} buildings in zone."
            ),
            "detected_changes": (
                f"Nearby corridor land change {kora_a.get('unusual_land_change_ha', 19.15)} ha (Sentinel-2); "
                f"surface heat {kora_h.get('mean_lst_2026_c', 29.84)} °C LST."
            ),
            "images": {
                "before": kora_a.get("images", {}).get("before", "/api/images/infra/silk_board_interchange_before.png"),
                "after": kora_a.get("images", {}).get("risk", "/api/images/infra/silk_board_interchange_risk.png"),
                "before_label": "S2 Buffer Before (2019-03-30)",
                "after_label": "Infra Risk Buffer (2026)",
            },
            "status_label": "AI hazard overlap — not a verified incident",
        },
        {
            "id": "vrishabhavathi_valley",
            "name": "Vrishabhavathi Valley",
            "focus": "Rainfall and flood-risk monitoring",
            "lat": 12.9425,
            "lon": 77.5238,
            "primary_module": "flood",
            "risk_level": str(vri_w.get("risk_level", "high")).capitalize(),
            "risk_score": float(vri_w.get("risk_score", 76.4)),
            "monitoring_summary": (
                f"Steep valley depression {vri_w.get('depression_m', 9.2)} m at {vri_w.get('elevation_m', 822.0)} m elevation; "
                f"{vri_w.get('osm_roads_in_zone_km', 14.5)} km valley road exposure; Nayandahalli culvert flood score {vri_a.get('flood_susceptibility', 55.1)}/100."
            ),
            "detected_changes": (
                f"Nearby Kengeri–Mysore Rd infill +{vri_u.get('new_urban_ha', 148.2)} ha & veg loss -{vri_u.get('veg_loss_ha', 121.8)} ha (2019–2026)."
            ),
            "images": {
                "before": vri_a.get("images", {}).get("before", "/api/images/infra/nayandahalli_underpass_before.png"),
                "after": vri_a.get("images", {}).get("risk", "/api/images/infra/nayandahalli_underpass_risk.png"),
                "before_label": "S2 Valley Before (2019-03-30)",
                "after_label": "Valley Drain Risk Buffer",
            },
            "status_label": "Model prediction (unvalidated local runoff calibration)",
        },
        {
            "id": "whitefield",
            "name": "Whitefield",
            "focus": "Urban growth and vegetation monitoring",
            "lat": 12.9780,
            "lon": 77.7380,
            "primary_module": "urban_growth",
            "risk_level": "High" if wf_u.get("growth_pressure_score", 70) >= 62 else "Medium",
            "risk_score": float(wf_u.get("growth_pressure_score", 72.7)),
            "monitoring_summary": (
                f"Measured +{wf_u.get('new_urban_ha', 174.9)} ha newly urbanized & {wf_u.get('active_construction_ha', 18.3)} ha active construction; "
                f"est. +{wf_u.get('projected_added_ha', 139.6)} ha growth by {urban['summary']['target_year']}; Doddanekundi flood score {wf_w.get('risk_score', 42)}/100."
            ),
            "detected_changes": (
                f"Dry-season vegetation declined -{wf_u.get('veg_loss_ha', 163.2)} ha ({wf_u.get('veg_change_pct', 0):+.1f}%); "
                f"Landsat surface heat hotspot {wf_h.get('mean_lst_2026_c', 31.12)} °C LST."
            ),
            "images": {
                "before": wf_u.get("images", {}).get("before", "/api/images/urban/whitefield_mahadevapura_2019.png"),
                "after": wf_u.get("images", {}).get("overlay", "/api/images/urban/whitefield_mahadevapura_change.png"),
                "before_label": "Sentinel-2 2019-03-30",
                "after_label": "Urban & Veg Change (2019–2026)",
            },
            "status_label": "Observed 2019–2026 Sentinel-2 change; future growth is an estimate",
        },
        {
            "id": "bellandur_lake",
            "name": "Bellandur Lake",
            "focus": "Lake water spread and encroachment monitoring",
            "lat": 12.9369,
            "lon": 77.6680,
            "primary_module": "lake_health",
            "risk_level": str(bell_l.get("priority", "high")).capitalize(),
            "risk_score": float(bell_w.get("risk_score", 70.9)),
            "monitoring_summary": (
                f"Open water spread shifted {bell_l.get('water_before_ha', 53.1)} -> {bell_l.get('water_after_ha', 34.2)} ha "
                f"({bell_l.get('water_change_pct', -35.6):+.1f}%); adjacent Bellandur flood risk {bell_w.get('risk_score', 70.9)}/100."
            ),
            "detected_changes": (
                f"250 m buffer: {bell_l.get('buffer_construction_ha', 24.66)} ha NDBI built-up shift & "
                f"{bell_l.get('buffer_veg_loss_ha', 24.17)} ha vegetation drop; surrounding corridor +{bell_u.get('new_urban_ha', 109.9)} ha urban."
            ),
            "images": {
                "before": bell_l.get("images", {}).get("before", "/api/images/lakes/bellandur_before.png"),
                "after": bell_l.get("images", {}).get("overlay", "/api/images/lakes/bellandur_overlay.png"),
                "before_label": f"S2 Before ({lakes['scenes']['date_before']})",
                "after_label": f"Shoreline Overlay ({lakes['scenes']['date_after']})",
            },
            "status_label": bell_l.get("encroachment_status", "Requires official survey verification"),
        },
        {
            "id": "varthur_lake",
            "name": "Varthur Lake",
            "focus": "Lake health and surrounding land changes",
            "lat": 12.9438,
            "lon": 77.7375,
            "primary_module": "lake_health",
            "risk_level": "High",
            "risk_score": float(var_u.get("growth_pressure_score", 82.1)),
            "monitoring_summary": (
                f"Open water spread shifted {var_l.get('water_before_ha', 6.89)} -> {var_l.get('water_after_ha', 90.65)} ha "
                "(2024 dry aquatic cover vs 2026 post-monsoon); highest urban heat & infill hotspot in East Bengaluru."
            ),
            "detected_changes": (
                f"250 m lake buffer: {var_l.get('buffer_construction_ha', 19.34)} ha built-up index shift; "
                f"Panathur corridor +{var_u.get('new_urban_ha', 174.5)} ha urban, -{var_u.get('veg_loss_ha', 248.5)} ha veg, "
                f"and Landsat LST {var_h.get('mean_lst_2026_c', 31.08)} °C."
            ),
            "images": {
                "before": var_l.get("images", {}).get("before", "/api/images/lakes/varthur_before.png"),
                "after": var_l.get("images", {}).get("overlay", "/api/images/lakes/varthur_overlay.png"),
                "before_label": f"S2 Before ({lakes['scenes']['date_before']})",
                "after_label": f"Lake & Buffer Overlay ({lakes['scenes']['date_after']})",
            },
            "status_label": var_l.get("encroachment_status", "Requires official survey verification"),
        },
    ]

    # --- Four Unified AI Prediction Engine Modules ---
    flood_sum = flood.get("summary", {})
    urban_sum = urban.get("summary", {})
    heat_sum = heat.get("summary", {})
    lake_sum = lakes.get("summary", {})

    flood_wards = flood.get("wards", [])
    urban_corr = urban.get("corridors", [])
    heat_zones = heat.get("zones", [])
    lake_items = lakes.get("lakes", [])

    modules = {
        "flood": {
            "id": "flood",
            "name": "Flood Risk Prediction",
            "route": "/predict",
            "data_used": [
                "Copernicus GLO-30 DEM (30m elevation, slope & valley depressions)",
                "Sentinel-1 GRD SAR backscatter water mask",
                "Open-Meteo daily & forecast rainfall (interactive mm/24h)",
                "OpenStreetMap road lengths, buildings & lake/rajkaluve buffers",
            ],
            "ai_model_analysis": (
                f"Weighted topographic wetness + drainage proximity + rainfall forcing evaluated across {len(flood_wards)} BBMP catchments."
            ),
            "current_condition": (
                f"{flood_sum.get('high_risk_area_ha', 0)} ha High flood risk; {flood_sum.get('estimated_affected_roads_km', 0)} km roads "
                f"& {flood_sum.get('estimated_affected_buildings', 0)} buildings exposed at {rainfall_mm:.0f} mm/24h."
            ),
            "future_prediction": (
                f"Estimated scenario projection at {rainfall_mm:.0f} mm/24h storm surge: "
                f"{flood_sum.get('total_potential_flood_area_ha', 0)} ha High+Medium inundation susceptibility (Unvalidated model prediction)."
            ),
            "risk_breakdown": {
                "high": sum(1 for w in flood_wards if w.get("risk_level") == "high"),
                "medium": sum(1 for w in flood_wards if w.get("risk_level") == "medium"),
                "low": sum(1 for w in flood_wards if w.get("risk_level") == "low"),
            },
            "chart_series": [
                {
                    "name": w["name"].split("/")[0].strip()[:14],
                    "current": round(float(w.get("risk_score", 0)), 1),
                    "future": round(min(100.0, float(w.get("risk_score", 0)) * (1.0 + max(0, rainfall_mm - 65) / 250.0)), 1),
                    "risk_level": str(w.get("risk_level", "medium")).capitalize(),
                }
                for w in flood_wards[:8]
            ],
            "map_items": [
                {
                    "id": str(w.get("ward_no", w["name"])),
                    "name": w["name"],
                    "lat": float(w["lat"]),
                    "lon": float(w["lon"]),
                    "risk_level": str(w.get("risk_level", "medium")).capitalize(),
                    "risk_score": float(w.get("risk_score", 50.0)),
                    "summary": f"Elev {w.get('elevation_m', 0)} m · {w.get('osm_roads_in_zone_km', 0)} km roads · {w.get('osm_buildings_in_zone', 0)} bldgs",
                }
                for w in flood_wards
            ],
            "geojson": {
                "type": "FeatureCollection",
                "features": [
                    {
                        **f,
                        "properties": {
                            **f.get("properties", {}),
                            "engine_color": "#ef4444"
                            if f.get("properties", {}).get("risk_level") == "high"
                            else "#fbbf24"
                            if f.get("properties", {}).get("risk_level") == "medium"
                            else "#38bdf8",
                        },
                    }
                    for f in flood.get("risk_zones_geojson", {}).get("features", [])
                    if f.get("properties", {}).get("risk_level") in ("high", "medium")
                ][:140],
            },
            "recommendations": [
                "Desilt Vrishabhavathi, Hebbal, and Bellandur–Varthur storm-water drains ahead of >50 mm forecast rain.",
                "Operate lake weir sluice buffers preventively and stage dewatering pumps at Koramangala & ORR underpasses.",
            ],
            "honest_label": "Model prediction (unvalidated local runoff calibration)",
        },
        "urban_growth": {
            "id": "urban_growth",
            "name": "Urban Growth Prediction",
            "route": "/urban",
            "data_used": [
                "Multi-year dry-season Sentinel-2 L2A imagery (2019, 2022, 2024, 2026)",
                "10m UTM 43N NDBI built-up, BSI bare soil & NDVI vegetation indices",
                "Remaining non-built developable open land per corridor",
            ],
            "ai_model_analysis": (
                f"Multi-date spectral change classifier + capacity-damped logistic growth projection across {urban_sum.get('total_corridors', 10)} corridors."
            ),
            "current_condition": (
                f"+{urban_sum.get('measured_new_urban_ha', 0)} ha new built-up area, "
                f"{urban_sum.get('measured_active_construction_ha', 0)} ha active construction, and -{urban_sum.get('measured_veg_loss_ha', 0)} ha green cover loss (2019–2026)."
            ),
            "future_prediction": (
                f"Estimated +{urban_sum.get('projected_additional_urban_ha', 0)} ha urban infill by {urban_sum.get('target_year', 2031)} "
                "(Statistical estimate from historical trend — not guaranteed)."
            ),
            "risk_breakdown": {
                "high": sum(1 for c in urban_corr if c.get("growth_tier") == "Fast-Growing Hotspot"),
                "medium": sum(1 for c in urban_corr if c.get("growth_tier") == "Moderate Expansion"),
                "low": sum(1 for c in urban_corr if c.get("growth_tier") == "Stable Core"),
            },
            "chart_series": [
                {
                    "name": c["name"].split("–")[0].strip()[:14],
                    "current": round(float(c.get("new_urban_ha", 0)), 1),
                    "future": round(float(c.get("projected_added_ha", 0)), 1),
                    "risk_level": _norm_risk(float(c.get("growth_pressure_score", 0)), 62.0, 42.0),
                }
                for c in urban_corr[:8]
            ],
            "map_items": [
                {
                    "id": c["id"],
                    "name": c["name"],
                    "lat": float(c["lat"]),
                    "lon": float(c["lon"]),
                    "risk_level": _norm_risk(float(c.get("growth_pressure_score", 0)), 62.0, 42.0),
                    "risk_score": float(c.get("growth_pressure_score", 50.0)),
                    "summary": f"+{c['new_urban_ha']:.1f} ha urban · {c['active_construction_ha']:.1f} ha constr · +{c['projected_added_ha']:.1f} ha est.",
                }
                for c in urban_corr
            ],
            "geojson": {
                "type": "FeatureCollection",
                "features": [
                    {
                        **f,
                        "properties": {
                            **f.get("properties", {}),
                            "engine_color": "#fbbf24"
                            if f.get("properties", {}).get("layer_kind") == "construction"
                            else "#e879f9"
                            if f.get("properties", {}).get("layer_kind") == "veg_loss"
                            else "#f97316",
                        },
                    }
                    for f in urban.get("geojson", {}).get("features", [])
                ][:140],
            },
            "recommendations": [
                "Expand arterial/Metro feeder roads, stormwater drains, and Cauvery/UGD pipelines in Varthur, Whitefield, Kengeri & Yelahanka.",
                "Protect remaining peri-urban tree belts before greenfield plots convert cleanly.",
            ],
            "honest_label": "Estimated projection from 2019–2026 Sentinel-2 trend (not guaranteed)",
        },
        "heat": {
            "id": "heat",
            "name": "Heat Risk Prediction",
            "route": "/heat",
            "data_used": [
                "Landsat 8/9 C2-L2 Thermal Band lwir11 Surface Temperature (2019–2026)",
                "Landsat 30m NDVI green cover loss & qa_pixel cloud mask",
                "Open-Meteo 2m station air temperature benchmark",
            ],
            "ai_model_analysis": (
                f"Calibrated Kelvin-to-Celsius LST retrieval + UHI canopy anomaly & OLS/vegetation-loss trend projection across {heat_sum.get('total_zones', 10)} zones."
            ),
            "current_condition": (
                f"City mean LST {heat_sum.get('city_mean_lst_2026_c', 0)} °C (Station air {heat['air_temp_benchmark']['acq_day_max_air_temp_c']} °C); "
                f"hottest zone {heat_sum.get('hottest_zone_name', '')} (+{heat_sum.get('max_uhi_spread_c', 0)} °C UHI spread)."
            ),
            "future_prediction": (
                f"{heat_sum.get('severe_hotspot_count', 0)} Severe Heat Hotspots projected to warm further by {heat_sum.get('target_year', 2031)} "
                f"unless {heat_sum.get('total_plantation_target_ha', 0)} ha of low-NDVI zones gain canopy (Estimate only)."
            ),
            "risk_breakdown": {
                "high": sum(1 for z in heat_zones if z.get("heat_tier") == "Severe Heat Hotspot"),
                "medium": sum(1 for z in heat_zones if z.get("heat_tier") == "Moderate Heat Stress"),
                "low": sum(1 for z in heat_zones if z.get("heat_tier") == "Cooler Canopy Zone"),
            },
            "chart_series": [
                {
                    "name": z["name"].split("–")[0].strip()[:14],
                    "current": round(float(z.get("mean_lst_2026_c", 0)), 1),
                    "future": round(float(z.get("projected_lst_c", 0)), 1),
                    "risk_level": _norm_risk(float(z.get("heat_score", 0)), 62.0, 35.0),
                }
                for z in heat_zones[:8]
            ],
            "map_items": [
                {
                    "id": z["id"],
                    "name": z["name"],
                    "lat": float(z["lat"]),
                    "lon": float(z["lon"]),
                    "risk_level": _norm_risk(float(z.get("heat_score", 0)), 62.0, 35.0),
                    "risk_score": float(z.get("heat_score", 50.0)),
                    "summary": f"LST {z['mean_lst_2026_c']:.1f} °C (+{z['heat_island_anomaly_c']:.1f} °C) · {z['plantation_target_ha']:.1f} ha tree need",
                }
                for z in heat_zones
            ],
            "geojson": {
                "type": "FeatureCollection",
                "features": [
                    {
                        **f,
                        "properties": {
                            **f.get("properties", {}),
                            "engine_color": "#72ff9e"
                            if f.get("properties", {}).get("layer_kind") == "plantation_priority"
                            else "#f97316",
                        },
                    }
                    for f in heat.get("geojson", {}).get("features", [])
                    if f.get("properties", {}).get("layer_kind") in ("heat_hotspot", "plantation_priority")
                ][:140],
            },
            "recommendations": [
                "Target avenue tree plantation & Miyawaki pocket parks in Peenya, Electronic City, Varthur, and Whitefield.",
                "Apply high-albedo cool roofs over industrial sheds & concrete heat islands (Surface LST != shaded Air Temp).",
            ],
            "honest_label": "Satellite LST (°C) != shaded air temperature; projections are estimates",
        },
        "lake_health": {
            "id": "lake_health",
            "name": "Lake Health Prediction",
            "route": "/lakes",
            "data_used": [
                "Multi-date Sentinel-2 L2A scenes (2024-03-13, 2025-03-15, 2026-11-23)",
                "NDWI & MNDWI open-water indices + 250m shoreline buffer NDBI & NDVI",
            ],
            "ai_model_analysis": (
                f"Automated boundary change tracking + shoreline buffer disturbance & weed/shrinkage risk scoring across {lake_sum.get('total_lakes_monitored', 8)} major lakes."
            ),
            "current_condition": (
                f"Total water spread {lake_sum.get('total_water_before_ha', 0)} -> {lake_sum.get('total_water_after_ha', 0)} ha; "
                f"{lake_sum.get('shrinking_lakes_count', 0)} shrinking lakes; {lake_sum.get('total_buffer_construction_ha', 0)} ha buffer built-up shift."
            ),
            "future_prediction": (
                f"{lake_sum.get('immediate_attention_count', 0)} lakes flagged for high boundary/silt pressure needing preventive survey to avoid monsoon capacity loss."
            ),
            "risk_breakdown": {
                "high": sum(1 for l in lake_items if l.get("priority") == "high"),
                "medium": sum(1 for l in lake_items if l.get("priority") == "medium"),
                "low": sum(1 for l in lake_items if l.get("priority") == "low"),
            },
            "chart_series": [
                {
                    "name": l["name"].replace(" Lake", "")[:14],
                    "current": round(float(l.get("water_before_ha", 0)), 1),
                    "future": round(float(l.get("water_after_ha", 0)), 1),
                    "risk_level": str(l.get("priority", "medium")).capitalize(),
                }
                for l in lake_items
            ],
            "map_items": [
                {
                    "id": l["id"],
                    "name": l["name"],
                    "lat": float(l["lat"]),
                    "lon": float(l["lon"]),
                    "risk_level": str(l.get("priority", "medium")).capitalize(),
                    "risk_score": 85.0 if l.get("priority") == "high" else 55.0 if l.get("priority") == "medium" else 25.0,
                    "summary": f"Water {l['water_before_ha']:.1f}->{l['water_after_ha']:.1f} ha · Buffer shift {l['buffer_construction_ha']:.1f} ha",
                }
                for l in lake_items
            ],
            "geojson": {
                "type": "FeatureCollection",
                "features": [
                    {
                        **f,
                        "properties": {
                            **f.get("properties", {}),
                            "engine_color": "#fbbf24"
                            if f.get("properties", {}).get("layer_kind") == "buffer_change"
                            else "#38bdf8",
                        },
                    }
                    for f in lakes.get("geojson", {}).get("features", [])
                    if f.get("properties", {}).get("layer_kind") in ("water_after", "buffer_change")
                ][:140],
            },
            "recommendations": [
                "Conduct official revenue/CDS survey checks on Bellandur & Varthur 250 m buffer shift polygons before classifying encroachment.",
                "Clear Madiwala & Hebbal inlet silt/aquatic weeds to restore stormwater holding volume.",
            ],
            "honest_label": "Possible encroachment/boundary shifts require official survey verification",
        },
    }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "honesty_notice": ENGINE_HONESTY_NOTICE,
        "parameters": {"rainfall_mm": rainfall_mm, "horizon_years": horizon_years, "target_year": 2026 + horizon_years},
        "focus_locations": focus_locations,
        "modules": modules,
    }
