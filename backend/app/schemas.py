"""Pydantic v2 schemas enforcing the GeoTerra AI data contract and API payloads."""

from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class SplitScore(BaseModel):
    iou: float
    f1: float


class ModelMetricsBlock(BaseModel):
    val: SplitScore
    test: SplitScore
    bolivia: SplitScore


class BaselineMetricsBlock(BaseModel):
    test: SplitScore
    bolivia: SplitScore


class ModelSection(BaseModel):
    name: str
    trained_on: str
    metrics: ModelMetricsBlock
    baseline_metrics: BaselineMetricsBlock


class SettlementAffected(BaseModel):
    name: str
    lat: float
    lon: float
    population_estimate: Optional[int] = None
    priority: Literal["high", "medium", "low"]


class CriticalInfrastructure(BaseModel):
    type: str
    name: str
    lat: float
    lon: float


class FloodSection(BaseModel):
    aoi_name: str
    scene_before: str
    scene_after: str
    date_before: str
    date_after: str
    validated: bool = False
    flooded_area_ha: float
    cropland_affected_ha: float
    built_up_affected_ha: float
    roads_affected_km: float
    settlements_affected: List[SettlementAffected]
    critical_infrastructure_affected: List[CriticalInfrastructure]


class ChangeDates(BaseModel):
    before: str
    after: str


class ChangePolygon(BaseModel):
    id: str
    area_ha: float
    ndvi_drop: float
    confidence: float
    near_river: bool
    status: str = "Potential suspicious activity: requires official verification"

    @field_validator("status")
    @classmethod
    def enforce_verification_label(cls, v: str) -> str:
        required = "Potential suspicious activity: requires official verification"
        return required if "illegal" in v.lower() or not v.strip() else v


class ChangeSection(BaseModel):
    site_name: str
    dates: ChangeDates
    changed_area_ha: float
    vegetation_loss_ha: float
    bare_soil_increase_ha: float
    polygons: List[ChangePolygon]


class EconomicsSection(BaseModel):
    loss_per_ha_inr: float
    assessment_time_manual_days: float
    assessment_time_geoterra_hours: float


class OnboardSimSection(BaseModel):
    raw_scene_size_mb: float
    insight_packet_size_kb: float
    downlink_rate_mbps: float


class ResultsPayload(BaseModel):
    sample: bool
    generated_at: str
    model: ModelSection
    flood: FloodSection
    change: ChangeSection
    economics: EconomicsSection
    onboard_sim: OnboardSimSection


class DerivedMetrics(BaseModel):
    estimated_cropland_loss_inr: float
    manual_assessment_hours: float
    time_saved_hours: float
    time_speedup_factor: float
    compression_ratio: float
    raw_downlink_seconds: float
    packet_downlink_seconds: float


class ResultsResponse(BaseModel):
    results: ResultsPayload
    derived: DerivedMetrics
    assumptions: Dict[str, float]


class AlertRequest(BaseModel):
    authority: str = "Karnataka State Disaster Management Authority (KSDMA)"
    focus: Optional[str] = None
    demo_mode: bool = False


class DescribeSiteRequest(BaseModel):
    polygon_id: Optional[str] = None
    before_image: str = "s2_before.png"
    after_image: str = "s2_after.png"
    demo_mode: bool = False


class TriageRequest(BaseModel):
    demo_mode: bool = False


class AskRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=600)
    demo_mode: bool = False


class FloodPredictExplainRequest(BaseModel):
    area_name: str = Field(..., min_length=2, max_length=120)
    rainfall_24h_mm: float = 65.0
    question: Optional[str] = None
    demo_mode: bool = False


class LakeExplainRequest(BaseModel):
    lake_id: Optional[str] = None
    question: Optional[str] = None
    demo_mode: bool = False


class UrbanExplainRequest(BaseModel):
    corridor_id: Optional[str] = None
    horizon_years: int = 5
    question: Optional[str] = None
    demo_mode: bool = False


class HeatExplainRequest(BaseModel):
    zone_id: Optional[str] = None
    horizon_years: int = 5
    question: Optional[str] = None
    demo_mode: bool = False


class InfrastructureExplainRequest(BaseModel):
    asset_id: Optional[str] = None
    question: Optional[str] = None
    demo_mode: bool = False


class SimulationExplainRequest(BaseModel):
    mission_id: Optional[str] = None
    stage: int = 5
    question: Optional[str] = None
    demo_mode: bool = False


class PredictionEngineExplainRequest(BaseModel):
    location_id: Optional[str] = None
    module_id: Optional[str] = None
    rainfall_mm: float = 65.0
    horizon_years: int = 5
    question: Optional[str] = None
    demo_mode: bool = False


class AIResponse(BaseModel):
    text: str
    ai_mode: Literal["live", "cached"]
    detail_source: Literal["live", "disk_cache", "template_fallback"]
    ai_tag: str = "AI-assisted, requires official verification"
    model: str


class TriageItem(BaseModel):
    rank: int
    id: str
    category: Literal["flood_settlement", "land_change"]
    priority: Literal["high", "medium", "low"]
    score: float
    rationale: str
    recommended_action: str


class TriageResponse(BaseModel):
    items: List[TriageItem]
    summary: str
    ai_mode: Literal["live", "cached"]
    detail_source: Literal["live", "disk_cache", "template_fallback"]
    ai_tag: str = "AI-assisted, requires official verification"
    model: str
