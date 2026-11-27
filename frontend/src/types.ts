export type AIMode = "live" | "cached";

export interface SplitScore {
  iou: number;
  f1: number;
}

export interface SettlementAffected {
  name: string;
  lat: number;
  lon: number;
  population_estimate: number | null;
  priority: "high" | "medium" | "low";
}

export interface CriticalInfrastructure {
  type: string;
  name: string;
  lat: number;
  lon: number;
}

export interface ChangePolygon {
  id: string;
  area_ha: number;
  ndvi_drop: number;
  confidence: number;
  near_river: boolean;
  status: string;
}

export interface ResultsPayload {
  sample: boolean;
  generated_at: string;
  model: {
    name: string;
    trained_on: string;
    metrics: {
      val: SplitScore;
      test: SplitScore;
      bolivia: SplitScore;
    };
    baseline_metrics: {
      test: SplitScore;
      bolivia: SplitScore;
    };
  };
  flood: {
    aoi_name: string;
    scene_before: string;
    scene_after: string;
    date_before: string;
    date_after: string;
    validated: boolean;
    flooded_area_ha: number;
    cropland_affected_ha: number;
    built_up_affected_ha: number;
    roads_affected_km: number;
    settlements_affected: SettlementAffected[];
    critical_infrastructure_affected: CriticalInfrastructure[];
  };
  change: {
    site_name: string;
    dates: {
      before: string;
      after: string;
    };
    changed_area_ha: number;
    vegetation_loss_ha: number;
    bare_soil_increase_ha: number;
    polygons: ChangePolygon[];
  };
  economics: {
    loss_per_ha_inr: number;
    assessment_time_manual_days: number;
    assessment_time_geoterra_hours: number;
  };
  onboard_sim: {
    raw_scene_size_mb: number;
    insight_packet_size_kb: number;
    downlink_rate_mbps: number;
  };
}

export interface DerivedMetrics {
  estimated_cropland_loss_inr: number;
  manual_assessment_hours: number;
  time_saved_hours: number;
  time_speedup_factor: number;
  compression_ratio: number;
  raw_downlink_seconds: number;
  packet_downlink_seconds: number;
}

export interface AssumptionsMap {
  loss_per_ha_inr: number;
  assessment_time_manual_days: number;
  assessment_time_geoterra_hours: number;
  raw_scene_size_mb: number;
  insight_packet_size_kb: number;
  downlink_rate_mbps: number;
  haps_altitude_km: number;
  haps_endurance_days: number;
  drone_endurance_min: number;
  drone_speed_kmh: number;
  onboard_processing_latency_sec: number;
  ground_queue_and_tasking_latency_min: number;
}

export interface ResultsResponse {
  results: ResultsPayload;
  derived: DerivedMetrics;
  assumptions: AssumptionsMap;
}

export interface StatusResponse {
  status: string;
  data_ready: boolean;
  sample: boolean;
  ai_mode: AIMode;
  nim_configured: boolean;
  assumptions: AssumptionsMap;
}

export interface SceneItem {
  id: string;
  datetime: string;
  orbit_direction: string;
  relative_orbit: number;
  polarizations: string[];
  selected_role: "before" | "after" | null;
}

export interface TrainingEpoch {
  epoch: number;
  train_loss: number;
  val_loss: number;
  val_iou: number;
  val_f1: number;
  lr: number;
}

export interface SplitEvalDetail extends SplitScore {
  precision: number;
  recall: number;
  confusion_matrix?: number[][];
}

export interface ModelResponse {
  model_card: {
    model_name: string;
    encoder: string;
    in_channels: string[];
    dataset: string;
    citation: string;
    trained_at: string;
    split_sizes: { train: number; val: number; test: number; bolivia: number };
    metrics: { val: SplitEvalDetail; test: SplitEvalDetail; bolivia: SplitEvalDetail };
    baseline_metrics: {
      method: string;
      best_vh_threshold_db: number;
      val: SplitEvalDetail;
      test: SplitEvalDetail;
      bolivia: SplitEvalDetail;
    };
    limitations: string[];
    karnataka_validation_note: string;
  };
  training_log: TrainingEpoch[];
}

export interface AIResponse {
  text: string;
  ai_mode: AIMode;
  detail_source: "live" | "disk_cache" | "template_fallback";
  ai_tag: string;
  model: string;
}

export interface TriageItem {
  rank: number;
  id: string;
  category: "flood_settlement" | "land_change";
  priority: "high" | "medium" | "low";
  score: number;
  rationale: string;
  recommended_action: string;
}

export interface TriageResponse {
  items: TriageItem[];
  summary: string;
  ai_mode: AIMode;
  detail_source: "live" | "disk_cache" | "template_fallback";
  ai_tag: string;
  model: string;
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, unknown>;
    geometry: {
      type: string;
      coordinates: unknown;
    };
  }>;
}

export interface WardRiskItem {
  ward_no: number;
  name: string;
  zone: string;
  lat: number;
  lon: number;
  major_lake: string;
  elevation_m: number;
  depression_m: number;
  distance_to_lake_km: number;
  base_susceptibility: number;
  s1_observed_water_ha: number;
  osm_roads_in_zone_km: number;
  osm_buildings_in_zone: number;
  risk_score: number;
  risk_level: "high" | "medium" | "low";
}

export interface FloodPredictionResponse {
  generated_at: string;
  aoi_name: string;
  sources: {
    elevation: string;
    rainfall: string;
    lakes_and_drains: string;
    sar_water: string;
    assets: string;
  };
  honesty_notice: string;
  scenario: {
    rainfall_24h_mm: number;
    is_observed_rainfall: boolean;
    mode_label: string;
  };
  summary: {
    potentially_affected_area_ha: number;
    high_risk_area_ha: number;
    medium_risk_area_ha: number;
    low_risk_area_ha: number;
    risk_zone_counts: { high: number; medium: number; low: number };
    estimated_affected_roads_km: number;
    estimated_affected_buildings: number;
  };
  rainfall: {
    source: string;
    recent_7d_mm: number;
    observed_24h_mm: number;
    monthly_history: Array<{
      month: string;
      rainfall_mm: number;
      peak_24h_mm: number;
      heavy_rain_days: number;
      risk_index: number;
    }>;
  };
  lakes: Array<{ name: string; lat: number; lon: number; type: string }>;
  wards: WardRiskItem[];
  historical_events: Array<{
    year: number;
    event: string;
    peak_24h_mm: number;
    hotspots: string;
    source: string;
  }>;
  risk_zones_geojson: GeoJSONFeatureCollection;
}

export interface LakeHistoryPoint {
  date: string;
  water_ha: number;
}

export interface LakeItem {
  id: string;
  name: string;
  zone: string;
  lat: number;
  lon: number;
  water_before_ha: number;
  water_mid_ha: number | null;
  water_after_ha: number;
  water_change_ha: number;
  water_change_pct: number;
  boundary_shift_ha: number;
  buffer_veg_loss_ha: number;
  buffer_construction_ha: number;
  trend_status: "Shrinking" | "Stable" | "Expanding" | string;
  is_shrinking: boolean;
  needs_immediate_attention: boolean;
  priority: "high" | "medium" | "low" | string;
  encroachment_status: string;
  images: {
    before: string;
    y2022?: string;
    y2024?: string;
    after: string;
    overlay: string;
  };
  history: LakeHistoryPoint[];
}

export interface LakeMonitoringResponse {
  generated_at: string;
  scenes: {
    before_id: string;
    mid_id: string | null;
    after_id: string;
    date_before: string;
    date_mid: string | null;
    date_after: string;
    source: string;
  };
  honesty_notice: string;
  summary: {
    total_lakes_monitored: number;
    total_water_before_ha: number;
    total_water_after_ha: number;
    shrinking_lakes_count: number;
    immediate_attention_count: number;
    total_buffer_construction_ha: number;
    total_buffer_veg_loss_ha: number;
  };
  lakes: LakeItem[];
  geojson: GeoJSONFeatureCollection;
}

export interface UrbanCorridorHistoryPoint {
  year: number;
  date: string;
  built_ha: number;
  veg_ha: number;
}

export interface UrbanCorridorItem {
  id: string;
  ward_no: number;
  name: string;
  zone: string;
  lat: number;
  lon: number;
  dist_core_km: number;
  window_land_ha: number;
  built_2019_ha: number;
  built_2026_ha: number;
  new_urban_ha: number;
  active_construction_ha: number;
  veg_2019_ha: number;
  veg_2026_ha: number;
  veg_loss_ha: number;
  veg_change_pct: number;
  annual_growth_ha: number;
  growth_rate_pct: number;
  remaining_developable_ha: number;
  water_note: string;
  history: UrbanCorridorHistoryPoint[];
  images: {
    before: string;
    y2022?: string;
    y2024?: string;
    after: string;
    overlay: string;
  };
  target_year: number;
  projected_added_ha: number;
  projected_built_ha: number;
  projected_veg_ha: number;
  projected_veg_loss_ha: number;
  growth_pressure_score: number;
  growth_tier: string;
  infrastructure_needs: string[];
  prediction_label: string;
}

export interface UrbanExpansionResponse {
  generated_at: string;
  scenes: Array<{ year: number; id: string; date: string }>;
  source: string;
  city_images: {
    before: string;
    after: string;
    overlay: string;
  };
  prediction_notice: string;
  summary: {
    total_corridors: number;
    measured_new_urban_ha: number;
    measured_active_construction_ha: number;
    measured_veg_loss_ha: number;
    projected_additional_urban_ha: number;
    fast_growing_count: number;
    infra_priority_count: number;
    horizon_years: number;
    target_year: number;
  };
  corridors: UrbanCorridorItem[];
  geojson: GeoJSONFeatureCollection;
}

export interface HeatZoneHistoryPoint {
  year: number;
  date: string;
  mean_lst_c: number;
  p90_lst_c: number;
  mean_ndvi: number;
}

export interface HeatZoneItem {
  id: string;
  ward_no: number;
  name: string;
  zone: string;
  lat: number;
  lon: number;
  mean_lst_2019_c: number;
  mean_lst_2026_c: number;
  p90_lst_2026_c: number;
  warming_delta_c: number;
  slope_c_per_yr: number;
  mean_ndvi_2019: number;
  mean_ndvi_2026: number;
  veg_loss_ha: number;
  hotspot_area_ha: number;
  plantation_target_ha: number;
  heat_driver: string;
  history: HeatZoneHistoryPoint[];
  images: {
    lst_before: string;
    lst_after: string;
    cooling: string;
  };
  target_year: number;
  heat_island_anomaly_c: number;
  projected_delta_c: number;
  projected_lst_c: number;
  potential_cooling_c: number;
  heat_score: number;
  heat_tier: string;
  cooling_interventions: string[];
  prediction_label: string;
}

export interface UrbanHeatResponse {
  generated_at: string;
  scenes: Array<{ year: number; id: string; date: string; sensor: string }>;
  source: string;
  honesty_notice: string;
  air_temp_benchmark: {
    current_air_temp_c: number;
    acq_day_max_air_temp_c: number;
    acq_date: string;
    source: string;
  };
  city_images: {
    lst_before: string;
    lst_after: string;
    cooling: string;
  };
  summary: {
    total_zones: number;
    city_mean_lst_2019_c: number;
    city_mean_lst_2026_c: number;
    hottest_zone_name: string;
    hottest_zone_lst_c: number;
    coolest_zone_lst_c: number;
    max_uhi_spread_c: number;
    severe_hotspot_count: number;
    total_veg_loss_ha: number;
    total_plantation_target_ha: number;
    horizon_years: number;
    target_year: number;
  };
  zones: HeatZoneItem[];
  geojson: GeoJSONFeatureCollection;
}

export interface InfraAssetItem {
  id: string;
  name: string;
  category: "roads_bridges" | "metro" | "power" | "water" | string;
  category_label: string;
  lat: number;
  lon: number;
  operator: string;
  criticality: string;
  elevation_m: number;
  depression_m: number;
  nearest_lake: string;
  distance_to_lake_km: number;
  flood_susceptibility: number;
  sentinel1_water_nearby: boolean;
  flood_exposed: boolean;
  nearby_roads_km: number;
  nearby_buildings_exposed: number;
  unusual_land_change_ha: number;
  nearby_veg_loss_ha: number;
  lake_buffer_shift_ha: number;
  nearby_heat_hotspot_ha: number;
  land_disturbance_flag: boolean;
  thermal_risk_flag: boolean;
  risk_score: number;
  risk_level: "High" | "Medium" | "Low" | string;
  needs_inspection: boolean;
  threat_tags: string[];
  recommended_action: string;
  status_label: string;
  images: {
    before: string;
    after: string;
    risk: string;
  };
}

export interface InfraAlertItem {
  id: string;
  asset_id: string;
  asset_name: string;
  category: string;
  severity: "HIGH" | "MEDIUM" | string;
  alert_type: string;
  title: string;
  summary: string;
  verification_label: string;
}

export interface InfrastructureResponse {
  generated_at: string;
  source: string;
  honesty_notice: string;
  summary: {
    total_assets_monitored: number;
    high_risk_count: number;
    flood_exposed_count: number;
    land_disturbance_count: number;
    thermal_exposed_count: number;
    inspection_queue_count: number;
    total_exposed_roads_km: number;
    total_exposed_buildings: number;
    active_alerts_count: number;
  };
  assets: InfraAssetItem[];
  alerts: InfraAlertItem[];
  corridors_geojson: GeoJSONFeatureCollection;
}

export interface SimulationMissionItem {
  id: string;
  title: string;
  hazard_type: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | string;
  trigger_source: string;
  auto_alert: {
    alert_id: string;
    headline: string;
    metrics_summary: string;
  };
  satellite_track: Array<[number, number]>;
  haps_station: {
    name: string;
    lat: number;
    lon: number;
    altitude_km: number;
  };
  drone_hub: {
    name: string;
    lat: number;
    lon: number;
  };
  target: {
    name: string;
    lat: number;
    lon: number;
  };
  drone_waypoints: Array<[number, number]>;
  simulated_captures: Array<{
    label: string;
    image_url: string;
    caption: string;
  }>;
  drone_findings: {
    distance_km: number;
    flight_duration_min: number;
    water_depth_est_m: number;
    road_corridors_blocked: string[];
    immediate_attention_areas: string[];
    recommended_actions: string[];
  };
}

export interface SimulationMissionsResponse {
  generated_at: string;
  simulation_notice: string;
  missions: SimulationMissionItem[];
}

export interface EngineFocusLocation {
  id: string;
  name: string;
  focus: string;
  lat: number;
  lon: number;
  primary_module: string;
  risk_level: "High" | "Medium" | "Low" | string;
  risk_score: number;
  monitoring_summary: string;
  detected_changes: string;
  images: {
    before: string;
    after: string;
    before_label: string;
    after_label: string;
  };
  status_label: string;
}

export interface EngineModuleItem {
  id: string;
  name: string;
  route: string;
  data_used: string[];
  ai_model_analysis: string;
  current_condition: string;
  future_prediction: string;
  risk_breakdown: {
    high: number;
    medium: number;
    low: number;
  };
  chart_series: Array<{
    name: string;
    current: number;
    future: number;
    risk_level: string;
  }>;
  map_items?: Array<{
    id: string;
    name: string;
    lat: number;
    lon: number;
    risk_level: string;
    risk_score: number;
    summary: string;
  }>;
  geojson?: GeoJSONFeatureCollection;
  recommendations: string[];
  honest_label: string;
}

export interface PredictionEngineResponse {
  generated_at: string;
  honesty_notice: string;
  parameters: {
    rainfall_mm: number;
    horizon_years: number;
    target_year: number;
  };
  focus_locations: EngineFocusLocation[];
  modules: {
    flood: EngineModuleItem;
    urban_growth: EngineModuleItem;
    heat: EngineModuleItem;
    lake_health: EngineModuleItem;
  };
}
