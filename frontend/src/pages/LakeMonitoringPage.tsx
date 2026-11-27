import React, { useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON as LeafletGeoJSON, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Bot,
  Droplets,
  Eye,
  Layers,
  MapPin,
  RefreshCw,
  Satellite,
  ShieldAlert,
  Sparkles,
  Trees,
  TrendingDown,
} from "lucide-react";
import { api } from "../api/client";
import { BeforeAfterSlider } from "../components/BeforeAfterSlider";
import { useGeoTerra } from "../context/GeoTerraContext";
import { AITagBadge, Badge, ErrorBox, LoadingSkeleton, Panel } from "../components/ui";
import type { AIResponse, GeoJSONFeatureCollection, LakeItem, LakeMonitoringResponse } from "../types";

const FlyToLake: React.FC<{ lat: number; lon: number }> = ({ lat, lon }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], 14, { duration: 0.7 });
  }, [lat, lon, map]);
  return null;
};

const PRIORITY_TONE: Record<string, "coral" | "gold" | "mint"> = {
  high: "coral",
  medium: "gold",
  low: "mint",
};

export const LakeMonitoringPage: React.FC = () => {
  const { demoMode } = useGeoTerra();

  const [data, setData] = useState<LakeMonitoringResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedLakeId, setSelectedLakeId] = useState<string>("bellandur");
  const [compareMode, setCompareMode] = useState<"overlay" | "after">("overlay");
  const [filterPriority, setFilterPriority] = useState<"all" | "attention" | "shrinking">("all");
  const [baseLayer, setBaseLayer] = useState<"osm" | "sat">("osm");

  const [showBeforeWater, setShowBeforeWater] = useState(true);
  const [showAfterWater, setShowAfterWater] = useState(true);
  const [showBufferChange, setShowBufferChange] = useState(true);

  const [aiQuestion, setAiQuestion] = useState("");
  const [aiResult, setAiResult] = useState<AIResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const loadLakes = async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const res = await api.getLakeMonitoring(refresh);
      setData(res);
      if (res.lakes.length > 0 && !res.lakes.some((l) => l.id === selectedLakeId)) {
        setSelectedLakeId(res.lakes[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Bengaluru lake telemetry");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadLakes(false);
  }, []);

  const selectedLake: LakeItem | null = useMemo(() => {
    if (!data || data.lakes.length === 0) return null;
    return data.lakes.find((l) => l.id === selectedLakeId) ?? data.lakes[0];
  }, [data, selectedLakeId]);

  const filteredLakes = useMemo(() => {
    if (!data) return [];
    if (filterPriority === "attention") {
      return data.lakes.filter((l) => l.needs_immediate_attention);
    }
    if (filterPriority === "shrinking") {
      return data.lakes.filter((l) => l.is_shrinking);
    }
    return data.lakes;
  }, [data, filterPriority]);

  const layerCollections = useMemo(() => {
    const empty: GeoJSONFeatureCollection = { type: "FeatureCollection", features: [] };
    if (!data?.geojson?.features) {
      return { before: empty, after: empty, buffer: empty };
    }
    return {
      before: {
        type: "FeatureCollection" as const,
        features: data.geojson.features.filter((f) => f.properties?.layer_kind === "water_before"),
      },
      after: {
        type: "FeatureCollection" as const,
        features: data.geojson.features.filter((f) => f.properties?.layer_kind === "water_after"),
      },
      buffer: {
        type: "FeatureCollection" as const,
        features: data.geojson.features.filter((f) => f.properties?.layer_kind === "buffer_change"),
      },
    };
  }, [data]);

  const chartData = useMemo(() => {
    if (!selectedLake?.history) return [];
    return selectedLake.history.map((pt) => ({
      date: pt.date,
      water_ha: Number(pt.water_ha.toFixed(2)),
    }));
  }, [selectedLake]);

  const compareChartData = useMemo(() => {
    if (!data?.lakes) return [];
    return data.lakes.map((l) => ({
      name: l.name.replace(" Lake", ""),
      before_ha: Number(l.water_before_ha.toFixed(2)),
      after_ha: Number(l.water_after_ha.toFixed(2)),
      construction_ha: Number(l.buffer_construction_ha.toFixed(2)),
    }));
  }, [data]);

  const askAssistant = async (overrideQuestion?: string) => {
    if (!selectedLake) return;
    setAiLoading(true);
    try {
      const q = (overrideQuestion ?? aiQuestion).trim();
      const res = await api.explainLakeMonitoring({
        lake_id: selectedLake.id,
        question: q || undefined,
        demo_mode: demoMode,
      });
      setAiResult(res);
    } catch (e) {
      setAiResult({
        text: e instanceof Error ? e.message : "Unable to reach NIM Lake Advisor.",
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
    if (selectedLake && !aiResult && !aiLoading) {
      void askAssistant();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLake?.id]);

  if (loading) return <LoadingSkeleton rows={5} />;
  if (error || !data || !selectedLake) {
    return <ErrorBox message={error ?? "No lake monitoring data found"} onRetry={() => void loadLakes(false)} />;
  }

  return (
    <div className="space-y-6">
      {/* Header & Verification Notice */}
      <Panel
        eyebrow={`MULTI-DATE SENTINEL-2 L2A MONITORING // ${data.scenes.date_before} → ${data.scenes.date_after}`}
        title="Bengaluru Urban Lake Health & Boundary Watch"
        subtitle={data.honesty_notice}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="mint">
              <Satellite className="h-3.5 w-3.5" aria-hidden="true" />
              {data.scenes.before_id.slice(0, 19)} vs {data.scenes.after_id.slice(0, 19)}
            </Badge>
            <button
              type="button"
              onClick={() => void loadLakes(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-high px-3 py-1.5 font-mono text-xs text-primary hover:bg-surface-bright disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing S2…" : "Refresh Telemetry"}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-secondary">
              <span>Lakes Monitored</span>
              <Droplets className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-on-surface">
              {data.summary.total_lakes_monitored}
            </p>
            <p className="mt-1 text-xs text-secondary">
              Water spread: {data.summary.total_water_before_ha.toFixed(1)} →{" "}
              <span className="text-tertiary font-semibold">{data.summary.total_water_after_ha.toFixed(1)} ha</span>
            </p>
          </div>

          <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-secondary">
              <span>Shrinking Lakes</span>
              <TrendingDown className="h-4 w-4 text-warning-orange" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-warning-orange">
              {data.summary.shrinking_lakes_count}
            </p>
            <p className="mt-1 text-xs text-secondary">
              Net surface-water loss &gt; 4% between {data.scenes.date_before} and {data.scenes.date_after}
            </p>
          </div>

          <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-secondary">
              <span>Buffer Built-up Shift</span>
              <ShieldAlert className="h-4 w-4 text-error-vivid" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-error-vivid">
              {data.summary.total_buffer_construction_ha.toFixed(2)} ha
            </p>
            <p className="mt-1 text-xs text-secondary">
              250m buffer NDBI increase — requires official ground survey
            </p>
          </div>

          <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-secondary">
              <span>Need Inspection</span>
              <AlertTriangle className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-primary">
              {data.summary.immediate_attention_count} Lakes
            </p>
            <p className="mt-1 text-xs text-secondary">
              Buffer vegetation decline: {data.summary.total_buffer_veg_loss_ha.toFixed(2)} ha (NDVI)
            </p>
          </div>
        </div>
      </Panel>

      {/* Main Split: Interactive Map + Satellite Before/After Comparison */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left: Interactive Bengaluru Lakes Map */}
        <Panel
          className="xl:col-span-7"
          eyebrow="SPATIAL LAKE TELEMETRY // 250M SHORELINE BUFFER"
          title="Interactive Lake Boundary & Buffer Change Map"
          subtitle="Click any lake marker or table row to inspect shoreline change polygons."
          right={
            <div className="flex flex-wrap gap-2 text-xs font-mono">
              <button
                type="button"
                onClick={() => setShowBeforeWater((v) => !v)}
                className={`rounded-lg border px-2.5 py-1 transition ${
                  showBeforeWater
                    ? "border-primary/60 bg-primary-container/20 text-primary"
                    : "border-outline-variant/30 text-secondary"
                }`}
              >
                <Layers className="mr-1 inline h-3 w-3" />
                Water {data.scenes.date_before}
              </button>
              <button
                type="button"
                onClick={() => setShowAfterWater((v) => !v)}
                className={`rounded-lg border px-2.5 py-1 transition ${
                  showAfterWater
                    ? "border-tertiary/60 bg-tertiary-container/20 text-tertiary"
                    : "border-outline-variant/30 text-secondary"
                }`}
              >
                Water {data.scenes.date_after}
              </button>
              <button
                type="button"
                onClick={() => setShowBufferChange((v) => !v)}
                className={`rounded-lg border px-2.5 py-1 transition ${
                  showBufferChange
                    ? "border-error-vivid/60 bg-error-container/40 text-on-error-container"
                    : "border-outline-variant/30 text-secondary"
                }`}
              >
                Buffer Shift (NDBI)
              </button>
              <button
                type="button"
                onClick={() => setBaseLayer((b) => (b === "osm" ? "sat" : "osm"))}
                className="rounded-lg border border-outline-variant/40 bg-surface-container px-2.5 py-1 text-on-surface hover:border-primary/60 hover:text-primary"
              >
                {baseLayer === "osm" ? "Satellite Map" : "Street Map"}
              </button>
            </div>
          }
        >
          <div className="h-[420px] w-full overflow-hidden rounded-xl border border-outline-variant/40">
            <MapContainer
              center={[selectedLake.lat, selectedLake.lon]}
              zoom={13}
              className="h-full w-full"
              scrollWheelZoom
            >
              <FlyToLake lat={selectedLake.lat} lon={selectedLake.lon} />
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

              {showBeforeWater && layerCollections.before.features.length > 0 && (
                <LeafletGeoJSON
                  key="water-before"
                  data={layerCollections.before as any}
                  style={{
                    color: "#38bdf8",
                    weight: 1.5,
                    dashArray: "4 3",
                    fillColor: "#38bdf8",
                    fillOpacity: 0.16,
                  }}
                />
              )}

              {showAfterWater && layerCollections.after.features.length > 0 && (
                <LeafletGeoJSON
                  key="water-after"
                  data={layerCollections.after as any}
                  style={{
                    color: "#72ff9e",
                    weight: 2,
                    fillColor: "#14b8a6",
                    fillOpacity: 0.34,
                  }}
                />
              )}

              {showBufferChange && layerCollections.buffer.features.length > 0 && (
                <LeafletGeoJSON
                  key="buffer-change"
                  data={layerCollections.buffer as any}
                  style={{
                    color: "#f97316",
                    weight: 1.5,
                    fillColor: "#fbbf24",
                    fillOpacity: 0.45,
                  }}
                />
              )}

              {data.lakes.map((lake) => {
                const isSelected = lake.id === selectedLake.id;
                const color =
                  lake.priority === "high"
                    ? "#f87171"
                    : lake.priority === "medium"
                      ? "#fbbf24"
                      : "#72ff9e";
                return (
                  <CircleMarker
                    key={lake.id}
                    center={[lake.lat, lake.lon]}
                    radius={isSelected ? 10 : 7}
                    pathOptions={{
                      color: isSelected ? "#ffffff" : color,
                      weight: isSelected ? 2.5 : 1.5,
                      fillColor: color,
                      fillOpacity: 0.85,
                    }}
                    eventHandlers={{
                      click: () => setSelectedLakeId(lake.id),
                    }}
                  >
                    <Popup>
                      <div className="min-w-[200px] space-y-1 text-xs text-slate-900">
                        <p className="font-bold text-sm">{lake.name}</p>
                        <p className="text-slate-600">{lake.zone}</p>
                        <p>
                          Water: <b>{lake.water_before_ha.toFixed(1)}</b> → <b>{lake.water_after_ha.toFixed(1)} ha</b> (
                          {lake.water_change_pct >= 0 ? "+" : ""}
                          {lake.water_change_pct.toFixed(1)}%)
                        </p>
                        <p>Buffer built-up shift: {lake.buffer_construction_ha.toFixed(2)} ha</p>
                        <p className="text-[11px] font-medium text-amber-700">{lake.encroachment_status}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-secondary">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-400" /> Water Before ({data.scenes.date_before})
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#72ff9e]" /> Water After ({data.scenes.date_after})
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Buffer Change Polygon (Verify)
              </span>
            </div>
            <span className="font-mono text-[11px] text-primary">Selected: {selectedLake.name}</span>
          </div>
        </Panel>

        {/* Right: Sentinel-2 Before & After Satellite Comparison */}
        <Panel
          className="xl:col-span-5"
          eyebrow={`SENTINEL-2 L2A TRUE COLOR + BOUNDARY MASK // ${selectedLake.zone}`}
          title={selectedLake.name}
          subtitle="Cyan: Water loss · Amber: Built-up increase · Magenta: Veg loss in 250m buffer"
          right={
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCompareMode("overlay")}
                className={`rounded-lg px-2.5 py-1 font-mono text-xs ${
                  compareMode === "overlay"
                    ? "bg-primary-container text-on-primary-container font-semibold"
                    : "bg-surface-container-high text-secondary"
                }`}
              >
                Changes Overlay
              </button>
              <button
                type="button"
                onClick={() => setCompareMode("after")}
                className={`rounded-lg px-2.5 py-1 font-mono text-xs ${
                  compareMode === "after"
                    ? "bg-primary-container text-on-primary-container font-semibold"
                    : "bg-surface-container-high text-secondary"
                }`}
              >
                Raw After RGB
              </button>
            </div>
          }
        >
          <BeforeAfterSlider
            beforeSrc={selectedLake.images.before}
            afterSrc={compareMode === "overlay" ? selectedLake.images.overlay : selectedLake.images.after}
            beforeAlt={`${selectedLake.name} Sentinel-2 before (${data.scenes.date_before})`}
            afterAlt={`${selectedLake.name} Sentinel-2 after (${data.scenes.date_after})`}
            beforeLabel={`Before: ${data.scenes.date_before}`}
            afterLabel={compareMode === "overlay" ? `Changes: ${data.scenes.date_after}` : `After: ${data.scenes.date_after}`}
            heightClass="h-72"
          />

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-2.5">
              <p className="font-mono text-[10px] uppercase text-secondary">Water Now</p>
              <p className="font-mono text-sm font-bold text-tertiary">{selectedLake.water_after_ha.toFixed(1)} ha</p>
            </div>
            <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-2.5">
              <p className="font-mono text-[10px] uppercase text-secondary">Spread Shift</p>
              <p
                className={`font-mono text-sm font-bold ${
                  selectedLake.water_change_ha < 0 ? "text-warning-orange" : "text-tertiary"
                }`}
              >
                {selectedLake.water_change_ha >= 0 ? "+" : ""}
                {selectedLake.water_change_ha.toFixed(1)} ha ({selectedLake.water_change_pct.toFixed(1)}%)
              </p>
            </div>
            <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-2.5">
              <p className="font-mono text-[10px] uppercase text-secondary">Buffer Built-up</p>
              <p className="font-mono text-sm font-bold text-primary">
                {selectedLake.buffer_construction_ha.toFixed(2)} ha
              </p>
            </div>
            <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-2.5">
              <p className="font-mono text-[10px] uppercase text-secondary">Veg Loss (250m)</p>
              <p className="font-mono text-sm font-bold text-error-vivid">
                {selectedLake.buffer_veg_loss_ha.toFixed(2)} ha
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-primary/30 bg-primary-container/10 px-3 py-2 text-xs text-primary">
            <MapPin className="mr-1.5 inline h-3.5 w-3.5" />
            {selectedLake.encroachment_status}
          </div>
        </Panel>
      </div>

      {/* Charts + AI Inspection Assistant */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          className="xl:col-span-6"
          eyebrow="TEMPORAL & CROSS-LAKE COMPARISON"
          title={`${selectedLake.name} Water Spread Trend vs Buffer Shifts`}
        >
          <div className="space-y-5">
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} unit=" ha" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#04251b",
                      border: "1px solid rgba(114,255,158,0.25)",
                      borderRadius: "10px",
                      fontSize: "12px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="water_ha"
                    name="Water Area (ha)"
                    stroke="#72ff9e"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "#fbbf24" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={compareChartData}>
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
                  <Bar dataKey="before_ha" name={`Water ${data.scenes.date_before}`} fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="after_ha" name={`Water ${data.scenes.date_after}`} fill="#72ff9e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="construction_ha" name="Buffer Built-up Shift" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Panel>

        {/* AI Lake Inspection & Protection Advisor */}
        <Panel
          className="xl:col-span-6"
          eyebrow="NVIDIA NIM CONSERVATION & VERIFICATION ADVISOR"
          title="AI Lake Change & Inspection Assistant"
          subtitle="Explains measured shoreline shifts and recommends lakes for official field survey."
          right={
            <div className="flex flex-wrap items-center gap-2">
              <AITagBadge />
              {aiResult && (
                <Badge tone={aiResult.ai_mode === "live" ? "mint" : "gold"}>
                  <Sparkles className="h-3 w-3" />
                  AI: {aiResult.ai_mode}
                </Badge>
              )}
            </div>
          }
        >
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              `Why did ${selectedLake.name} change and what should inspectors check?`,
              "Which Bengaluru lakes need immediate inspection and shoreline protection?",
              "How do we verify possible buffer encroachment without false positives?",
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => {
                  setAiQuestion(prompt);
                  void askAssistant(prompt);
                }}
                className="rounded-lg border border-outline-variant/40 bg-surface-container px-2.5 py-1 text-left text-[11px] text-secondary hover:border-primary/50 hover:text-primary"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void askAssistant();
              }}
              placeholder={`Ask about ${selectedLake.name} or citywide lake protection…`}
              className="flex-1 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-secondary/60 focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void askAssistant()}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-container px-4 py-2 text-xs font-semibold text-on-primary-container hover:opacity-90 disabled:opacity-60"
            >
              <Bot className="h-4 w-4" />
              {aiLoading ? "Analyzing…" : "Ask AI"}
            </button>
          </div>

          <div className="min-h-[240px] rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 text-sm leading-relaxed text-on-surface whitespace-pre-wrap">
            {aiLoading ? (
              <p className="font-mono text-xs text-secondary animate-pulse">
                Synthesizing Sentinel-2 lake indices with NIM advisor…
              </p>
            ) : aiResult ? (
              aiResult.text
            ) : (
              "Select a lake or ask a question to generate an inspection brief."
            )}
          </div>
        </Panel>
      </div>

      {/* Lakes Priority & Detailed Telemetry Table */}
      <Panel
        eyebrow="ALL MONITORED BENGALURU LAKES // SORTED BY ATTENTION SCORE"
        title="Lake Priority & Shoreline Verification Matrix"
        right={
          <div className="flex flex-wrap gap-1.5 font-mono text-xs">
            {(
              [
                ["all", `All (${data.lakes.length})`],
                ["attention", `Needs Inspection (${data.summary.immediate_attention_count})`],
                ["shrinking", `Shrinking (${data.summary.shrinking_lakes_count})`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilterPriority(k)}
                className={`rounded-lg border px-2.5 py-1 ${
                  filterPriority === k
                    ? "border-primary/60 bg-primary-container/20 text-primary"
                    : "border-outline-variant/30 text-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-outline-variant/30 font-mono uppercase tracking-wider text-secondary">
                <th className="py-2.5 pr-4">Lake</th>
                <th className="py-2.5 pr-4">Water ({data.scenes.date_before})</th>
                <th className="py-2.5 pr-4">Water ({data.scenes.date_after})</th>
                <th className="py-2.5 pr-4">Spread Change</th>
                <th className="py-2.5 pr-4">250m Built-up</th>
                <th className="py-2.5 pr-4">
                  <Trees className="mr-1 inline h-3.5 w-3.5" />
                  Veg Loss
                </th>
                <th className="py-2.5 pr-4">Priority / Verification Status</th>
                <th className="py-2.5 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {filteredLakes.map((lake) => (
                <tr
                  key={lake.id}
                  onClick={() => setSelectedLakeId(lake.id)}
                  className={`cursor-pointer transition hover:bg-surface-container-high/50 ${
                    lake.id === selectedLake.id ? "bg-surface-container-high/70" : ""
                  }`}
                >
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-on-surface">{lake.name}</p>
                    <p className="text-[11px] text-secondary">{lake.zone}</p>
                  </td>
                  <td className="py-3 pr-4 font-mono text-secondary">{lake.water_before_ha.toFixed(2)} ha</td>
                  <td className="py-3 pr-4 font-mono text-tertiary font-semibold">{lake.water_after_ha.toFixed(2)} ha</td>
                  <td className="py-3 pr-4 font-mono">
                    <span className={lake.is_shrinking ? "text-warning-orange font-semibold" : "text-tertiary"}>
                      {lake.water_change_ha >= 0 ? "+" : ""}
                      {lake.water_change_ha.toFixed(2)} ha ({lake.water_change_pct.toFixed(1)}%)
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-primary">{lake.buffer_construction_ha.toFixed(2)} ha</td>
                  <td className="py-3 pr-4 font-mono text-error-vivid">{lake.buffer_veg_loss_ha.toFixed(2)} ha</td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={PRIORITY_TONE[lake.priority] ?? "sage"}>{lake.priority.toUpperCase()}</Badge>
                      {lake.is_shrinking && <Badge tone="orange">SHRINKING</Badge>}
                    </div>
                    <p className="mt-1 text-[11px] text-secondary">{lake.encroachment_status}</p>
                  </td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedLakeId(lake.id);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 px-2.5 py-1 font-mono text-[11px] text-primary hover:bg-surface-bright"
                    >
                      <Eye className="h-3 w-3" /> Focus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
};
