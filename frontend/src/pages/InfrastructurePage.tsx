import React, { useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON as LeafletGeoJSON, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  Bell,
  Bot,
  Building,
  ClipboardCheck,
  Droplets,
  Layers,
  RefreshCw,
  Route,
  ShieldAlert,
  Sparkles,
  TrainFront,
  Zap,
} from "lucide-react";
import { api } from "../api/client";
import { BeforeAfterSlider } from "../components/BeforeAfterSlider";
import { useGeoTerra } from "../context/GeoTerraContext";
import { AITagBadge, Badge, ErrorBox, LoadingSkeleton, Panel } from "../components/ui";
import type { AIResponse, GeoJSONFeatureCollection, InfraAssetItem, InfrastructureResponse } from "../types";

const FlyToAsset: React.FC<{ lat: number; lon: number }> = ({ lat, lon }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], 14, { duration: 0.7 });
  }, [lat, lon, map]);
  return null;
};

const RISK_TONE: Record<string, "coral" | "gold" | "mint"> = {
  High: "coral",
  Medium: "gold",
  Low: "mint",
};

const CORRIDOR_COLORS: Record<string, string> = {
  roads_bridges: "#fbbf24",
  metro: "#a855f7",
  power: "#38bdf8",
  water: "#72ff9e",
};

const CategoryIcon: React.FC<{ category: string }> = ({ category }) => {
  if (category === "metro") return <TrainFront className="h-3.5 w-3.5 text-tertiary-lilac" />;
  if (category === "power") return <Zap className="h-3.5 w-3.5 text-sky-400" />;
  if (category === "water") return <Droplets className="h-3.5 w-3.5 text-tertiary" />;
  return <Route className="h-3.5 w-3.5 text-primary" />;
};

export const InfrastructurePage: React.FC = () => {
  const { demoMode } = useGeoTerra();

  const [data, setData] = useState<InfrastructureResponse | null>(null);
  const [floodGeo, setFloodGeo] = useState<GeoJSONFeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string>("orr_ecospace_corridor");
  const [compareMode, setCompareMode] = useState<"risk" | "after">("risk");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<"all" | "high" | "inspection">("all");
  const [baseLayer, setBaseLayer] = useState<"osm" | "sat">("osm");

  const [showCorridors, setShowCorridors] = useState(true);
  const [showFloodZones, setShowFloodZones] = useState(true);

  const [aiQuestion, setAiQuestion] = useState("");
  const [aiResult, setAiResult] = useState<AIResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const loadData = async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const [infraRes, floodRes] = await Promise.all([
        api.getInfrastructure(refresh),
        api.getGeoLayer("flood_extent").catch(() => null),
      ]);
      setData(infraRes);
      setFloodGeo(floodRes);
      if (infraRes.assets.length > 0 && !infraRes.assets.some((a) => a.id === selectedId)) {
        setSelectedId(infraRes.assets[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load infrastructure protection telemetry");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedAsset: InfraAssetItem | null = useMemo(() => {
    if (!data || data.assets.length === 0) return null;
    return data.assets.find((a) => a.id === selectedId) ?? data.assets[0];
  }, [data, selectedId]);

  const filteredAssets = useMemo(() => {
    if (!data) return [];
    let list = data.assets;
    if (categoryFilter !== "all") {
      list = list.filter((a) => a.category === categoryFilter);
    }
    if (riskFilter === "high") {
      list = list.filter((a) => a.risk_level === "High");
    } else if (riskFilter === "inspection") {
      list = list.filter((a) => a.needs_inspection);
    }
    return list;
  }, [data, categoryFilter, riskFilter]);

  const chartData = useMemo(() => {
    if (!data?.assets) return [];
    return data.assets.slice(0, 8).map((a) => ({
      name: a.name.split("–")[0].split("(")[0].trim().slice(0, 16),
      flood_risk: Number(a.flood_susceptibility.toFixed(1)),
      risk_score: Number(a.risk_score.toFixed(1)),
      land_change_ha: Number(a.unusual_land_change_ha.toFixed(1)),
    }));
  }, [data]);

  const askAssistant = async (overrideQuestion?: string) => {
    if (!selectedAsset) return;
    setAiLoading(true);
    try {
      const q = (overrideQuestion ?? aiQuestion).trim();
      const res = await api.explainInfrastructure({
        asset_id: selectedAsset.id,
        question: q || undefined,
        demo_mode: demoMode,
      });
      setAiResult(res);
    } catch (e) {
      setAiResult({
        text: e instanceof Error ? e.message : "Unable to reach NIM Infrastructure Advisor.",
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
    if (selectedAsset && !aiResult && !aiLoading) {
      void askAssistant();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAsset?.id]);

  if (loading) return <LoadingSkeleton rows={5} />;
  if (error || !data || !selectedAsset) {
    return (
      <ErrorBox
        message={error ?? "No critical infrastructure data loaded"}
        onRetry={() => void loadData(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Honest Prediction vs Verified Incident Notice */}
      <Panel
        eyebrow="CRITICAL LIFELINE RESILIENCE // ROADS, BRIDGES, METRO, POWER & WATER"
        title="Bengaluru Critical Infrastructure Protection"
        subtitle={data.honesty_notice}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="gold">
              <AlertTriangle className="h-3.5 w-3.5" />
              AI Risk Screens != Verified Incidents
            </Badge>
            <button
              type="button"
              onClick={() => void loadData(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-high px-3 py-1.5 font-mono text-xs text-primary hover:bg-surface-bright disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Re-screening…" : "Refresh Screens"}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-secondary">
              <span>High-Risk Assets</span>
              <ShieldAlert className="h-4 w-4 text-error-vivid" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-error-vivid">
              {data.summary.high_risk_count} / {data.summary.total_assets_monitored}
            </p>
            <p className="mt-1 text-xs text-secondary">
              {data.summary.inspection_queue_count} flagged for preventive engineering inspection
            </p>
          </div>

          <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-secondary">
              <span>Flood-Exposed Corridors</span>
              <Droplets className="h-4 w-4 text-sky-400" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-sky-300">
              {data.summary.flood_exposed_count} Assets
            </p>
            <p className="mt-1 text-xs text-secondary">
              {data.summary.total_exposed_roads_km.toFixed(1)} km roads &amp; {data.summary.total_exposed_buildings} buildings in zones
            </p>
          </div>

          <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-secondary">
              <span>Nearby Land Change</span>
              <Building className="h-4 w-4 text-warning-orange" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-warning-orange">
              {data.summary.land_disturbance_count} Buffers
            </p>
            <p className="mt-1 text-xs text-secondary">
              Unusual earthworks/urban shift within 750 m (Sentinel-2)
            </p>
          </div>

          <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-secondary">
              <span>Active Threat Screens</span>
              <Bell className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-primary">
              {data.summary.active_alerts_count} Alerts
            </p>
            <p className="mt-1 text-xs text-secondary">
              {data.summary.thermal_exposed_count} sites exposed to Landsat heat hotspots
            </p>
          </div>
        </div>
      </Panel>

      {/* Map + Sentinel-2 Asset Buffer Comparison */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          className="xl:col-span-7"
          eyebrow="INFRASTRUCTURE & LIFELINE MULTI-HAZARD OVERLAY"
          title="Bengaluru Roads, Metro, Power & Water Risk Map"
          subtitle="Click any infrastructure marker or lifeline to inspect satellite risks."
          right={
            <div className="flex flex-wrap gap-2 font-mono text-xs">
              <button
                type="button"
                onClick={() => setShowCorridors((v) => !v)}
                className={`rounded-lg border px-2.5 py-1 transition ${
                  showCorridors
                    ? "border-primary/60 bg-primary-container/20 text-primary"
                    : "border-outline-variant/30 text-secondary"
                }`}
              >
                <Layers className="mr-1 inline h-3 w-3" />
                Lifeline Corridors
              </button>
              <button
                type="button"
                onClick={() => setShowFloodZones((v) => !v)}
                className={`rounded-lg border px-2.5 py-1 transition ${
                  showFloodZones
                    ? "border-sky-400/60 bg-sky-400/15 text-sky-300"
                    : "border-outline-variant/30 text-secondary"
                }`}
              >
                S1 Flood Extent
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
          <div className="h-[430px] w-full overflow-hidden rounded-xl border border-outline-variant/40">
            <MapContainer
              center={[selectedAsset.lat, selectedAsset.lon]}
              zoom={12}
              className="h-full w-full"
              scrollWheelZoom
            >
              <FlyToAsset lat={selectedAsset.lat} lon={selectedAsset.lon} />
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

              {showFloodZones && floodGeo && (
                <LeafletGeoJSON
                  key="infra-s1-flood"
                  data={floodGeo as any}
                  style={{
                    color: "#38bdf8",
                    weight: 1.5,
                    fillColor: "#0ea5e9",
                    fillOpacity: 0.32,
                  }}
                />
              )}

              {showCorridors && data.corridors_geojson.features.length > 0 && (
                <LeafletGeoJSON
                  key="infra-lifelines"
                  data={data.corridors_geojson as any}
                  style={(feat) => ({
                    color: CORRIDOR_COLORS[feat?.properties?.category ?? "roads_bridges"] ?? "#fbbf24",
                    weight: 4,
                    opacity: 0.85,
                    dashArray: feat?.properties?.category === "power" ? "6 4" : undefined,
                  })}
                />
              )}

              {data.assets.map((a) => {
                const isSelected = a.id === selectedAsset.id;
                const color =
                  a.risk_level === "High"
                    ? "#f87171"
                    : a.risk_level === "Medium"
                      ? "#fbbf24"
                      : "#72ff9e";
                return (
                  <CircleMarker
                    key={a.id}
                    center={[a.lat, a.lon]}
                    radius={isSelected ? 12 : 8}
                    pathOptions={{
                      color: isSelected ? "#ffffff" : color,
                      weight: isSelected ? 2.5 : 1.5,
                      fillColor: color,
                      fillOpacity: 0.85,
                    }}
                    eventHandlers={{
                      click: () => setSelectedId(a.id),
                    }}
                  >
                    <Popup>
                      <div className="min-w-[230px] space-y-1 text-xs text-slate-900">
                        <p className="font-bold text-sm">{a.name}</p>
                        <p className="text-slate-600">
                          {a.category_label} · {a.operator}
                        </p>
                        <p>
                          Risk Score: <b>{a.risk_score.toFixed(1)}/100 ({a.risk_level})</b>
                        </p>
                        <p>
                          Flood Suscept.: <b>{a.flood_susceptibility}/100</b> · Land Change: <b>{a.unusual_land_change_ha} ha</b>
                        </p>
                        <p className="text-[11px] font-medium text-amber-700">{a.status_label}</p>
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
                <span className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]" /> Roads / Bridges
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-purple-500" /> Metro Corridors
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-400" /> Power Grid 220 kV
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#72ff9e]" /> Water / STP Trunk
              </span>
            </div>
            <span className="font-mono text-[11px] text-primary">Focused: {selectedAsset.name}</span>
          </div>
        </Panel>

        {/* Satellite Buffer Inspection View */}
        <Panel
          className="xl:col-span-5"
          eyebrow={`SENTINEL-2 10M ASSET BUFFER // ${selectedAsset.category_label}`}
          title={selectedAsset.name}
          subtitle="Orange: Nearby Land Change · Cyan: Standing Water · Marker: Asset Location"
          right={
            <button
              type="button"
              onClick={() => setCompareMode(compareMode === "risk" ? "after" : "risk")}
              className="rounded-lg bg-primary-container px-2.5 py-1 font-mono text-xs font-semibold text-on-primary-container"
            >
              {compareMode === "risk" ? "Risk & Change Overlay" : "2026 Raw RGB"}
            </button>
          }
        >
          <BeforeAfterSlider
            beforeSrc={selectedAsset.images.before}
            afterSrc={compareMode === "risk" ? selectedAsset.images.risk : selectedAsset.images.after}
            beforeAlt={`${selectedAsset.name} Sentinel-2 2019 baseline`}
            afterAlt={`${selectedAsset.name} Sentinel-2 2026 risk buffer`}
            beforeLabel="Before: 2019-03-30"
            afterLabel={compareMode === "risk" ? "2026 Risk Buffer" : "After: 2026-11-23"}
            heightClass="h-72"
          />

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-2.5">
              <p className="font-mono text-[10px] uppercase text-secondary">Risk Score</p>
              <p className="font-mono text-sm font-bold text-error-vivid">
                {selectedAsset.risk_score.toFixed(1)} ({selectedAsset.risk_level})
              </p>
            </div>
            <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-2.5">
              <p className="font-mono text-[10px] uppercase text-secondary">Flood Suscept.</p>
              <p className="font-mono text-sm font-bold text-sky-300">
                {selectedAsset.flood_susceptibility.toFixed(1)}/100
              </p>
            </div>
            <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-2.5">
              <p className="font-mono text-[10px] uppercase text-secondary">Land Change</p>
              <p className="font-mono text-sm font-bold text-warning-orange">
                {selectedAsset.unusual_land_change_ha.toFixed(1)} ha
              </p>
            </div>
            <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-2.5">
              <p className="font-mono text-[10px] uppercase text-secondary">Heat Hotspot</p>
              <p className="font-mono text-sm font-bold text-primary">
                {selectedAsset.nearby_heat_hotspot_ha.toFixed(1)} ha
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-primary/30 bg-primary-container/10 px-3 py-2 text-xs text-primary">
            <ClipboardCheck className="mr-1.5 inline h-3.5 w-3.5" />
            {selectedAsset.status_label}
          </div>
        </Panel>
      </div>

      {/* Threat Alerts Feed + Risk Chart + NIM Infrastructure Advisor */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          className="xl:col-span-6"
          eyebrow="AUTOMATED PROTECTIVE ALERTS & RISK DISTRIBUTION"
          title="Detected Threat Screens (Unverified Predictions)"
        >
          <div className="mb-5 h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
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
                <Bar dataKey="risk_score" name="Composite Risk" fill="#f87171" radius={[4, 4, 0, 0]} />
                <Bar dataKey="flood_risk" name="Flood Susceptibility" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="land_change_ha" name="Nearby Land Change (ha)" fill="#fbbf24" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
            {data.alerts.map((al) => (
              <button
                key={al.id}
                type="button"
                onClick={() => setSelectedId(al.asset_id)}
                className="w-full rounded-xl border border-outline-variant/30 bg-surface-container p-3 text-left transition hover:border-primary/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-xs text-on-surface">{al.title}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={al.severity === "HIGH" ? "coral" : "gold"}>{al.severity}</Badge>
                    <span className="font-mono text-[10px] text-secondary">{al.category}</span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-secondary">{al.summary}</p>
                <p className="mt-1 font-mono text-[10px] text-primary">{al.verification_label}</p>
              </button>
            ))}
          </div>
        </Panel>

        <Panel
          className="xl:col-span-6"
          eyebrow="NVIDIA NIM INFRASTRUCTURE RESILIENCE ADVISOR"
          title="AI Threat & Preventive Engineering Assistant"
          subtitle="Explains satellite multi-hazard overlaps and suggests preventive inspections."
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
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              `What hazards threaten ${selectedAsset.name} and what preventive checks are needed?`,
              "Which bridges, roads, and substations are most exposed to flooding and earthworks?",
              "How should BBMP, BMRCL, and KPTCL prioritize safety inspections before heavy rain?",
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

          <div className="mb-4 flex gap-2">
            <input
              type="text"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void askAssistant();
              }}
              placeholder={`Ask about ${selectedAsset.name} or safety inspection priorities…`}
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

          <div className="min-h-[260px] whitespace-pre-wrap rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 text-sm leading-relaxed text-on-surface">
            {aiLoading ? (
              <p className="animate-pulse font-mono text-xs text-secondary">
                Fusing DEM flood, Sentinel-2 buffer change &amp; Landsat heat signals with NIM advisor…
              </p>
            ) : aiResult ? (
              aiResult.text
            ) : (
              "Select an asset or ask a question to generate an engineering resilience brief."
            )}
          </div>
        </Panel>
      </div>

      {/* Infrastructure Risk & Safety Inspection Table */}
      <Panel
        eyebrow="CRITICAL INFRASTRUCTURE PROTECTION MATRIX"
        title="Asset Exposure Levels & Safety Inspection Queue"
        right={
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
            {(
              [
                ["all", "All Sectors"],
                ["roads_bridges", "Roads & Bridges"],
                ["metro", "Metro"],
                ["power", "Power Grid"],
                ["water", "Water / STP"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setCategoryFilter(k)}
                className={`rounded-lg border px-2 py-1 ${
                  categoryFilter === k
                    ? "border-tertiary/60 bg-tertiary-container/20 text-tertiary"
                    : "border-outline-variant/30 text-secondary"
                }`}
              >
                {label}
              </button>
            ))}
            <span className="mx-1 text-outline-variant">|</span>
            {(
              [
                ["all", "All Risk"],
                ["high", `High (${data.summary.high_risk_count})`],
                ["inspection", `Inspect (${data.summary.inspection_queue_count})`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setRiskFilter(k)}
                className={`rounded-lg border px-2.5 py-1 ${
                  riskFilter === k
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
                <th className="py-2.5 pr-4">Infrastructure Asset</th>
                <th className="py-2.5 pr-4">Flood Exposure</th>
                <th className="py-2.5 pr-4">Nearby Change / Heat</th>
                <th className="py-2.5 pr-4">Roads &amp; Buildings</th>
                <th className="py-2.5 pr-4">Risk Level</th>
                <th className="py-2.5">Preventive Action (AI Screen)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {filteredAssets.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className={`cursor-pointer transition hover:bg-surface-container-high/50 ${
                    a.id === selectedAsset.id ? "bg-surface-container-high/70" : ""
                  }`}
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-1.5 font-semibold text-on-surface">
                      <CategoryIcon category={a.category} />
                      {a.name}
                    </div>
                    <p className="text-[11px] text-secondary">
                      {a.category_label} · {a.operator} · {a.criticality}
                    </p>
                  </td>
                  <td className="py-3 pr-4 font-mono">
                    <span className={a.flood_exposed ? "text-sky-300 font-semibold" : "text-secondary"}>
                      {a.flood_susceptibility.toFixed(1)}/100
                    </span>
                    <span className="block text-[11px] text-secondary">
                      {a.nearest_lake} ({a.distance_to_lake_km} km)
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono">
                    <span className="text-warning-orange">{a.unusual_land_change_ha.toFixed(1)} ha change</span>
                    <span className="block text-[11px] text-primary">{a.nearby_heat_hotspot_ha.toFixed(1)} ha heat</span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-secondary">
                    {a.nearby_roads_km.toFixed(1)} km roads
                    <span className="block text-[11px]">{a.nearby_buildings_exposed} buildings</span>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={RISK_TONE[a.risk_level] ?? "sage"}>
                      {a.risk_level.toUpperCase()} ({a.risk_score.toFixed(0)})
                    </Badge>
                    {a.needs_inspection && (
                      <span className="mt-1 block font-mono text-[10px] text-error-vivid">INSPECT NEEDED</span>
                    )}
                  </td>
                  <td className="py-3 text-[11px] text-on-surface max-w-xs">{a.recommended_action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
};
