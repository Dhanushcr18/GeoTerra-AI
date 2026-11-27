import type {
  AIResponse,
  FloodPredictionResponse,
  GeoJSONFeatureCollection,
  LakeMonitoringResponse,
  ModelResponse,
  ResultsResponse,
  SceneItem,
  StatusResponse,
  TriageResponse,
  UrbanExpansionResponse,
  UrbanHeatResponse,
  InfrastructureResponse,
  SimulationMissionsResponse,
  PredictionEngineResponse,
} from "../types";

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try {
      const errBody = (await resp.json()) as { detail?: string };
      if (errBody.detail) msg = errBody.detail;
    } catch {
      // ignore non-json error body
    }
    throw new Error(msg);
  }
  return (await resp.json()) as T;
}

export const api = {
  getStatus: () => fetchJSON<StatusResponse>("/api/status"),
  getResults: () => fetchJSON<ResultsResponse>("/api/results"),
  getGeoLayer: (layer: "flood_extent" | "assets" | "change" | "aoi") =>
    fetchJSON<GeoJSONFeatureCollection>(`/api/geo/${layer}`),
  getScenes: () => fetchJSON<SceneItem[]>("/api/scenes"),
  getModel: () => fetchJSON<ModelResponse>("/api/model"),
  postAlert: (authority: string, demoMode: boolean, focus?: string) =>
    fetchJSON<AIResponse>("/api/ai/alert", {
      method: "POST",
      body: JSON.stringify({ authority, demo_mode: demoMode, focus }),
    }),
  postDescribeSite: (demoMode: boolean, polygonId?: string) =>
    fetchJSON<AIResponse>("/api/ai/describe-site", {
      method: "POST",
      body: JSON.stringify({
        polygon_id: polygonId ?? null,
        before_image: "s2_before.png",
        after_image: "s2_after.png",
        demo_mode: demoMode,
      }),
    }),
  postTriage: (demoMode: boolean) =>
    fetchJSON<TriageResponse>("/api/ai/triage", {
      method: "POST",
      body: JSON.stringify({ demo_mode: demoMode }),
    }),
  postAsk: (question: string, demoMode: boolean) =>
    fetchJSON<AIResponse>("/api/ai/ask", {
      method: "POST",
      body: JSON.stringify({ question, demo_mode: demoMode }),
    }),
  downloadPdfReport: async (demoMode: boolean, missionId?: string): Promise<void> => {
    const qs = new URLSearchParams({ demo_mode: String(demoMode) });
    if (missionId) qs.set("mission_id", missionId);
    const resp = await fetch(`/api/report/pdf?${qs.toString()}`, { method: "POST" });
    if (!resp.ok) throw new Error(`PDF generation failed (HTTP ${resp.status})`);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "GeoTerra_Evidence_Report.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  getFloodPrediction: (rainfallMm: number) =>
    fetchJSON<FloodPredictionResponse>(`/api/flood-prediction?rainfall_mm=${encodeURIComponent(rainfallMm)}`),
  explainFloodPrediction: (payload: {
    area_name: string;
    rainfall_24h_mm: number;
    question?: string;
    demo_mode: boolean;
  }) =>
    fetchJSON<AIResponse>("/api/flood-prediction/explain", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getLakeMonitoring: (refresh = false) =>
    fetchJSON<LakeMonitoringResponse>(`/api/lake-monitoring${refresh ? "?refresh=true" : ""}`),
  explainLakeMonitoring: (payload: {
    lake_id?: string | null;
    question?: string;
    demo_mode: boolean;
  }) =>
    fetchJSON<AIResponse>("/api/lake-monitoring/explain", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getUrbanExpansion: (horizonYears = 5, refresh = false) =>
    fetchJSON<UrbanExpansionResponse>(
      `/api/urban-expansion?horizon_years=${encodeURIComponent(horizonYears)}${refresh ? "&refresh=true" : ""}`,
    ),
  explainUrbanExpansion: (payload: {
    corridor_id?: string | null;
    horizon_years: number;
    question?: string;
    demo_mode: boolean;
  }) =>
    fetchJSON<AIResponse>("/api/urban-expansion/explain", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getUrbanHeat: (horizonYears = 5, refresh = false) =>
    fetchJSON<UrbanHeatResponse>(
      `/api/urban-heat?horizon_years=${encodeURIComponent(horizonYears)}${refresh ? "&refresh=true" : ""}`,
    ),
  explainUrbanHeat: (payload: {
    zone_id?: string | null;
    horizon_years: number;
    question?: string;
    demo_mode: boolean;
  }) =>
    fetchJSON<AIResponse>("/api/urban-heat/explain", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getInfrastructure: (refresh = false) =>
    fetchJSON<InfrastructureResponse>(`/api/infrastructure${refresh ? "?refresh=true" : ""}`),
  explainInfrastructure: (payload: {
    asset_id?: string | null;
    question?: string;
    demo_mode: boolean;
  }) =>
    fetchJSON<AIResponse>("/api/infrastructure/explain", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getSimulationMissions: () => fetchJSON<SimulationMissionsResponse>("/api/simulation/missions"),
  explainSimulationMission: (payload: {
    mission_id?: string | null;
    stage: number;
    question?: string;
    demo_mode: boolean;
  }) =>
    fetchJSON<AIResponse>("/api/simulation/explain", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getPredictionEngine: (rainfallMm = 65, horizonYears = 5) =>
    fetchJSON<PredictionEngineResponse>(
      `/api/prediction-engine?rainfall_mm=${encodeURIComponent(rainfallMm)}&horizon_years=${encodeURIComponent(horizonYears)}`,
    ),
  explainPredictionEngine: (payload: {
    location_id?: string | null;
    module_id?: string | null;
    rainfall_mm: number;
    horizon_years: number;
    question?: string;
    demo_mode: boolean;
  }) =>
    fetchJSON<AIResponse>("/api/prediction-engine/explain", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
