import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CircleMarker, GeoJSON as LeafletGeoJSON, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowRight,
  Bot,
  Building2,
  CloudRain,
  Cpu,
  Database,
  Droplets,
  Flame,
  MapPin,
  Sparkles,
} from "lucide-react";
import { api } from "../api/client";
import { BeforeAfterSlider } from "../components/BeforeAfterSlider";
import { useGeoTerra } from "../context/GeoTerraContext";
import { AITagBadge, AssumptionTag, Badge, ErrorBox, LoadingSkeleton, Panel } from "../components/ui";
import type {
  AIResponse,
  EngineFocusLocation,
  EngineModuleItem,
  PredictionEngineResponse,
} from "../types";

const FlyToLocation: React.FC<{ lat: number; lon: number }> = ({ lat, lon }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], 12, { duration: 0.7 });
  }, [lat, lon, map]);
  return null;
};

const RISK_TONE: Record<string, "coral" | "gold" | "mint"> = {
  High: "coral",
  Medium: "gold",
  Low: "mint",
};

const MODULE_ORDER: Array<{
  key: "flood" | "urban_growth" | "heat" | "lake_health";
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "flood", icon: CloudRain },
  { key: "urban_growth", icon: Building2 },
  { key: "heat", icon: Flame },
  { key: "lake_health", icon: Droplets },
];

export const PredictionEnginePage: React.FC = () => {
  const { demoMode } = useGeoTerra();

  const [rainfallMm, setRainfallMm] = useState<number>(65);
  const [horizonYears, setHorizonYears] = useState<number>(5);
  const [data, setData] = useState<PredictionEngineResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedLocId, setSelectedLocId] = useState<string>("hebbal_valley");
  const [activeModKey, setActiveModKey] = useState<"flood" | "urban_growth" | "heat" | "lake_health">("flood");
  const [mapMode, setMapMode] = useState<"module" | "sites">("module");
  const [riskFilter, setRiskFilter] = useState<"all" | "High" | "Medium" | "Low">("all");
  const [baseLayer, setBaseLayer] = useState<"osm" | "sat">("osm");

  const [aiQuestion, setAiQuestion] = useState<string>("");
  const [aiResult, setAiResult] = useState<AIResponse | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  const loadEngine = async (rain = rainfallMm, hor = horizonYears) => {
    try {
      if (!data) setLoading(true);
      setError(null);
      const res = await api.getPredictionEngine(rain, hor);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load unified Bengaluru AI prediction engine");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEngine(rainfallMm, horizonYears);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rainfallMm, horizonYears]);

  const selectedLocation: EngineFocusLocation | null = useMemo(() => {
    if (!data?.focus_locations?.length) return null;
    return data.focus_locations.find((l) => l.id === selectedLocId) ?? data.focus_locations[0];
  }, [data, selectedLocId]);

  const activeModule: EngineModuleItem | null = useMemo(() => {
    if (!data?.modules) return null;
    return data.modules[activeModKey];
  }, [data, activeModKey]);

  const askEngineAI = async (overrideQ?: string) => {
    if (!selectedLocation) return;
    setAiLoading(true);
    try {
      const q = (overrideQ ?? aiQuestion).trim();
      const res = await api.explainPredictionEngine({
        location_id: selectedLocation.id,
        module_id: activeModKey,
        rainfall_mm: rainfallMm,
        horizon_years: horizonYears,
        question: q || undefined,
        demo_mode: demoMode,
      });
      setAiResult(res);
    } catch (e) {
      setAiResult({
        text: e instanceof Error ? e.message : "Unable to reach NIM Prediction Advisor.",
        ai_mode: "cached",
        detail_source: "template_fallback",
        ai_tag: "AI-assisted, requires official verification",
        model: "fallback",
      });
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    if (selectedLocation && !aiResult && !aiLoading) {
      void askEngineAI();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation?.id]);

  if (loading) return <LoadingSkeleton rows={5} />;
  if (error || !data || !selectedLocation || !activeModule) {
    return (
      <ErrorBox
        message={error ?? "No prediction engine telemetry found"}
        onRetry={() => void loadEngine(rainfallMm, horizonYears)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Unified Header + Interactive Scenario Parameters */}
      <Panel
        eyebrow="BENGALURU UNIFIED MONITORING & 4-MODULE AI PREDICTION ENGINE"
        title="Integrated Valley & Lake Observatory"
        subtitle={data.honesty_notice}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <AssumptionTag label={`Scenario: ${rainfallMm}mm Rain · +${horizonYears}y (${data.parameters.target_year})`} />
            <div className="flex items-center gap-1 rounded-xl border border-outline-variant/40 bg-surface-container px-2.5 py-1 font-mono text-xs">
              <span className="text-secondary">Rain:</span>
              {[40, 65, 110].map((mm) => (
                <button
                  key={mm}
                  type="button"
                  onClick={() => setRainfallMm(mm)}
                  className={`rounded-md px-2 py-0.5 ${
                    rainfallMm === mm ? "bg-primary-container font-bold text-on-primary-container" : "text-secondary"
                  }`}
                >
                  {mm}mm
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-outline-variant/40 bg-surface-container px-2.5 py-1 font-mono text-xs">
              <span className="text-secondary">Forecast:</span>
              {[3, 5, 7].map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setHorizonYears(yr)}
                  className={`rounded-md px-2 py-0.5 ${
                    horizonYears === yr ? "bg-tertiary-container font-bold text-on-tertiary-container" : "text-secondary"
                  }`}
                >
                  +{yr}y
                </button>
              ))}
            </div>
          </div>
        }
      >
        {/* Six Key Bengaluru Locations Strip */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.focus_locations.map((loc) => {
            const active = loc.id === selectedLocation.id;
            return (
              <button
                key={loc.id}
                type="button"
                onClick={() => {
                  setSelectedLocId(loc.id);
                  if (loc.primary_module === "flood" || loc.primary_module === "urban_growth" || loc.primary_module === "heat" || loc.primary_module === "lake_health") {
                    setActiveModKey(loc.primary_module);
                  }
                }}
                className={`rounded-xl border p-3.5 text-left transition ${
                  active
                    ? "border-primary bg-primary-container/15 shadow-[0_0_14px_rgba(251,191,36,0.16)]"
                    : "border-outline-variant/30 bg-surface-container hover:border-outline-variant"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-semibold text-sm text-on-surface">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    {loc.name}
                  </span>
                  <Badge tone={RISK_TONE[loc.risk_level] ?? "gold"}>
                    {loc.risk_level.toUpperCase()} ({loc.risk_score.toFixed(0)})
                  </Badge>
                </div>
                <p className="mt-1 text-xs font-medium text-tertiary">{loc.focus}</p>
                <p className="mt-1 text-[11px] text-secondary line-clamp-2">{loc.monitoring_summary}</p>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* Interactive Bengaluru Map (Active Module Overlays + 6 Flagship Locations) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          className="xl:col-span-7"
          eyebrow={
            mapMode === "module"
              ? `ACTIVE MODULE MAP // ${activeModule.name.toUpperCase()}`
              : "6 FLAGSHIP MONITORING SITES // CLICK ANY LOCATION TO INSPECT"
          }
          title={
            mapMode === "module"
              ? `${activeModule.name} Spatial Results on Bengaluru Map`
              : "Bengaluru Valleys, Lakes & Growth Hubs Map"
          }
          right={
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
              <button
                type="button"
                onClick={() => setMapMode("module")}
                className={`rounded-lg border px-2.5 py-1 ${
                  mapMode === "module"
                    ? "border-primary/60 bg-primary-container/20 text-primary font-semibold"
                    : "border-outline-variant/30 text-secondary"
                }`}
              >
                Module Layer
              </button>
              <button
                type="button"
                onClick={() => setMapMode("sites")}
                className={`rounded-lg border px-2.5 py-1 ${
                  mapMode === "sites"
                    ? "border-tertiary/60 bg-tertiary-container/20 text-tertiary font-semibold"
                    : "border-outline-variant/30 text-secondary"
                }`}
              >
                6 Valley Sites
              </button>
              {(["all", "High", "Medium", "Low"] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setRiskFilter(lvl)}
                  className={`rounded-lg border px-2 py-1 ${
                    riskFilter === lvl
                      ? "border-primary/60 bg-surface-container-high text-on-surface font-semibold"
                      : "border-outline-variant/30 text-secondary"
                  }`}
                >
                  {lvl === "all" ? "All" : lvl}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setBaseLayer((b) => (b === "osm" ? "sat" : "osm"))}
                className="rounded-lg border border-outline-variant/40 bg-surface-container px-2.5 py-1 text-on-surface hover:border-primary/60"
              >
                {baseLayer === "osm" ? "Satellite Map" : "Street Map"}
              </button>
            </div>
          }
        >
          <div className="h-[430px] w-full overflow-hidden rounded-xl border border-outline-variant/40">
            <MapContainer
              center={[selectedLocation.lat, selectedLocation.lon]}
              zoom={12}
              className="h-full w-full"
              scrollWheelZoom
            >
              <FlyToLocation lat={selectedLocation.lat} lon={selectedLocation.lon} />
              {baseLayer === "osm" ? (
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              ) : (
                <TileLayer
                  attribution="Tiles &copy; Esri"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
              )}

              {mapMode === "module" && activeModule.geojson && activeModule.geojson.features.length > 0 && (
                <LeafletGeoJSON
                  key={`mod-geo-${activeModKey}-${rainfallMm}-${horizonYears}`}
                  data={activeModule.geojson as any}
                  style={(feat) => {
                    const c = feat?.properties?.engine_color ?? "#fbbf24";
                    return { color: c, weight: 1.3, fillColor: c, fillOpacity: 0.36 };
                  }}
                />
              )}

              {mapMode === "module" && activeModule.map_items
                ? activeModule.map_items
                    .filter((it) => riskFilter === "all" || it.risk_level === riskFilter)
                    .map((it) => {
                      const color =
                        it.risk_level === "High" ? "#f87171" : it.risk_level === "Medium" ? "#fbbf24" : "#72ff9e";
                      return (
                        <CircleMarker
                          key={`${activeModKey}-${it.id}`}
                          center={[it.lat, it.lon]}
                          radius={10}
                          pathOptions={{ color, weight: 2, fillColor: color, fillOpacity: 0.72 }}
                        >
                          <Popup>
                            <div className="min-w-[210px] space-y-1 text-xs text-slate-900">
                              <p className="font-bold text-sm">{it.name}</p>
                              <p className="font-medium text-emerald-800">{activeModule.name}</p>
                              <p>
                                Risk Level: <b>{it.risk_level} ({it.risk_score.toFixed(0)}/100)</b>
                              </p>
                              <p>{it.summary}</p>
                            </div>
                          </Popup>
                        </CircleMarker>
                      );
                    })
                : data.focus_locations
                    .filter((loc) => riskFilter === "all" || loc.risk_level === riskFilter)
                    .map((loc) => {
                      const isSel = loc.id === selectedLocation.id;
                      const color =
                        loc.risk_level === "High" ? "#f87171" : loc.risk_level === "Medium" ? "#fbbf24" : "#72ff9e";
                      return (
                        <CircleMarker
                          key={loc.id}
                          center={[loc.lat, loc.lon]}
                          radius={isSel ? 15 : 10}
                          pathOptions={{
                            color: isSel ? "#ffffff" : color,
                            weight: isSel ? 3 : 2,
                            fillColor: color,
                            fillOpacity: 0.72,
                          }}
                          eventHandlers={{
                            click: () => setSelectedLocId(loc.id),
                          }}
                        >
                          <Popup>
                            <div className="min-w-[220px] space-y-1 text-xs text-slate-900">
                              <p className="font-bold text-sm">{loc.name}</p>
                              <p className="font-medium text-emerald-800">{loc.focus}</p>
                              <p>
                                Risk Level: <b>{loc.risk_level} ({loc.risk_score.toFixed(0)}/100)</b>
                              </p>
                              <p>{loc.detected_changes}</p>
                            </div>
                          </Popup>
                        </CircleMarker>
                      );
                    })}
            </MapContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-secondary">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" /> High Risk
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Medium Risk
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#72ff9e]" /> Low Risk
              </span>
            </div>
            <span className="font-mono text-[11px] text-primary">Selected: {selectedLocation.name}</span>
          </div>
        </Panel>

        {/* Right: Selected Location Satellite Comparison & Changes */}
        <Panel
          className="xl:col-span-5"
          eyebrow={`LOCATION INSPECTOR // ${selectedLocation.focus}`}
          title={selectedLocation.name}
          right={
            <Badge tone={RISK_TONE[selectedLocation.risk_level] ?? "gold"}>
              {selectedLocation.risk_level.toUpperCase()} RISK ({selectedLocation.risk_score.toFixed(0)})
            </Badge>
          }
        >
          <BeforeAfterSlider
            beforeSrc={selectedLocation.images.before}
            afterSrc={selectedLocation.images.after}
            beforeAlt={`${selectedLocation.name} baseline`}
            afterAlt={`${selectedLocation.name} detected change`}
            beforeLabel={selectedLocation.images.before_label}
            afterLabel={selectedLocation.images.after_label}
            heightClass="h-64"
          />

          <div className="mt-4 space-y-2.5 text-xs">
            <div className="rounded-xl border border-outline-variant/25 bg-surface-container p-3">
              <p className="font-mono text-[10px] uppercase text-secondary">Monitoring Telemetry</p>
              <p className="mt-1 text-on-surface leading-relaxed">{selectedLocation.monitoring_summary}</p>
            </div>
            <div className="rounded-xl border border-outline-variant/25 bg-surface-container p-3">
              <p className="font-mono text-[10px] uppercase text-secondary">Detected Satellite Changes</p>
              <p className="mt-1 text-tertiary leading-relaxed">{selectedLocation.detected_changes}</p>
            </div>
            <p className="rounded-lg border border-primary/30 bg-primary-container/10 px-3 py-2 font-mono text-[11px] text-primary">
              {selectedLocation.status_label}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link
                to={`/simulation?mission=${
                  selectedLocation.id === "vrishabhavathi_valley"
                    ? "nayandahalli_culvert_surge"
                    : selectedLocation.id === "varthur_lake" || selectedLocation.id === "whitefield"
                      ? "varthur_lake_overflow"
                      : "bellandur_flood_response"
                }&autostart=1`}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary-container px-3 py-2 font-mono text-xs font-bold text-on-primary-container hover:opacity-90"
              >
                <span>Dispatch Sim Response (Sat→HAPS→Drone)</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </Panel>
      </div>

      {/* Connected 4-Module AI Prediction Engine Dashboard */}
      <Panel
        eyebrow="CONNECTED 4-MODULE AI PREDICTION ENGINE"
        title="Unified Multi-Hazard Prediction & Risk Breakdown"
        subtitle="Switch between Flood, Urban Growth, Heat, and Lake Health modules or open each standalone observatory."
        right={
          <Link
            to={activeModule.route}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary-container px-3.5 py-1.5 font-mono text-xs font-bold text-on-primary-container hover:opacity-90"
          >
            <span>Open Full {activeModule.name}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      >
        {/* 4 Module Switcher Cards */}
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MODULE_ORDER.map(({ key, icon: Icon }) => {
            const mod = data.modules[key];
            const isSel = activeModKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setActiveModKey(key);
                  setMapMode("module");
                }}
                className={`rounded-xl border p-3.5 text-left transition ${
                  isSel
                    ? "border-primary bg-primary-container/15 shadow-[0_0_14px_rgba(251,191,36,0.14)]"
                    : "border-outline-variant/30 bg-surface-container hover:border-outline-variant"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-semibold text-sm text-on-surface">
                    <Icon className="h-4 w-4 text-primary" />
                    {mod.name}
                  </span>
                </div>
                <div className="mt-2.5 flex items-center gap-2 font-mono text-[11px]">
                  <span className="rounded bg-error-container/60 px-1.5 py-0.5 text-on-error-container">
                    H: {mod.risk_breakdown.high}
                  </span>
                  <span className="rounded bg-primary-container/20 px-1.5 py-0.5 text-primary">
                    M: {mod.risk_breakdown.medium}
                  </span>
                  <span className="rounded bg-tertiary-container/20 px-1.5 py-0.5 text-tertiary">
                    L: {mod.risk_breakdown.low}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Module Deep Details + Chart */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-6">
            <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
              <p className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-secondary">
                <Database className="h-3.5 w-3.5 text-tertiary" /> Data Used for Prediction
              </p>
              <ul className="mt-2 space-y-1 text-xs text-on-surface">
                {activeModule.data_used.map((d) => (
                  <li key={d}>• {d}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4 text-xs space-y-2">
              <p className="flex items-center gap-1.5 font-mono uppercase tracking-wider text-secondary">
                <Cpu className="h-3.5 w-3.5 text-primary" /> AI Model Analysis
              </p>
              <p className="text-on-surface">{activeModule.ai_model_analysis}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1">
                <div className="rounded-lg bg-surface-container-low p-2.5">
                  <span className="font-mono text-[10px] uppercase text-tertiary">Current Condition</span>
                  <p className="mt-1 text-on-surface">{activeModule.current_condition}</p>
                </div>
                <div className="rounded-lg bg-surface-container-low p-2.5">
                  <span className="font-mono text-[10px] uppercase text-warning-orange">
                    Future Prediction (Estimate)
                  </span>
                  <p className="mt-1 text-on-surface">{activeModule.future_prediction}</p>
                </div>
              </div>
              <p className="font-mono text-[10px] text-primary pt-1">{activeModule.honest_label}</p>
            </div>

            <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4 text-xs">
              <p className="font-mono uppercase tracking-wider text-secondary">Actionable Recommendations</p>
              <ul className="mt-2 space-y-1 text-on-surface">
                {activeModule.recommendations.map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-4 xl:col-span-6">
            <div className="h-64 rounded-xl border border-outline-variant/30 bg-surface-container p-4">
              <p className="mb-2 font-mono text-xs uppercase text-secondary">
                {activeModule.name} — Current Observed vs Estimated Projection
              </p>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={activeModule.chart_series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#04251b",
                      border: "1px solid rgba(251,191,36,0.3)",
                      borderRadius: "10px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Bar dataKey="current" name="Current / Baseline" fill="#72ff9e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="future" name="Estimated Future / After" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Integrated NIM AI Advisor */}
            <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-primary">AI Prediction &amp; Recommendation Advisor</span>
                <div className="flex items-center gap-1.5">
                  <AITagBadge />
                  {aiResult && (
                    <Badge tone={aiResult.ai_mode === "live" ? "mint" : "gold"}>
                      <Sparkles className="h-3 w-3" />
                      AI: {aiResult.ai_mode}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="mb-3 flex gap-2">
                <input
                  type="text"
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void askEngineAI();
                  }}
                  placeholder={`Ask about ${selectedLocation.name} or ${activeModule.name}…`}
                  className="flex-1 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-1.5 text-xs text-on-surface focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void askEngineAI()}
                  disabled={aiLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary-container px-3.5 py-1.5 text-xs font-semibold text-on-primary-container hover:opacity-90 disabled:opacity-60"
                >
                  <Bot className="h-3.5 w-3.5" />
                  {aiLoading ? "Analyzing…" : "Ask AI"}
                </button>
              </div>
              <div className="min-h-[155px] whitespace-pre-wrap rounded-xl border border-outline-variant/25 bg-surface-container-lowest p-3 text-xs leading-relaxed text-on-surface">
                {aiLoading ? (
                  <p className="animate-pulse font-mono text-secondary">
                    Synthesizing Bengaluru 4-module prediction telemetry with NIM…
                  </p>
                ) : aiResult ? (
                  aiResult.text
                ) : (
                  "Select a Bengaluru valley/lake or module and click Ask AI."
                )}
              </div>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
};
