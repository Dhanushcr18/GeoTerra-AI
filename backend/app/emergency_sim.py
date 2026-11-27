"""Digital-twin Satellite -> HAPS -> Drone emergency response simulation grounded in Bengaluru GeoTerra AI data."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from backend.app import config

SIM_NOTICE = (
    "DIGITAL TWIN SIMULATION ONLY — Satellite passes, HAPS relays, drone telemetry, and aerial captures are "
    "simulated using real Bengaluru hazard detections. No real satellites, HAPS platforms, or UAVs are controlled."
)


def _safe_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def get_bengaluru_missions() -> Dict[str, Any]:
    """Build actionable Bengaluru emergency response simulation scenarios from real GeoTerra AI hazard layers."""
    pred = _safe_json(config.DATA_DIR / "bengaluru_prediction.json")
    infra = _safe_json(config.DATA_DIR / "infrastructure_protection.json")
    lakes = _safe_json(config.DATA_DIR / "lake_monitoring.json")

    wards = {w["name"]: w for w in pred.get("wards", [])}
    assets = {a["id"]: a for a in infra.get("assets", [])}
    lake_map = {l["id"]: l for l in lakes.get("lakes", [])}

    bell_ward = wards.get("Bellandur", {})
    ecospace = assets.get("orr_ecospace_corridor", {})
    bell_lake = lake_map.get("bellandur", {})
    nayan_ward = wards.get("Vrishabhavathi / Nayandahalli", {})
    varthur_lake = lake_map.get("varthur", {})

    missions: List[Dict[str, Any]] = [
        {
            "id": "bellandur_flood_response",
            "title": "Bellandur – Ecospace ORR Flood Emergency",
            "hazard_type": "FLOOD EMERGENCY",
            "severity": "CRITICAL",
            "trigger_source": "Sentinel-1 SAR + Copernicus DEM Susceptibility + Infra Risk Screen",
            "auto_alert": {
                "alert_id": "SIM-ALERT-BLR-01",
                "headline": "AI Satellite Anomaly: Flash Flood Exposure at Bellandur – Ecospace ORR",
                "metrics_summary": (
                    f"Flood risk score {bell_ward.get('risk_score', 70.9)}/100; "
                    f"{ecospace.get('nearby_roads_km', 4.5)} km arterial roads & "
                    f"{bell_ward.get('osm_buildings_in_zone', 180)} buildings in zone; "
                    f"Bellandur buffer change {bell_lake.get('buffer_construction_ha', 24.66)} ha."
                ),
            },
            "satellite_track": [[13.16, 77.45], [13.06, 77.56], [12.9278, 77.6762], [12.82, 77.78]],
            "haps_station": {"name": "BLR-HAPS-STRATO-01", "lat": 12.985, "lon": 77.615, "altitude_km": 20.0},
            "drone_hub": {"name": "HAL-Jakkur Simulated UAV Base", "lat": 13.005, "lon": 77.638},
            "target": {"name": "Outer Ring Rd – Bellandur Ecospace", "lat": 12.9278, "lon": 77.6762},
            "drone_waypoints": [
                [13.0050, 77.6380],
                [12.9820, 77.6480],
                [12.9580, 77.6600],
                [12.9390, 77.6705],
                [12.9278, 77.6762],
            ],
            "simulated_captures": [
                {
                    "label": "Simulated Aerial Flood & Infrastructure Buffer View",
                    "image_url": "/api/images/infra/orr_ecospace_corridor_risk.png",
                    "caption": "SIMULATED DRONE PREVIEW (derived from Sentinel-2 + risk overlay) — Standing water & buffer disturbance",
                },
                {
                    "label": "Simulated Lake Weir & Overflow Check",
                    "image_url": "/api/images/lakes/bellandur_overlay.png",
                    "caption": "SIMULATED DRONE PREVIEW (derived from Sentinel-2 Bellandur Lake mask) — Shoreline check",
                },
            ],
            "drone_findings": {
                "distance_km": 9.6,
                "flight_duration_min": 10.7,
                "water_depth_est_m": 0.65,
                "road_corridors_blocked": ["ORR Service Rd (Ecospace Gate)", "Bellandur Kodi Weir Approach"],
                "immediate_attention_areas": [
                    "Ecospace Underpass & Storm Culvert Inlet",
                    "Bellandur Lake North-East Sluice Approach",
                    "Yemalur Low-Lying Access Road",
                ],
                "recommended_actions": [
                    "Deploy mobile BBMP dewatering pumps at Ecospace ORR service lane.",
                    "Open Bellandur weir surplus sluice gate & clear debris screen.",
                    "Divert heavy transit off low-lying ORR service roads (advisory).",
                ],
            },
        },
        {
            "id": "nayandahalli_culvert_surge",
            "title": "Nayandahalli – Vrishabhavathi Drain Surge",
            "hazard_type": "URBAN DRAINAGE SURGE",
            "severity": "HIGH",
            "trigger_source": "Copernicus DEM Depression Basin + Sentinel-1 Valley Signal",
            "auto_alert": {
                "alert_id": "SIM-ALERT-BLR-02",
                "headline": "AI Satellite Anomaly: Storm Culvert Bottleneck at Nayandahalli Underpass",
                "metrics_summary": (
                    f"Depression basin {nayan_ward.get('depression_m', 9.2)} m; "
                    f"risk score {nayan_ward.get('risk_score', 76.4)}/100; "
                    f"{nayan_ward.get('osm_roads_in_zone_km', 14.5)} km valley road exposure."
                ),
            },
            "satellite_track": [[13.15, 77.42], [13.02, 77.49], [12.9422, 77.5236], [12.83, 77.60]],
            "haps_station": {"name": "BLR-HAPS-STRATO-01", "lat": 12.975, "lon": 77.565, "altitude_km": 20.0},
            "drone_hub": {"name": "Bengaluru West Simulated UAV Pad", "lat": 12.998, "lon": 77.552},
            "target": {"name": "Nayandahalli Flyover & Drain Crossing", "lat": 12.9422, "lon": 77.5236},
            "drone_waypoints": [
                [12.9980, 77.5520],
                [12.9810, 77.5425],
                [12.9620, 77.5330],
                [12.9500, 77.5270],
                [12.9422, 77.5236],
            ],
            "simulated_captures": [
                {
                    "label": "Simulated Drain Crossing Reconnaissance",
                    "image_url": "/api/images/infra/nayandahalli_underpass_risk.png",
                    "caption": "SIMULATED DRONE PREVIEW (derived from Sentinel-2 buffer overlay) — Culvert approach",
                },
                {
                    "label": "Simulated Catchment Thermal / SAR Context",
                    "image_url": "/api/images/flood_overlay.png",
                    "caption": "SIMULATED DRONE / SAR OVERLAY PREVIEW — Valley depression extent",
                },
            ],
            "drone_findings": {
                "distance_km": 6.9,
                "flight_duration_min": 7.8,
                "water_depth_est_m": 0.55,
                "road_corridors_blocked": ["Mysore Rd Nayandahalli Underpass", "Vrishabhavathi Parallel Rd"],
                "immediate_attention_areas": [
                    "Mysore Rd Culvert Trash Rack",
                    "Rajarajeshwari Nagar Gate Low Dip",
                    "Namma Metro Pillar Drainage Sump",
                ],
                "recommended_actions": [
                    "Clear floating plastic/silt blockage at Vrishabhavathi culvert grating.",
                    "Close underpass vehicle entry barriers ahead of runoff peak.",
                    "Alert BBMP South-West flood rapid response unit.",
                ],
            },
        },
        {
            "id": "varthur_lake_overflow",
            "title": "Varthur Lake & Panathur Road Breach Watch",
            "hazard_type": "LAKE OVERFLOW & BUFFER SHIFT",
            "severity": "HIGH",
            "trigger_source": "Sentinel-2 Multi-Date Lake Mask + Urban Expansion Buffer Alert",
            "auto_alert": {
                "alert_id": "SIM-ALERT-BLR-03",
                "headline": "AI Satellite Anomaly: Varthur Lake Spillway & Panathur Buffer Exposure",
                "metrics_summary": (
                    f"Varthur water spread {varthur_lake.get('water_after_ha', 90.65)} ha; "
                    f"buffer construction shift {varthur_lake.get('buffer_construction_ha', 19.34)} ha."
                ),
            },
            "satellite_track": [[13.15, 77.65], [13.04, 77.70], [12.9438, 77.7375], [12.83, 77.78]],
            "haps_station": {"name": "BLR-HAPS-STRATO-02", "lat": 12.978, "lon": 77.690, "altitude_km": 20.0},
            "drone_hub": {"name": "Whitefield Simulated UAV Node", "lat": 12.988, "lon": 77.742},
            "target": {"name": "Varthur Lake Spillway & Panathur Link", "lat": 12.9438, "lon": 77.7375},
            "drone_waypoints": [
                [12.9880, 77.7420],
                [12.9750, 77.7410],
                [12.9630, 77.7395],
                [12.9520, 77.7385],
                [12.9438, 77.7375],
            ],
            "simulated_captures": [
                {
                    "label": "Simulated Varthur Shoreline Inspection",
                    "image_url": "/api/images/lakes/varthur_overlay.png",
                    "caption": "SIMULATED DRONE PREVIEW (derived from Sentinel-2 Varthur change mask)",
                },
                {
                    "label": "Simulated Panathur Fringe Encroachment Check",
                    "image_url": "/api/images/urban/varthur_panathur_change.png",
                    "caption": "SIMULATED DRONE PREVIEW (derived from Sentinel-2 2019-2026 infill mask)",
                },
            ],
            "drone_findings": {
                "distance_km": 5.1,
                "flight_duration_min": 5.9,
                "water_depth_est_m": 0.45,
                "road_corridors_blocked": ["Panathur Railway Underpass", "Varthur Kodi Bund Road"],
                "immediate_attention_areas": [
                    "Varthur South-East Bund Embankment",
                    "Panathur S-Cross Drainage Inlet",
                    "Gunjur Feeder Canal Boundary",
                ],
                "recommended_actions": [
                    "Inspect Varthur lake bund integrity & clear Panathur canal silt.",
                    "Coordinate revenue survey verification for adjacent earthworks.",
                    "Issue local commuter detour notice for Panathur underpass.",
                ],
            },
        },
        {
            "id": "peenya_heat_power_alert",
            "title": "Peenya Industrial Heat & Grid Cooling Alert",
            "hazard_type": "EXTREME SURFACE HEAT & POWER CORRIDOR",
            "severity": "MEDIUM",
            "trigger_source": "Landsat 8/9 Band 10 LST + KPTCL 220 kV Substation Screen",
            "auto_alert": {
                "alert_id": "SIM-ALERT-BLR-04",
                "headline": "AI Satellite Anomaly: Severe Surface Thermal Stress at Peenya 220 kV Substation",
                "metrics_summary": "Landsat LST +1.95 °C above green baseline (31.48 °C Feb morning LST); 32.76 ha zero-canopy target area.",
            },
            "satellite_track": [[13.18, 77.47], [13.09, 77.50], [13.0305, 77.5192], [12.90, 77.56]],
            "haps_station": {"name": "BLR-HAPS-STRATO-01", "lat": 13.005, "lon": 77.555, "altitude_km": 20.0},
            "drone_hub": {"name": "Yelahanka Simulated Thermal UAV Pad", "lat": 13.095, "lon": 77.575},
            "target": {"name": "Peenya 220 kV Substation & Estate", "lat": 13.0305, "lon": 77.5192},
            "drone_waypoints": [
                [13.0950, 77.5750],
                [13.0780, 77.5610],
                [13.0610, 77.5470],
                [13.0450, 77.5320],
                [13.0305, 77.5192],
            ],
            "simulated_captures": [
                {
                    "label": "Simulated Thermal Hotspot Radiometry",
                    "image_url": "/api/images/heat/peenya_industrial_lst_2026.png",
                    "caption": "SIMULATED DRONE THERMAL PREVIEW (derived from Landsat 8 Band 10 LST)",
                },
                {
                    "label": "Simulated Substation Cooling Buffer Check",
                    "image_url": "/api/images/infra/power_peenya_220kv_risk.png",
                    "caption": "SIMULATED DRONE PREVIEW (derived from Sentinel-2 substation buffer)",
                },
            ],
            "drone_findings": {
                "distance_km": 9.4,
                "flight_duration_min": 10.2,
                "water_depth_est_m": 0.0,
                "road_corridors_blocked": [],
                "immediate_attention_areas": [
                    "220 kV Transformer Cooling Yard",
                    "Peenya 2nd Stage Industrial Shed Roofs",
                    "Zero-Canopy Freight Asphalt Spine",
                ],
                "recommended_actions": [
                    "Perform infrared load check on 220 kV transformer banks during afternoon peak.",
                    "Prioritize cool-roof coatings & worker hydration shade kiosks.",
                    "Target 32.8 ha industrial setback greenbelt plantation.",
                ],
            },
        },
    ]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "simulation_notice": SIM_NOTICE,
        "missions": missions,
    }
