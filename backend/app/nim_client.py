"""NVIDIA NIM client with SHA-256 disk caching, 8s timeout, and deterministic fallbacks."""

from __future__ import annotations

import base64
import hashlib
import io
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from openai import OpenAI
from PIL import Image

from backend.app import config
from backend.app.schemas import DerivedMetrics, ResultsPayload, TriageItem

AI_TAG = "AI-assisted, requires official verification"

STRICT_SYSTEM_PROMPT = (
    "You are GeoTerra AI's protective civic-monitoring assistant for Karnataka authorities. "
    "HARD RULES: "
    "1) Protective civil use ONLY (disaster resilience, flood response, official field verification). "
    "Never mention weapons, targeting, or tracking individuals/vehicles. "
    "2) Use ONLY the exact numbers provided in the user JSON payload. Never invent, estimate, extrapolate, or alter any figure. "
    "3) Never conclude illegality or intent (e.g., never write 'illegal mining'); state only that flagged changes require official verification. "
    "4) Note that Karnataka flood predictions are unvalidated model predictions."
)


def _format_inr_short(amount: float) -> str:
    if amount >= 1e7:
        return f"INR {amount / 1e7:.2f} crore (INR {amount:,.0f})"
    if amount >= 1e5:
        return f"INR {amount / 1e5:.2f} lakh (INR {amount:,.0f})"
    return f"INR {amount:,.0f}"


def _cache_key(model: str, prompt: str, image_hash: str = "") -> str:
    h = hashlib.sha256()
    h.update(model.encode("utf-8"))
    h.update(b"|")
    h.update(prompt.encode("utf-8"))
    h.update(b"|")
    h.update(image_hash.encode("utf-8"))
    return h.hexdigest()


def _read_cache(key: str) -> Optional[Dict[str, Any]]:
    path = config.CACHE_DIR / f"{key}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _write_cache(key: str, payload: Dict[str, Any]) -> None:
    config.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = config.CACHE_DIR / f"{key}.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _hash_images(paths: List[Path]) -> str:
    h = hashlib.sha256()
    for p in paths:
        if p.exists():
            h.update(p.read_bytes())
        else:
            h.update(str(p.name).encode("utf-8"))
    return h.hexdigest()


def _encode_image_for_vlm(path: Path, max_dim: int = 512) -> str:
    """Resize and JPEG-compress an image in memory so NIM VLM base64 payloads stay compact."""
    with Image.open(path) as img:
        rgb = img.convert("RGB")
        rgb.thumbnail((max_dim, max_dim))
        buf = io.BytesIO()
        rgb.save(buf, format="JPEG", quality=85)
        return base64.b64encode(buf.getvalue()).decode("ascii")


def _get_client() -> Optional[OpenAI]:
    api_key = config.get_nvidia_api_key()
    if config.is_offline_only() or not api_key:
        return None
    return OpenAI(
        base_url=config.NIM_BASE_URL,
        api_key=api_key,
        timeout=config.NIM_TIMEOUT_SECONDS,
    )


def _call_llm(
    prompt: str,
    model: str = config.LLM_MODEL,
    demo_mode: bool = False,
    image_paths: Optional[List[Path]] = None,
    system_prompt: str = STRICT_SYSTEM_PROMPT,
) -> Tuple[Optional[str], str]:
    """Call NIM chat completions with cache-first on demo_mode and cache-fallback on failure."""
    img_paths = image_paths or []
    img_hash = _hash_images(img_paths) if img_paths else ""
    key = _cache_key(model, prompt, img_hash)

    cached = _read_cache(key)
    api_key = config.get_nvidia_api_key()
    if demo_mode or config.is_offline_only() or not api_key:
        if cached and "text" in cached:
            return cached["text"], "disk_cache"
        return None, "template_fallback"

    client = _get_client()
    if client is None:
        if cached and "text" in cached:
            return cached["text"], "disk_cache"
        return None, "template_fallback"

    user_content: Any
    if img_paths:
        parts: List[Dict[str, Any]] = [{"type": "text", "text": prompt}]
        for p in img_paths:
            if p.exists():
                b64 = _encode_image_for_vlm(p)
                parts.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})
        user_content = parts
    else:
        user_content = prompt

    try:
        extra_body = (
            {"chat_template_kwargs": {"enable_thinking": False}}
            if "nemotron-3.5" in model
            else None
        )
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.2,
            max_tokens=700,
            extra_body=extra_body,
        )
        text = (resp.choices[0].message.content or "").strip()
        if text:
            _write_cache(key, {"model": model, "text": text})
            return text, "live"
    except Exception:
        pass

    if cached and "text" in cached:
        return cached["text"], "disk_cache"
    return None, "template_fallback"


def generate_authority_alert(
    results: ResultsPayload,
    derived: DerivedMetrics,
    authority: str,
    focus: Optional[str] = None,
    demo_mode: bool = False,
) -> Dict[str, Any]:
    """Generate a factual authority alert strictly from structured pipeline outputs."""
    facts = {
        "authority": authority,
        "focus": focus or "Flood & peri-urban land-change briefing",
        "aoi_name": results.flood.aoi_name,
        "dates": {"before": results.flood.date_before, "after": results.flood.date_after},
        "validation_status": "Validated" if results.flood.validated else "Model prediction (unvalidated)",
        "flooded_area_ha": results.flood.flooded_area_ha,
        "cropland_affected_ha": results.flood.cropland_affected_ha,
        "built_up_affected_ha": results.flood.built_up_affected_ha,
        "roads_affected_km": results.flood.roads_affected_km,
        "estimated_cropland_loss_inr": derived.estimated_cropland_loss_inr,
        "high_priority_settlements": [s.model_dump() for s in results.flood.settlements_affected if s.priority == "high"],
        "critical_infrastructure_count": len(results.flood.critical_infrastructure_affected),
        "critical_infrastructure": [c.model_dump() for c in results.flood.critical_infrastructure_affected[:5]],
        "land_change_site": results.change.site_name,
        "changed_area_ha": results.change.changed_area_ha,
        "flagged_polygons_count": len(results.change.polygons),
    }
    prompt = (
        "Draft a concise, actionable operational advisory for the authority below using ONLY these exact JSON facts. "
        "Include: (1) Flood extent and unvalidated prediction notice, (2) Exposure & estimated cropland loss in INR, "
        "(3) Priority settlements & critical infrastructure to verify, (4) Land-change polygons requiring official verification.\n"
        f"FACTS_JSON:\n{json.dumps(facts, indent=2)}"
    )
    model = config.get_llm_model()
    text, src = _call_llm(prompt, model=model, demo_mode=demo_mode)

    if text is None:
        high_names = ", ".join(s.name for s in results.flood.settlements_affected if s.priority == "high") or "None flagged"
        infra_names = ", ".join(f"{c.name} ({c.type})" for c in results.flood.critical_infrastructure_affected[:3]) or "None flagged"
        text = (
            f"ADVISORY FOR {authority}\n"
            f"Region: {results.flood.aoi_name} ({results.flood.date_before} -> {results.flood.date_after}) | "
            f"Status: {'Validated' if results.flood.validated else 'Model prediction (unvalidated)'}.\n\n"
            f"1. Flood & Exposure Summary: Satellite SAR analysis indicates {results.flood.flooded_area_ha:.2f} ha of "
            f"predicted floodwater (permanent water excluded), intersecting {results.flood.cropland_affected_ha:.2f} ha "
            f"of cropland, {results.flood.built_up_affected_ha:.2f} ha of built-up area, and {results.flood.roads_affected_km:.2f} km of roads.\n"
            f"2. Economic Exposure (Assumption-based): Estimated cropland impact is "
            f"{_format_inr_short(derived.estimated_cropland_loss_inr)} based on the configured loss-per-hectare assumption.\n"
            f"3. Priority Field Verification: High-priority settlements: {high_names}. "
            f"Nearby critical infrastructure ({len(results.flood.critical_infrastructure_affected)} total): {infra_names}.\n"
            f"4. Land-Change Notice: {len(results.change.polygons)} polygons totaling {results.change.changed_area_ha:.2f} ha in "
            f"{results.change.site_name} carry the status 'Potential suspicious activity: requires official verification'."
        )
        # Store template? Keep template_fallback distinct unless cached live.

    return {
        "text": text,
        "ai_mode": "live" if src == "live" else "cached",
        "detail_source": src,
        "ai_tag": AI_TAG,
        "model": config.get_llm_model(),
    }


def describe_site_tiles(
    results: ResultsPayload,
    before_image: str,
    after_image: str,
    polygon_id: Optional[str] = None,
    demo_mode: bool = False,
) -> Dict[str, Any]:
    """Use NIM VLM to describe ONLY visible before/after surface changes without inferring intent or legality."""
    before_path = config.IMAGES_DIR / Path(before_image).name
    after_path = config.IMAGES_DIR / Path(after_image).name
    poly = next((p for p in results.change.polygons if p.id == polygon_id), None) if polygon_id else None

    context = {
        "site_name": results.change.site_name,
        "dates": results.change.dates.model_dump(),
        "polygon": poly.model_dump() if poly else None,
        "changed_area_ha": results.change.changed_area_ha,
        "vegetation_loss_ha": results.change.vegetation_loss_ha,
        "bare_soil_increase_ha": results.change.bare_soil_increase_ha,
    }
    prompt = (
        "Compare the attached BEFORE and AFTER satellite preview images strictly based on visible land-cover changes "
        "(e.g., vegetation cover reduction, exposed bare soil, water boundaries, road/clearing edges). "
        "Do NOT infer human intent, ownership, or legality. Use only the provided metrics if citing numbers.\n"
        f"SITE_METRICS:\n{json.dumps(context, indent=2)}"
    )
    vlm_model = config.get_vlm_model()
    text, src = _call_llm(
        prompt,
        model=vlm_model,
        demo_mode=demo_mode,
        image_paths=[p for p in (before_path, after_path) if p.exists()],
    )

    if text is None:
        poly_note = (
            f"Focus polygon {poly.id} spans {poly.area_ha:.2f} ha (NDVI drop {poly.ndvi_drop:.2f}, "
            f"confidence {poly.confidence:.2f}, near river: {'yes' if poly.near_river else 'no'})."
            if poly
            else f"Across {results.change.site_name}, {len(results.change.polygons)} polygons total {results.change.changed_area_ha:.2f} ha."
        )
        text = (
            f"Visual Comparison ({results.change.dates.before} vs {results.change.dates.after}): "
            f"Comparing the before and after optical tiles shows localized reduction in vegetated canopy "
            f"({results.change.vegetation_loss_ha:.2f} ha NDVI drop) paired with brighter, higher-reflectance exposed "
            f"surface patches ({results.change.bare_soil_increase_ha:.2f} ha bare-soil index increase). "
            f"{poly_note} Status: Potential suspicious activity: requires official verification."
        )

    return {
        "text": text,
        "ai_mode": "live" if src == "live" else "cached",
        "detail_source": src,
        "ai_tag": AI_TAG,
        "model": config.get_vlm_model(),
    }


def _deterministic_triage(results: ResultsPayload) -> Tuple[List[TriageItem], str]:
    candidates: List[Dict[str, Any]] = []
    prio_weight = {"high": 1.0, "medium": 0.65, "low": 0.35}
    for s in results.flood.settlements_affected:
        pop = s.population_estimate or 1500
        score = round(prio_weight[s.priority] * 60.0 + min(pop / 500.0, 40.0), 1)
        candidates.append(
            {
                "id": s.name,
                "category": "flood_settlement",
                "priority": s.priority,
                "score": score,
                "rationale": f"Predicted flood proximity ({s.priority} priority, est. pop {pop:,}); model prediction (unvalidated).",
                "recommended_action": "Dispatch KSDMA field verification & drainage check.",
            }
        )
    for p in results.change.polygons:
        score = round(p.confidence * 55.0 + min(p.area_ha * 2.0, 30.0) + (15.0 if p.near_river else 0.0), 1)
        prio = "high" if (p.near_river and p.confidence >= 0.78) or p.area_ha >= 8.0 else ("medium" if p.confidence >= 0.65 else "low")
        candidates.append(
            {
                "id": p.id,
                "category": "land_change",
                "priority": prio,
                "score": score,
                "rationale": (
                    f"{p.area_ha:.2f} ha change (NDVI drop {p.ndvi_drop:.2f}, conf {p.confidence:.2f}, "
                    f"{'near river' if p.near_river else 'inland'}). {p.status}."
                ),
                "recommended_action": "Schedule official revenue/forest/pollution inspection.",
            }
        )

    candidates.sort(key=lambda x: x["score"], reverse=True)
    items = [TriageItem(rank=idx + 1, **c) for idx, c in enumerate(candidates[:8])]
    summary = (
        f"Ranked {len(items)} priority locations across {results.flood.aoi_name} and {results.change.site_name} "
        f"for official field verification."
    )
    return items, summary


def triage_flagged_sites(results: ResultsPayload, demo_mode: bool = False) -> Dict[str, Any]:
    """Rank flood settlements and land-change polygons via JSON-only NIM output with retry and fallback."""
    triage_input = {
        "flood_settlements": [s.model_dump() for s in results.flood.settlements_affected],
        "change_polygons": [p.model_dump() for p in results.change.polygons],
    }
    base_prompt = (
        "Return ONLY valid JSON (no markdown fences) with keys 'summary' (string) and 'items' (list of objects with "
        "keys: rank, id, category ['flood_settlement'|'land_change'], priority ['high'|'medium'|'low'], "
        "score [0-100], rationale, recommended_action). Rank the top 6 sites from these exact records. "
        "Never invent numbers or accuse individuals; label land-change items as requiring official verification.\n"
        f"INPUT:\n{json.dumps(triage_input, indent=2)}"
    )

    llm_model = config.get_llm_model()
    key = _cache_key(llm_model, "TRIAGE|" + base_prompt, "")
    cached = _read_cache(key)

    if not (demo_mode or config.is_offline_only() or not config.get_nvidia_api_key()):
        client = _get_client()
        if client is not None:
            for attempt in range(2):
                prompt = base_prompt if attempt == 0 else base_prompt + "\nSTRICT: Output raw JSON object ONLY."
                try:
                    extra_body = (
                        {"chat_template_kwargs": {"enable_thinking": False}}
                        if "nemotron-3.5" in llm_model
                        else None
                    )
                    resp = client.chat.completions.create(
                        model=llm_model,
                        messages=[
                            {"role": "system", "content": STRICT_SYSTEM_PROMPT},
                            {"role": "user", "content": prompt},
                        ],
                        temperature=0.2,
                        max_tokens=900,
                        extra_body=extra_body,
                    )
                    raw = (resp.choices[0].message.content or "").strip()
                    if raw.startswith("```"):
                        raw = raw.strip("`").lstrip("json").strip()
                    parsed = json.loads(raw)
                    validated_items = [TriageItem.model_validate(item) for item in parsed["items"]]
                    summary = str(parsed.get("summary", "Prioritized verification list."))
                    _write_cache(key, {"items": [i.model_dump() for i in validated_items], "summary": summary})
                    return {
                        "items": validated_items,
                        "summary": summary,
                        "ai_mode": "live",
                        "detail_source": "live",
                        "ai_tag": AI_TAG,
                        "model": llm_model,
                    }
                except Exception:
                    continue

    if cached and "items" in cached:
        items = [TriageItem.model_validate(i) for i in cached["items"]]
        return {
            "items": items,
            "summary": str(cached.get("summary", "")),
            "ai_mode": "cached",
            "detail_source": "disk_cache",
            "ai_tag": AI_TAG,
            "model": config.LLM_MODEL,
        }

    items, summary = _deterministic_triage(results)
    return {
        "items": items,
        "summary": summary,
        "ai_mode": "cached",
        "detail_source": "template_fallback",
        "ai_tag": AI_TAG,
        "model": config.get_llm_model(),
    }


def answer_grounded_question(
    question: str,
    results: ResultsPayload,
    derived: DerivedMetrics,
    demo_mode: bool = False,
) -> Dict[str, Any]:
    """Answer user questions strictly from results.json + derived metrics, else 'not available in the data'."""
    grounded_context = {
        "results": results.model_dump(),
        "derived": derived.model_dump(),
        "assumptions": config.ASSUMPTIONS.to_dict(),
    }
    prompt = (
        "Answer the user's question using ONLY the DATA JSON below. "
        "If the exact answer is not present in the DATA JSON, reply with exactly: "
        "'not available in the data'. Never guess or invent numbers.\n"
        f"QUESTION: {question}\n"
        f"DATA:\n{json.dumps(grounded_context, indent=2)}"
    )
    model = config.get_llm_model()
    text, src = _call_llm(prompt, model=model, demo_mode=demo_mode)

    if text is None:
        q = question.lower()
        if "cropland" in q or "loss" in q or "inr" in q or "economic" in q:
            text = (
                f"Cropland affected is {results.flood.cropland_affected_ha:.2f} ha. "
                f"Using the assumption of INR {results.economics.loss_per_ha_inr:,.0f}/ha, "
                f"estimated cropland loss is {_format_inr_short(derived.estimated_cropland_loss_inr)}."
            )
        elif "flood" in q or "hectare" in q or "road" in q or "settlement" in q:
            high_s = ", ".join(s.name for s in results.flood.settlements_affected if s.priority == "high") or "none"
            text = (
                f"In {results.flood.aoi_name} ({results.flood.date_after}), predicted flood extent is "
                f"{results.flood.flooded_area_ha:.2f} ha (Model prediction (unvalidated)), "
                f"with {results.flood.roads_affected_km:.2f} km of roads affected and high-priority settlements: {high_s}."
            )
        elif "iou" in q or "f1" in q or "bolivia" in q or "model" in q or "accuracy" in q:
            text = (
                f"{results.model.name} achieved Test IoU {results.model.metrics.test.iou:.3f} (F1 {results.model.metrics.test.f1:.3f}) "
                f"and held-out Bolivia IoU {results.model.metrics.bolivia.iou:.3f} (F1 {results.model.metrics.bolivia.f1:.3f}). "
                "Karnataka flood outputs are marked 'Model prediction (unvalidated)' because no local ground-truth mask exists."
            )
        elif "change" in q or "polygon" in q or "river" in q or "suspicious" in q:
            near_riv = sum(1 for p in results.change.polygons if p.near_river)
            text = (
                f"{results.change.site_name} ({results.change.dates.before} to {results.change.dates.after}) "
                f"shows {results.change.changed_area_ha:.2f} ha across {len(results.change.polygons)} polygons "
                f"({near_riv} near rivers), each marked 'Potential suspicious activity: requires official verification'."
            )
        elif "onboard" in q or "downlink" in q or "compression" in q:
            text = (
                f"Simulation assumptions: {results.onboard_sim.raw_scene_size_mb:.0f} MB raw scene vs "
                f"{results.onboard_sim.insight_packet_size_kb:.0f} KB insight packet "
                f"({derived.compression_ratio:,.0f}:1 compression), reducing downlink time from "
                f"{derived.raw_downlink_seconds:.1f} s to {derived.packet_downlink_seconds:.3f} s."
            )
        else:
            text = "not available in the data"

    return {
        "text": text,
        "ai_mode": "live" if src == "live" else "cached",
        "detail_source": src,
        "ai_tag": AI_TAG,
        "model": config.get_llm_model(),
    }


def explain_bengaluru_flood_risk(
    prediction_data: Dict[str, Any],
    area_name: str,
    question: Optional[str] = None,
    demo_mode: bool = False,
) -> Dict[str, Any]:
    """Explain why a Bengaluru ward/zone is at flood risk and suggest protective preventive actions via NIM."""
    ward = next(
        (w for w in prediction_data.get("wards", []) if area_name.lower() in w["name"].lower()),
        prediction_data.get("wards", [{}])[0],
    )
    facts = {
        "ward": ward,
        "scenario": prediction_data.get("scenario"),
        "city_summary": prediction_data.get("summary"),
        "historical_events": prediction_data.get("historical_events", []),
        "honesty_notice": prediction_data.get("honesty_notice"),
    }
    user_q = question or f"Explain why {ward.get('name', area_name)} is at {ward.get('risk_level', 'moderate')} flood risk and suggest practical preventive actions."
    prompt = (
        f"You are advising Bengaluru disaster & urban drainage planners (BBMP / KSNDMC). "
        f"Using ONLY FACTS_JSON below, answer: {user_q}\n"
        "Include: (1) Physical reasons (elevation_m, local depression_m, distance to major lake/drain, rainfall scenario, Sentinel-1 observed water), "
        "(2) 3 concrete protective preventive actions (drain desilting, lake sluice gate management, basement/road barriers & early warning). "
        "Keep strictly grounded in supplied numbers and clearly note predictions are unvalidated.\n"
        f"FACTS_JSON:\n{json.dumps(facts, indent=2)}"
    )
    model = config.get_llm_model()
    text, src = _call_llm(prompt, model=model, demo_mode=demo_mode)

    if text is None:
        w_name = ward.get("name", area_name)
        w_elev = ward.get("elevation_m", 890)
        w_dep = ward.get("depression_m", 0)
        w_lake = ward.get("major_lake", "nearby lake")
        w_dist = ward.get("distance_to_lake_km", 1.0)
        w_score = ward.get("risk_score", 50)
        w_level = str(ward.get("risk_level", "medium")).upper()
        rain_mm = prediction_data.get("scenario", {}).get("rainfall_24h_mm", 65)
        text = (
            f"FLOOD RISK ASSESSMENT — {w_name} ({w_level} RISK | Score {w_score}/100 under {rain_mm} mm/24h scenario)\n\n"
            f"Why this area is at risk (Model prediction — unvalidated):\n"
            f"• Low-lying basin & drainage: Copernicus DEM shows {w_elev} m elevation (local topographic depression {w_dep} m) "
            f"just {w_dist} km from {w_lake}, causing stormwater runoff to pool along valley drains.\n"
            f"• Exposure & SAR signal: {ward.get('osm_roads_in_zone_km', 0)} km of OSM roads and "
            f"{ward.get('osm_buildings_in_zone', 0)} buildings lie within 1.5 km, with {ward.get('s1_observed_water_ha', 0)} ha "
            f"water detected in Sentinel-1 SAR.\n\n"
            f"Recommended Preventive Actions:\n"
            f"1. Pre-monsoon silt & solid-waste clearing along storm-water drains (rajkaluves) feeding {w_lake}.\n"
            f"2. Controlled pre-release of weir/sluice buffer capacity before >50 mm/24h forecast events.\n"
            f"3. Pre-position dewatering pumps and temporary road diversion signage at low underpasses and basement entries."
        )

    return {
        "text": text,
        "ai_mode": "live" if src == "live" else "cached",
        "detail_source": src,
        "ai_tag": AI_TAG,
        "model": model,
    }


def explain_bengaluru_lake_change(
    lake_data: Dict[str, Any],
    lake_id: Optional[str] = None,
    question: Optional[str] = None,
    demo_mode: bool = False,
) -> Dict[str, Any]:
    """Explain Sentinel-2 lake water/buffer changes and recommend which lakes need survey & protection via NIM."""
    lakes = lake_data.get("lakes", [])
    target = next((l for l in lakes if l["id"] == lake_id), lakes[0] if lakes else {})
    facts = {
        "focus_lake": target,
        "scenes": lake_data.get("scenes"),
        "city_summary": lake_data.get("summary"),
        "priority_lakes": [
            {
                "name": l["name"],
                "water_change_pct": l["water_change_pct"],
                "buffer_construction_ha": l["buffer_construction_ha"],
                "buffer_veg_loss_ha": l["buffer_veg_loss_ha"],
                "priority": l["priority"],
            }
            for l in lakes[:5]
        ],
    }
    user_q = question or (
        f"Explain what satellite changes were detected around {target.get('name', 'Bellandur Lake')} "
        "and recommend which Bengaluru lakes need immediate official inspection and buffer protection."
    )
    prompt = (
        f"You are advising Bengaluru Lake Conservation & Survey Officers (KLCDA / BBMP Lakes). "
        f"Using ONLY FACTS_JSON below, answer: {user_q}\n"
        "RULES: Never assume or accuse 'illegal encroachment' — always state changes require official survey verification. "
        "Cite exact hectares and percentages from FACTS_JSON, explain water spread vs aquatic vegetation vs buffer built-up shifts, "
        "and list prioritized lakes needing inspection and protective actions.\n"
        f"FACTS_JSON:\n{json.dumps(facts, indent=2)}"
    )
    model = config.get_llm_model()
    text, src = _call_llm(prompt, model=model, demo_mode=demo_mode)

    if text is None:
        name = target.get("name", "Bellandur Lake")
        wb = target.get("water_before_ha", 0)
        wa = target.get("water_after_ha", 0)
        chg = target.get("water_change_pct", 0)
        veg = target.get("buffer_veg_loss_ha", 0)
        con = target.get("buffer_construction_ha", 0)
        top_names = ", ".join(l["name"] for l in lakes if l.get("needs_immediate_attention")) or name
        text = (
            f"LAKE MONITORING BRIEF — {name} ({str(target.get('priority', 'medium')).upper()} PRIORITY)\n\n"
            f"Observed Multi-Date Sentinel-2 Changes:\n"
            f"• Water Spread: {wb} ha -> {wa} ha ({chg:+.1f}% change; status: {target.get('trend_status', 'Tracked')}).\n"
            f"• 250m Buffer Shifts: {con} ha increased built-up/bare-soil index (NDBI) and {veg} ha vegetation reduction (NDVI).\n"
            f"• Verification Status: Possible boundary or construction change near lake buffer — requires official survey verification.\n\n"
            f"Lakes Prioritized for Immediate Field Inspection & Protection:\n"
            f"• Immediate attention queue: {top_names}.\n"
            f"• Recommended actions: (1) Cross-check buffer coordinates against official revenue/CDS lake boundary maps, "
            f"(2) Clear inlet/outlet silt & weeds, (3) Demarcate protective green buffer fencing."
        )

    return {
        "text": text,
        "ai_mode": "live" if src == "live" else "cached",
        "detail_source": src,
        "ai_tag": AI_TAG,
        "model": model,
    }


def explain_bengaluru_urban_growth(
    urban_data: Dict[str, Any],
    corridor_id: Optional[str] = None,
    question: Optional[str] = None,
    demo_mode: bool = False,
) -> Dict[str, Any]:
    """Explain measured 2019-2026 Bengaluru urban expansion & recommend future infrastructure via NIM."""
    corridors = urban_data.get("corridors", [])
    target = next((c for c in corridors if c["id"] == corridor_id), corridors[0] if corridors else {})
    target_yr = urban_data.get("summary", {}).get("target_year", 2031)
    facts = {
        "focus_corridor": target,
        "city_summary": urban_data.get("summary"),
        "prediction_notice": urban_data.get("prediction_notice"),
        "top_hotspots": [
            {
                "name": c["name"],
                "new_urban_ha": c["new_urban_ha"],
                "active_construction_ha": c["active_construction_ha"],
                "veg_loss_ha": c["veg_loss_ha"],
                "projected_added_ha": c["projected_added_ha"],
                "growth_pressure_score": c["growth_pressure_score"],
                "infrastructure_needs": c["infrastructure_needs"],
            }
            for c in corridors[:5]
        ],
    }
    user_q = question or (
        f"Explain the 2019–2026 urban expansion and green cover changes in {target.get('name', 'Bengaluru East')}, "
        f"what growth is estimated through {target_yr}, and which roads, drainage, water supply, and green infrastructure upgrades are most urgent."
    )
    prompt = (
        f"You are advising Bengaluru urban & infrastructure planners (BBMP / BDA / BWSSB / BMRCL). "
        f"Using ONLY FACTS_JSON below, answer: {user_q}\n"
        "RULES: Clearly label future projections as estimates based on historical 2019–2026 Sentinel-2 trends, NOT guaranteed outcomes. "
        "Cite exact hectares, percentages, and growth scores from FACTS_JSON, highlight newly developed urban/construction zones and vegetation loss, "
        "and recommend targeted investments in arterial/feeder roads, stormwater drainage, piped water supply/UGD, and urban green corridors.\n"
        f"FACTS_JSON:\n{json.dumps(facts, indent=2)}"
    )
    model = config.get_llm_model()
    text, src = _call_llm(prompt, model=model, demo_mode=demo_mode)

    if text is None:
        name = target.get("name", "Bellandur – Sarjapur Rd")
        new_u = target.get("new_urban_ha", 0)
        constr = target.get("active_construction_ha", 0)
        vloss = target.get("veg_loss_ha", 0)
        proj = target.get("projected_added_ha", 0)
        score = target.get("growth_pressure_score", 0)
        needs = ", ".join(target.get("infrastructure_needs", []))
        top_hotspots = ", ".join(
            f"{c['name']} (+{c['projected_added_ha']} ha est.)" for c in corridors[:4]
        )
        text = (
            f"URBAN GROWTH & INFRASTRUCTURE BRIEF — {name} (Pressure Score {score}/100)\n\n"
            f"Measured Sentinel-2 Expansion (2019-03-30 to 2026-02-01):\n"
            f"• Built-up footprint increased from {target.get('built_2019_ha', 0)} ha to {target.get('built_2026_ha', 0)} ha "
            f"({new_u} ha newly urbanized; {constr} ha active construction/bare soil).\n"
            f"• Vegetation declined by {vloss} ha ({target.get('veg_change_pct', 0):+.1f}% change in green cover).\n\n"
            f"Estimated {target_yr} Growth & Priority Infrastructure (Estimates, not guaranteed):\n"
            f"• Capacity-damped estimate adds ~{proj} ha urban infill by {target_yr}. Top projected hotspots: {top_hotspots}.\n"
            f"• Priority upgrades required: {needs}. {target.get('water_note', '')}"
        )

    return {
        "text": text,
        "ai_mode": "live" if src == "live" else "cached",
        "detail_source": src,
        "ai_tag": AI_TAG,
        "model": model,
    }


def explain_bengaluru_urban_heat(
    heat_data: Dict[str, Any],
    zone_id: Optional[str] = None,
    question: Optional[str] = None,
    demo_mode: bool = False,
) -> Dict[str, Any]:
    """Explain Landsat Land Surface Temperature hotspots & recommend tree/cooling interventions via NIM."""
    zones = heat_data.get("zones", [])
    target = next((z for z in zones if z["id"] == zone_id), zones[0] if zones else {})
    target_yr = heat_data.get("summary", {}).get("target_year", 2031)
    facts = {
        "focus_zone": target,
        "coolest_baseline": zones[-1] if zones else {},
        "air_temp_benchmark": heat_data.get("air_temp_benchmark"),
        "honesty_notice": heat_data.get("honesty_notice"),
        "city_summary": heat_data.get("summary"),
        "hottest_zones": [
            {
                "name": z["name"],
                "mean_lst_2026_c": z["mean_lst_2026_c"],
                "warming_delta_c": z["warming_delta_c"],
                "mean_ndvi_2026": z["mean_ndvi_2026"],
                "plantation_target_ha": z["plantation_target_ha"],
                "projected_lst_c": z["projected_lst_c"],
                "potential_cooling_c": z["potential_cooling_c"],
            }
            for z in zones[:5]
        ],
    }
    user_q = question or (
        f"Explain why {target.get('name', 'Peenya Industrial Estate')} records elevated Landsat surface temperatures, "
        f"how it compares to station air temperature, what heat trend is estimated through {target_yr}, "
        "and where tree plantation and cooling interventions will cut surface heat most effectively."
    )
    prompt = (
        f"You are advising Bengaluru Urban Forestry, BBMP Climate Action & Health Planners. "
        f"Using ONLY FACTS_JSON below, answer: {user_q}\n"
        "RULES: Explicitly distinguish Satellite Land Surface Temperature (LST °C) from station 2m Air Temperature (°C), "
        "and label future forecasts as statistical estimates (not guaranteed). "
        "Cite exact °C values, NDVI/vegetation loss hectares, and recommend tree plantation corridors, pocket parks, cool roofs & green buffers.\n"
        f"FACTS_JSON:\n{json.dumps(facts, indent=2)}"
    )
    model = config.get_llm_model()
    text, src = _call_llm(prompt, model=model, demo_mode=demo_mode)

    if text is None:
        name = target.get("name", "Peenya Industrial Estate")
        lst26 = target.get("mean_lst_2026_c", 0)
        lst19 = target.get("mean_lst_2019_c", 0)
        delta = target.get("warming_delta_c", 0)
        air_max = heat_data.get("air_temp_benchmark", {}).get("acq_day_max_air_temp_c", 30.2)
        proj = target.get("projected_lst_c", 0)
        cool = target.get("potential_cooling_c", 2.0)
        plant_ha = target.get("plantation_target_ha", 0)
        actions = ", ".join(target.get("cooling_interventions", []))
        text = (
            f"URBAN HEAT & COOLING BRIEF — {name} (Heat Score {target.get('heat_score', 0)}/100)\n\n"
            f"Landsat Thermal Observation (Surface LST vs Station Air Temp):\n"
            f"• Satellite Land Surface Temperature (LST): {lst26} °C in 2026 (2019 baseline {lst19} °C; delta {delta:+.2f} °C), "
            f"contrasted with ~{air_max} °C shaded 2m station air temperature on the same day.\n"
            f"• Heat Driver: {target.get('heat_driver', '')} Low vegetation (NDVI {target.get('mean_ndvi_2026', 0)}) and "
            f"{target.get('veg_loss_ha', 0)} ha green cover loss intensify surface radiation.\n\n"
            f"Estimated {target_yr} Trend & Greening Recommendations (Estimates only):\n"
            f"• Estimated {target_yr} LST: ~{proj} °C if current warming & canopy loss persist.\n"
            f"• Priority cooling targets ({plant_ha} ha): {actions} — estimated localized surface cooling potential of -{cool} °C."
        )

    return {
        "text": text,
        "ai_mode": "live" if src == "live" else "cached",
        "detail_source": src,
        "ai_tag": AI_TAG,
        "model": model,
    }


def explain_bengaluru_infrastructure_risk(
    infra_data: Dict[str, Any],
    asset_id: Optional[str] = None,
    question: Optional[str] = None,
    demo_mode: bool = False,
) -> Dict[str, Any]:
    """Explain critical infrastructure flood/land-change/heat exposure & recommend preventive inspection via NIM."""
    assets = infra_data.get("assets", [])
    target = next((a for a in assets if a["id"] == asset_id), assets[0] if assets else {})
    facts = {
        "focus_asset": target,
        "summary": infra_data.get("summary"),
        "honesty_notice": infra_data.get("honesty_notice"),
        "top_risk_assets": [
            {
                "name": a["name"],
                "category_label": a["category_label"],
                "risk_score": a["risk_score"],
                "risk_level": a["risk_level"],
                "flood_susceptibility": a["flood_susceptibility"],
                "unusual_land_change_ha": a["unusual_land_change_ha"],
                "nearby_heat_hotspot_ha": a["nearby_heat_hotspot_ha"],
                "threat_tags": a["threat_tags"],
            }
            for a in assets[:6]
        ],
    }
    user_q = question or (
        f"Explain the multi-hazard exposure around {target.get('name', 'Outer Ring Rd')} "
        "(flood risk, unusual nearby land changes, and environmental thermal stress) and suggest concrete preventive engineering actions."
    )
    prompt = (
        "You are advising Bengaluru Civil Resilience Engineers (BBMP / BMRCL / KPTCL / BWSSB). "
        f"Using ONLY FACTS_JSON below, answer: {user_q}\n"
        "RULES: Clearly state that satellite detections are AI risk screens requiring physical engineering inspection, NOT verified structural incidents. "
        "Cite exact risk scores, flood susceptibility, nearby land-change hectares, distance to lakes, and heat-hotspot hectares from FACTS_JSON, "
        "and recommend protective drainage, embankment/culvert inspection, and environmental buffer safeguards.\n"
        f"FACTS_JSON:\n{json.dumps(facts, indent=2)}"
    )
    model = config.get_llm_model()
    text, src = _call_llm(prompt, model=model, demo_mode=demo_mode)

    if text is None:
        name = target.get("name", "Critical Infrastructure Asset")
        lvl = str(target.get("risk_level", "High")).upper()
        score = target.get("risk_score", 0)
        flood = target.get("flood_susceptibility", 0)
        chg = target.get("unusual_land_change_ha", 0)
        heat = target.get("nearby_heat_hotspot_ha", 0)
        lake = target.get("nearest_lake", "nearby lake")
        dist = target.get("distance_to_lake_km", 0)
        text = (
            f"INFRASTRUCTURE RESILIENCE BRIEF — {name} ({lvl} RISK | Score {score}/100)\n\n"
            f"Satellite Risk Screen (AI prediction — requires engineering inspection, not a verified incident):\n"
            f"• Flood Exposure: {flood}/100 susceptibility near {lake} ({dist} km away; "
            f"{target.get('nearby_roads_km', 0)} km roads & {target.get('nearby_buildings_exposed', 0)} buildings in zone).\n"
            f"• Surrounding Land & Environmental Signals: {chg} ha unusual nearby land/construction change (Sentinel-2) "
            f"and {heat} ha thermal hotspot stress (Landsat LST).\n\n"
            f"Recommended Preventive Actions:\n"
            f"1. {target.get('recommended_action', 'Inspect stormwater culverts and embankment stability.')}\n"
            f"2. Audit earthworks setbacks within 400m to prevent silt clogging drainage outlets.\n"
            f"3. Pre-stage flood sensors and thermal/cooling shielding ahead of peak monsoon and summer cycles."
        )

    return {
        "text": text,
        "ai_mode": "live" if src == "live" else "cached",
        "detail_source": src,
        "ai_tag": AI_TAG,
        "model": model,
    }


def explain_simulation_mission(
    missions_data: Dict[str, Any],
    mission_id: Optional[str] = None,
    stage: int = 5,
    question: Optional[str] = None,
    demo_mode: bool = False,
) -> Dict[str, Any]:
    """Analyze a simulated Satellite->HAPS->Drone emergency workflow & recommend response actions via NIM."""
    missions = missions_data.get("missions", [])
    target = next((m for m in missions if m["id"] == mission_id), missions[0] if missions else {})
    facts = {
        "simulation_notice": missions_data.get("simulation_notice"),
        "current_stage": stage,
        "mission": target,
    }
    user_q = question or (
        f"Analyze the simulated Satellite->HAPS->Drone emergency response for {target.get('title', 'Bengaluru Flood')}, "
        "explain why this location was flagged, summarize the simulated drone inspection findings, "
        "and recommend prioritized civil emergency response actions."
    )
    prompt = (
        "You are an AI Emergency Operations Advisor supporting Bengaluru Disaster Management (KSDMA / BBMP). "
        f"Using ONLY FACTS_JSON below, answer: {user_q}\n"
        "RULES: Explicitly note this is a DIGITAL SIMULATION using historical/predicted satellite inputs — "
        "not real satellite/HAPS/drone control. Cite exact coordinates, flight distance/duration, immediate attention areas, "
        "and recommended emergency actions from FACTS_JSON.\n"
        f"FACTS_JSON:\n{json.dumps(facts, indent=2)}"
    )
    model = config.get_llm_model()
    text, src = _call_llm(prompt, model=model, demo_mode=demo_mode)

    if text is None:
        findings = target.get("drone_findings", {})
        areas = ", ".join(findings.get("immediate_attention_areas", []))
        actions = "\n".join(f"• {a}" for a in findings.get("recommended_actions", []))
        text = (
            f"SIMULATED EMERGENCY RESPONSE BRIEF — {target.get('title', 'Bengaluru Emergency')} (Stage {stage}/5)\n"
            "Status: Digital Simulation (no real satellites, HAPS or drones controlled)\n\n"
            f"1. Satellite Alert & HAPS Relay:\n"
            f"• {target.get('auto_alert', {}).get('headline', '')} ({target.get('auto_alert', {}).get('metrics_summary', '')}).\n"
            f"• Relayed via {target.get('haps_station', {}).get('name', 'HAPS')} at {target.get('haps_station', {}).get('altitude_km', 20)} km.\n\n"
            f"2. Simulated Drone Inspection ({findings.get('distance_km', 0)} km / {findings.get('flight_duration_min', 0)} min):\n"
            f"• Immediate attention hotspots: {areas}.\n\n"
            f"3. Recommended Civil Response Actions:\n{actions}"
        )

    return {
        "text": text,
        "ai_mode": "live" if src == "live" else "cached",
        "detail_source": src,
        "ai_tag": AI_TAG,
        "model": model,
    }


def explain_prediction_engine(
    engine_data: Dict[str, Any],
    location_id: Optional[str] = None,
    module_id: Optional[str] = None,
    question: Optional[str] = None,
    demo_mode: bool = False,
) -> Dict[str, Any]:
    """Synthesize cross-module Bengaluru monitoring (6 valleys/lakes + 4 AI modules) via NIM."""
    locs = engine_data.get("focus_locations", [])
    mods = engine_data.get("modules", {})
    focus_loc = next((l for l in locs if l["id"] == location_id), locs[0] if locs else {})
    mod_key = module_id if module_id in mods else focus_loc.get("primary_module", "flood")
    focus_mod = mods.get(mod_key, {})

    facts = {
        "focus_location": focus_loc,
        "focus_module": focus_mod,
        "all_locations": [
            {"name": l["name"], "focus": l["focus"], "risk_level": l["risk_level"], "risk_score": l["risk_score"]}
            for l in locs
        ],
        "parameters": engine_data.get("parameters"),
        "honesty_notice": engine_data.get("honesty_notice"),
    }
    user_q = question or (
        f"Explain the monitoring findings and risk level at {focus_loc.get('name', 'Hebbal Valley')} "
        f"and summarize the {focus_mod.get('name', 'Flood Prediction')} module's data sources, current condition, "
        "future estimate, and priority recommendations."
    )
    prompt = (
        "You are an AI Geospatial Decision Advisor for Bengaluru Urban Resilience & Planning (BBMP / BDA / KSDMA). "
        f"Using ONLY FACTS_JSON below, answer: {user_q}\n"
        "RULES: Clearly state predictions and future estimates are analytical estimates (not guaranteed outcomes) and "
        "boundary shifts require official survey verification. Cite exact metrics from FACTS_JSON.\n"
        f"FACTS_JSON:\n{json.dumps(facts, indent=2)}"
    )
    model = config.get_llm_model()
    text, src = _call_llm(prompt, model=model, demo_mode=demo_mode)

    if text is None:
        recs = "\n".join(f"• {r}" for r in focus_mod.get("recommendations", []))
        text = (
            f"UNIFIED ENGINE BRIEF — {focus_loc.get('name', 'Bengaluru Valley')} ({focus_loc.get('risk_level', 'High')} Risk)\n\n"
            f"Monitoring Summary & Changes:\n"
            f"• {focus_loc.get('monitoring_summary', '')}\n"
            f"• Detected changes: {focus_loc.get('detected_changes', '')}\n\n"
            f"Module Focus ({focus_mod.get('name', '')} — {focus_mod.get('honest_label', 'Estimate')}):\n"
            f"• Current: {focus_mod.get('current_condition', '')}\n"
            f"• Future Estimate: {focus_mod.get('future_prediction', '')}\n\n"
            f"Recommended Actions:\n{recs}"
        )

    return {
        "text": text,
        "ai_mode": "live" if src == "live" else "cached",
        "detail_source": src,
        "ai_tag": AI_TAG,
        "model": model,
    }
