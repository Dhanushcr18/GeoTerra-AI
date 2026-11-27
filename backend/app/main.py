"""GeoTerra AI FastAPI application entrypoint."""

from __future__ import annotations

import io
import json
from pathlib import Path
from typing import Any, Dict, Literal

import numpy as np
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
from pydantic import ValidationError

from backend.app import (
    config,
    emergency_sim,
    flood_prediction,
    infrastructure_protection,
    lake_monitoring,
    nim_client,
    prediction_engine,
    report,
    urban_expansion,
    urban_heat,
)
from backend.app.schemas import (
    AIResponse,
    AlertRequest,
    AskRequest,
    DerivedMetrics,
    DescribeSiteRequest,
    FloodPredictExplainRequest,
    HeatExplainRequest,
    InfrastructureExplainRequest,
    LakeExplainRequest,
    PredictionEngineExplainRequest,
    ResultsPayload,
    ResultsResponse,
    SimulationExplainRequest,
    TriageRequest,
    TriageResponse,
    UrbanExplainRequest,
)

app = FastAPI(
    title="GeoTerra AI API",
    version="1.0.0",
    description="Protective satellite flood monitoring, impact calculation, and NVIDIA NIM advisory API.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEO_FILES = {
    "flood_extent": "flood_extent.geojson",
    "assets": "assets.geojson",
    "change": "change_polygons.geojson",
    "aoi": "aoi.geojson",
}


def _load_results() -> ResultsPayload:
    path = config.DATA_DIR / "results.json"
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail="backend/data/results.json not found. Run scripts/generate_sample_data.py or export real ML outputs.",
        )
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return ResultsPayload.model_validate(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"Malformed JSON in results.json: {exc}") from exc
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=f"results.json failed schema validation: {exc}") from exc


def compute_derived_metrics(results: ResultsPayload) -> DerivedMetrics:
    est_loss = round(results.flood.cropland_affected_ha * results.economics.loss_per_ha_inr, 2)
    manual_hrs = round(results.economics.assessment_time_manual_days * 24.0, 2)
    geo_hrs = max(results.economics.assessment_time_geoterra_hours, 0.01)
    time_saved = round(max(manual_hrs - geo_hrs, 0.0), 2)
    speedup = round(manual_hrs / geo_hrs, 1)

    raw_kb = results.onboard_sim.raw_scene_size_mb * 1024.0
    pkt_kb = max(results.onboard_sim.insight_packet_size_kb, 0.1)
    compression = round(raw_kb / pkt_kb, 1)

    rate_mbps = max(results.onboard_sim.downlink_rate_mbps, 0.1)
    raw_bits = results.onboard_sim.raw_scene_size_mb * 8.0
    pkt_mb = results.onboard_sim.insight_packet_size_kb / 1024.0
    raw_sec = round(raw_bits / rate_mbps, 2)
    pkt_sec = round((pkt_mb * 8.0) / rate_mbps, 4)

    return DerivedMetrics(
        estimated_cropland_loss_inr=est_loss,
        manual_assessment_hours=manual_hrs,
        time_saved_hours=time_saved,
        time_speedup_factor=speedup,
        compression_ratio=compression,
        raw_downlink_seconds=raw_sec,
        packet_downlink_seconds=pkt_sec,
    )


@app.get("/api/status")
def get_status() -> Dict[str, Any]:
    """Return service health, sample-data flag, AI live/cached readiness, and assumptions."""
    results_exists = (config.DATA_DIR / "results.json").exists()
    is_sample = True
    if results_exists:
        try:
            is_sample = _load_results().sample
        except HTTPException:
            pass
    api_key = config.get_nvidia_api_key()
    nim_live_ready = bool(api_key) and not config.is_offline_only()
    return {
        "status": "ok",
        "data_ready": results_exists,
        "sample": is_sample,
        "ai_mode": "live" if nim_live_ready else "cached",
        "nim_configured": bool(api_key),
        "assumptions": config.ASSUMPTIONS.to_dict(),
    }


@app.get("/api/results", response_model=ResultsResponse)
def get_results() -> ResultsResponse:
    """Return validated pipeline results, backend-derived economics/sim figures, and assumptions."""
    results = _load_results()
    derived = compute_derived_metrics(results)
    return ResultsResponse(
        results=results,
        derived=derived,
        assumptions=config.ASSUMPTIONS.to_dict(),
    )


@app.get("/api/geo/{layer}")
def get_geo_layer(layer: str) -> Dict[str, Any]:
    """Return GeoJSON FeatureCollection for flood_extent, assets, change, or aoi."""
    if layer not in GEO_FILES:
        raise HTTPException(status_code=404, detail=f"Unknown geo layer '{layer}'. Expected one of {list(GEO_FILES.keys())}.")
    path = config.DATA_DIR / GEO_FILES[layer]
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"GeoJSON file '{path.name}' not found.")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"Malformed GeoJSON in '{path.name}': {exc}") from exc


def _get_layer_bbox(kind: Literal["flood", "change"]) -> tuple[float, float, float, float]:
    """Resolve (min_lon, min_lat, max_lon, max_lat) for flood AOI or Sentinel-2 change site."""
    if kind == "flood":
        aoi_path = config.DATA_DIR / "aoi.geojson"
        if aoi_path.exists():
            data = json.loads(aoi_path.read_text(encoding="utf-8"))
            coords = data["features"][0]["geometry"]["coordinates"][0]
            lons = [float(p[0]) for p in coords]
            lats = [float(p[1]) for p in coords]
            return min(lons), min(lats), max(lons), max(lats)
        return (77.55, 12.85, 77.78, 13.06)

    # Default CHANGE_AOI_BBOX from ml/config.py (77.52, 13.04, 77.66, 13.15)
    return (77.52, 13.04, 77.66, 13.15)


@app.get("/api/images/crop")
def get_cropped_image(
    name: str,
    lat: float = Query(...),
    lon: float = Query(...),
    kind: Literal["flood", "change"] = Query("change"),
    zoom: float = Query(3.2, ge=1.2, le=8.0),
    mark: bool = Query(True),
) -> Response:
    """Return a zoomed PNG crop centered on (lat, lon) within the satellite preview raster."""
    safe_name = Path(name).name
    path = config.IMAGES_DIR / safe_name
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Image '{safe_name}' not found.")

    with Image.open(path) as im:
        rgb = im.convert("RGB")
        arr = np.array(rgb)
        # Trim matplotlib dark border/title (#0b1220) if present
        bg = np.array([11, 18, 32])
        fg_mask = np.any(np.abs(arr.astype(np.int16) - bg) > 5, axis=-1)
        if arr.shape[0] > 60 and not fg_mask[2, 2]:
            fg_mask[:44, :] = False
            ys, xs = np.where(fg_mask)
            if len(xs) > 100 and len(ys) > 100:
                rgb = rgb.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))

        w, h = rgb.size
        min_lon, min_lat, max_lon, max_lat = _get_layer_bbox(kind)
        u = min(max((lon - min_lon) / max(max_lon - min_lon, 1e-6), 0.0), 1.0)
        v = min(max((max_lat - lat) / max(max_lat - min_lat, 1e-6), 0.0), 1.0)

        target_x = u * w
        target_y = v * h

        eff_zoom = min(float(zoom), 2.1)
        crop_w = max(80.0, w / eff_zoom)
        crop_h = max(80.0, h / eff_zoom)

        left = min(max(target_x - crop_w / 2.0, 0.0), max(w - crop_w, 0.0))
        top = min(max(target_y - crop_h / 2.0, 0.0), max(h - crop_h, 0.0))
        right = min(left + crop_w, float(w))
        bottom = min(top + crop_h, float(h))

        cropped = rgb.crop((int(round(left)), int(round(top)), int(round(right)), int(round(bottom))))
        out_size = 840
        resized = cropped.resize((out_size, out_size), Image.Resampling.LANCZOS)
        resized = ImageEnhance.Contrast(resized).enhance(1.16)
        resized = resized.filter(ImageFilter.UnsharpMask(radius=1.25, percent=145, threshold=2))

        if mark:
            px = ((target_x - left) / max(right - left, 1.0)) * out_size
            py = ((target_y - top) / max(bottom - top, 1.0)) * out_size
            draw = ImageDraw.Draw(resized)
            r = 22
            draw.ellipse([px - r, py - r, px + r, py + r], outline=(251, 191, 36), width=3)
            draw.line([px - r - 10, py, px - 6, py], fill=(251, 191, 36), width=2)
            draw.line([px + 6, py, px + r + 10, py], fill=(251, 191, 36), width=2)
            draw.line([px, py - r - 10, px, py - 6], fill=(251, 191, 36), width=2)
            draw.line([px, py + 6, px, py + r + 10], fill=(251, 191, 36), width=2)

        buf = io.BytesIO()
        resized.save(buf, format="PNG")
        return Response(content=buf.getvalue(), media_type="image/png")


@app.get("/api/images/lakes/{name}")
def get_lake_image(name: str) -> FileResponse:
    """Serve per-lake Sentinel-2 RGB and boundary-change PNG cutouts."""
    safe_name = Path(name).name
    path = config.IMAGES_DIR / "lakes" / safe_name
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Lake image '{safe_name}' not found.")
    return FileResponse(path, media_type="image/png")


@app.get("/api/images/urban/{name}")
def get_urban_image(name: str) -> FileResponse:
    """Serve multi-year Sentinel-2 urban expansion RGB and overlay PNG cutouts."""
    safe_name = Path(name).name
    path = config.IMAGES_DIR / "urban" / safe_name
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Urban image '{safe_name}' not found.")
    return FileResponse(path, media_type="image/png")


@app.get("/api/images/heat/{name}")
def get_heat_image(name: str) -> FileResponse:
    """Serve Landsat thermal LST and green-cooling priority PNG maps."""
    safe_name = Path(name).name
    path = config.IMAGES_DIR / "heat" / safe_name
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Heat image '{safe_name}' not found.")
    return FileResponse(path, media_type="image/png")


@app.get("/api/images/infra/{name}")
def get_infra_image(name: str) -> FileResponse:
    """Serve Sentinel-2 buffer comparison PNG maps around critical infrastructure assets."""
    safe_name = Path(name).name
    path = config.IMAGES_DIR / "infra" / safe_name
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Infrastructure image '{safe_name}' not found.")
    return FileResponse(path, media_type="image/png")


@app.get("/api/images/{name}")
def get_image(name: str) -> FileResponse:
    """Serve satellite before/after PNG previews safely from backend/data/images/."""
    safe_name = Path(name).name
    path = config.IMAGES_DIR / safe_name
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Image '{safe_name}' not found.")
    return FileResponse(path, media_type="image/png")


@app.get("/api/scenes")
def get_scenes() -> Any:
    """Return Sentinel-1 Planetary Computer scene catalog."""
    path = config.DATA_DIR / "scenes.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="scenes.json not found.")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"Malformed scenes.json: {exc}") from exc


@app.get("/api/model")
def get_model() -> Dict[str, Any]:
    """Return model_card.json and training_log.json."""
    card_path = config.DATA_DIR / "model_card.json"
    log_path = config.DATA_DIR / "training_log.json"
    if not card_path.exists() or not log_path.exists():
        raise HTTPException(status_code=404, detail="model_card.json or training_log.json not found.")
    try:
        return {
            "model_card": json.loads(card_path.read_text(encoding="utf-8")),
            "training_log": json.loads(log_path.read_text(encoding="utf-8")),
        }
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"Malformed model JSON: {exc}") from exc


@app.post("/api/ai/alert", response_model=AIResponse)
def post_ai_alert(req: AlertRequest) -> AIResponse:
    results = _load_results()
    derived = compute_derived_metrics(results)
    res = nim_client.generate_authority_alert(results, derived, req.authority, req.focus, demo_mode=req.demo_mode)
    return AIResponse(**res)


@app.post("/api/ai/describe-site", response_model=AIResponse)
def post_ai_describe_site(req: DescribeSiteRequest) -> AIResponse:
    results = _load_results()
    res = nim_client.describe_site_tiles(
        results, req.before_image, req.after_image, polygon_id=req.polygon_id, demo_mode=req.demo_mode
    )
    return AIResponse(**res)


@app.post("/api/ai/triage", response_model=TriageResponse)
def post_ai_triage(req: TriageRequest) -> TriageResponse:
    results = _load_results()
    res = nim_client.triage_flagged_sites(results, demo_mode=req.demo_mode)
    return TriageResponse(**res)


@app.post("/api/ai/ask", response_model=AIResponse)
def post_ai_ask(req: AskRequest) -> AIResponse:
    results = _load_results()
    derived = compute_derived_metrics(results)
    res = nim_client.answer_grounded_question(req.question, results, derived, demo_mode=req.demo_mode)
    return AIResponse(**res)


@app.post("/api/report/pdf")
def post_report_pdf(demo_mode: bool = False, mission_id: str | None = None) -> Response:
    """Generate and return a downloadable Evidence Report PDF with predictions and simulated drone evidence."""
    results = _load_results()
    derived = compute_derived_metrics(results)
    ai_summary = nim_client.generate_authority_alert(
        results,
        derived,
        authority="Karnataka State Disaster Management Authority (KSDMA)",
        demo_mode=demo_mode,
    )
    card_path = config.DATA_DIR / "model_card.json"
    model_card = json.loads(card_path.read_text(encoding="utf-8")) if card_path.exists() else None
    eng_data = prediction_engine.build_unified_engine()
    mis_data = emergency_sim.get_bengaluru_missions()
    pdf_bytes = report.build_evidence_report_pdf(
        results,
        derived,
        ai_summary,
        model_card=model_card,
        engine_data=eng_data,
        missions_data=mis_data,
        mission_id=mission_id,
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="GeoTerra_Evidence_Report.pdf"'},
    )


@app.get("/api/flood-prediction")
def get_flood_prediction(
    rainfall_mm: float = Query(default=65.0, ge=0.0, le=250.0),
    refresh: bool = Query(default=False),
) -> Dict[str, Any]:
    """Return real DEM + lake/drainage + Open-Meteo rainfall Bengaluru flood susceptibility scenario."""
    return flood_prediction.evaluate_rainfall_scenario(rainfall_24h_mm=rainfall_mm, force_refresh=refresh)


@app.post("/api/flood-prediction/explain", response_model=AIResponse)
def explain_flood_prediction(req: FloodPredictExplainRequest) -> AIResponse:
    """Use NVIDIA NIM to explain Bengaluru ward/zone flood risk and recommend protective actions."""
    pred = flood_prediction.evaluate_rainfall_scenario(rainfall_24h_mm=req.rainfall_24h_mm)
    res = nim_client.explain_bengaluru_flood_risk(
        prediction_data=pred,
        area_name=req.area_name,
        question=req.question,
        demo_mode=req.demo_mode,
    )
    return AIResponse(**res)


@app.get("/api/lake-monitoring")
def get_lake_monitoring(refresh: bool = Query(default=False)) -> Dict[str, Any]:
    """Return multi-date Sentinel-2 Bengaluru lake spread, shrinkage, and 250m buffer change metrics."""
    return lake_monitoring.build_or_load_lakes(force_refresh=refresh)


@app.post("/api/lake-monitoring/explain", response_model=AIResponse)
def explain_lake_monitoring(req: LakeExplainRequest) -> AIResponse:
    """Use NVIDIA NIM to explain lake boundary/buffer shifts and recommend inspection priorities."""
    data = lake_monitoring.build_or_load_lakes()
    res = nim_client.explain_bengaluru_lake_change(
        lake_data=data,
        lake_id=req.lake_id,
        question=req.question,
        demo_mode=req.demo_mode,
    )
    return AIResponse(**res)


@app.get("/api/urban-expansion")
def get_urban_expansion(
    horizon_years: int = Query(default=5, ge=1, le=10),
    refresh: bool = Query(default=False),
) -> Dict[str, Any]:
    """Return multi-year 2019-2026 Sentinel-2 Bengaluru urban growth metrics & estimated horizon projections."""
    return urban_expansion.evaluate_urban_horizon(horizon_years=horizon_years, force_refresh=refresh)


@app.post("/api/urban-expansion/explain", response_model=AIResponse)
def explain_urban_expansion(req: UrbanExplainRequest) -> AIResponse:
    """Use NVIDIA NIM to explain ward urban expansion and recommend road/drainage/water infrastructure upgrades."""
    data = urban_expansion.evaluate_urban_horizon(horizon_years=req.horizon_years)
    res = nim_client.explain_bengaluru_urban_growth(
        urban_data=data,
        corridor_id=req.corridor_id,
        question=req.question,
        demo_mode=req.demo_mode,
    )
    return AIResponse(**res)


@app.get("/api/urban-heat")
def get_urban_heat(
    horizon_years: int = Query(default=5, ge=1, le=10),
    refresh: bool = Query(default=False),
) -> Dict[str, Any]:
    """Return multi-year Landsat 8/9 thermal LST hotspots, cooling targets & estimated heat forecast."""
    return urban_heat.evaluate_heat_horizon(horizon_years=horizon_years, force_refresh=refresh)


@app.post("/api/urban-heat/explain", response_model=AIResponse)
def explain_urban_heat(req: HeatExplainRequest) -> AIResponse:
    """Use NVIDIA NIM to explain urban heat hotspots and recommend tree plantation/cooling actions."""
    data = urban_heat.evaluate_heat_horizon(horizon_years=req.horizon_years)
    res = nim_client.explain_bengaluru_urban_heat(
        heat_data=data,
        zone_id=req.zone_id,
        question=req.question,
        demo_mode=req.demo_mode,
    )
    return AIResponse(**res)


@app.get("/api/infrastructure")
def get_infrastructure_protection(refresh: bool = Query(default=False)) -> Dict[str, Any]:
    """Screen Bengaluru roads, bridges, metro, power & water assets against flood, land-change & thermal risks."""
    return infrastructure_protection.build_or_load_infrastructure(force_refresh=refresh)


@app.post("/api/infrastructure/explain", response_model=AIResponse)
def explain_infrastructure_protection(req: InfrastructureExplainRequest) -> AIResponse:
    """Use NVIDIA NIM to explain infrastructure risks and recommend protective engineering actions."""
    data = infrastructure_protection.build_or_load_infrastructure()
    res = nim_client.explain_bengaluru_infrastructure_risk(
        infra_data=data,
        asset_id=req.asset_id,
        question=req.question,
        demo_mode=req.demo_mode,
    )
    return AIResponse(**res)


@app.get("/api/simulation/missions")
def get_simulation_missions() -> Dict[str, Any]:
    """Return Bengaluru Satellite -> HAPS -> Drone emergency response simulation scenarios grounded in real hazard data."""
    return emergency_sim.get_bengaluru_missions()


@app.post("/api/simulation/explain", response_model=AIResponse)
def explain_simulation_mission(req: SimulationExplainRequest) -> AIResponse:
    """Use NVIDIA NIM to analyze simulated emergency findings and recommend response actions."""
    missions_data = emergency_sim.get_bengaluru_missions()
    res = nim_client.explain_simulation_mission(
        missions_data=missions_data,
        mission_id=req.mission_id,
        stage=req.stage,
        question=req.question,
        demo_mode=req.demo_mode,
    )
    return AIResponse(**res)


@app.get("/api/prediction-engine")
def get_prediction_engine(
    rainfall_mm: float = Query(default=65.0, ge=0.0, le=250.0),
    horizon_years: int = Query(default=5, ge=1, le=10),
) -> Dict[str, Any]:
    """Return the unified Bengaluru 6-location monitoring map and 4-module AI prediction engine."""
    return prediction_engine.build_unified_engine(rainfall_mm=rainfall_mm, horizon_years=horizon_years)


@app.post("/api/prediction-engine/explain", response_model=AIResponse)
def explain_prediction_engine(req: PredictionEngineExplainRequest) -> AIResponse:
    """Use NVIDIA NIM to explain the selected Bengaluru monitoring site or prediction module."""
    data = prediction_engine.build_unified_engine(rainfall_mm=req.rainfall_mm, horizon_years=req.horizon_years)
    res = nim_client.explain_prediction_engine(
        engine_data=data,
        location_id=req.location_id,
        module_id=req.module_id,
        question=req.question,
        demo_mode=req.demo_mode,
    )
    return AIResponse(**res)
