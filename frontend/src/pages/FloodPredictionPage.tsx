import React, { useEffect, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Building2,
  CloudRain,
  Cpu,
  Mountain,
  Route,
  Send,
  ShieldCheck,
  Waves,
} from "lucide-react";
import { api } from "../api/client";
import { BeforeAfterSlider } from "../components/BeforeAfterSlider";
import { AITagBadge, Badge, ErrorBox, LoadingSkeleton, Panel, UnvalidatedBadge } from "../components/ui";
import { useGeoTerra } from "../context/GeoTerraContext";
import type { AIResponse, FloodPredictionResponse, GeoJSONFeatureCollection, WardRiskItem } from "../types";
import { formatIndianNumber } from "../utils/format";

const FlyToWard: React.FC<{ target: [number, number] | null }> = ({ target }) => {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 13, { duration: 0.75 });
  }, [map, target]);
  return null;
};

export const FloodPredictionPage: React.FC = () => {
  const { data, demoMode, updateAiMode } = useGeoTerra();
  const [rainfallMm, setRainfallMm] = useState<number>(65);
  const [pred, setPred] = useState<FloodPredictionResponse | null>(null);
  const [s1FloodGeo, setS1FloodGeo] = useState<GeoJSONFeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showHigh, setShowHigh] = useState(true);
  const [showMedium, setShowMedium] = useState(true);
  const [showLow, setShowLow] = useState(false);
  const [showSarWater, setShowSarWater] = useState(true);
  const [showLakes, setShowLakes] = useState(true);

  const [selectedWard, setSelectedWard] = useState<WardRiskItem | null>(null);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);

  const [question, setQuestion] = useState("");
  const [aiExplain, setAiExplain] = useState<AIResponse | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    api.getGeoLayer("flood_extent").then(setS1FloodGeo).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    setLoading((prev) => (pred ? prev : true));
    api
      .getFloodPrediction(rainfallMm)
      .then((res) => {
        if (!active) return;
        setPred(res);
        setSelectedWard((prev) =>
          prev ? res.wards.find((w) => w.name === prev.name) ?? res.wards[0] : res.wards[0] ?? null
        );
        setError(null);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load flood prediction.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [rainfallMm]);

  const handleSelectWard = (w: WardRiskItem) => {
    setSelectedWard(w);
    setFlyTarget([w.lat, w.lon]);
    setAiExplain(null);
  };

  const handleAskAI = async (customQ?: string) => {
    const areaName = selectedWard?.name ?? "Bellandur";
    setAiBusy(true);
    try {
      const resp = await api.explainFloodPrediction({
        area_name: areaName,
        rainfall_24h_mm: rainfallMm,
        question: customQ?.trim() || undefined,
        demo_mode: demoMode,
      });
      setAiExplain(resp);
      updateAiMode(resp.ai_mode);
    } finally {
      setAiBusy(false);
    }
  };

  if (loading && !pred) return <LoadingSkeleton rows={4} />;
  if (error || !pred) return <ErrorBox message={error ?? "Unable to compute Bengaluru flood prediction."} />;

  const { summary, scenario } = pred;
  const floodDates = data?.results.flood;

  const filteredZonesGeo: GeoJSONFeatureCollection = {
    type: "FeatureCollection",
    features: pred.risk_zones_geojson.features.filter((f) => {
      const lvl = String(f.properties.risk_level ?? "low");
      if (lvl === "high") return showHigh;
      if (lvl === "medium") return showMedium;
      return showLow;
    }),
  };

  const levelColor = (lvl: string) => (lvl === "high" ? "#f43f5e" : lvl === "medium" ? "#fbbf24" : "#72ff9e");

  return (
    <div className="flex flex-col gap-6">
      {/* Header + Rainfall Scenario Bar */}
      <section className="flex flex-col justify-between gap-4 rounded-xl bg-surface-container-low/95 p-5 shadow-md lg:flex-row lg:items-center">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="mint">
              <CloudRain className="h-3.5 w-3.5" aria-hidden="true" />
              Bengaluru Multi-Factor Flood Prediction
            </Badge>
            <UnvalidatedBadge />
            <Badge tone="gold">{scenario.mode_label}</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">
            Bengaluru Flood Risk &amp; Susceptibility Map
          </h1>
          <p className="max-w-3xl text-xs text-secondary sm:text-sm">{pred.honesty_notice}</p>
        </div>

        {/* Interactive Rainfall Scenario Slider */}
        <div className="w-full shrink-0 rounded-xl bg-surface-container p-4 lg:w-96">
          <div className="flex items-center justify-between font-mono text-xs">
            <span className="text-secondary">24h Rainfall Scenario</span>
            <span className="font-bold text-primary-container">{rainfallMm} mm / 24h</span>
          </div>
          <input
            type="range"
            min={15}
            max={150}
            step={5}
            value={rainfallMm}
            onChange={(e) => setRainfallMm(Number(e.target.value))}
            aria-label="Rainfall scenario in mm per 24 hours"
            className="mt-2.5 w-full cursor-pointer accent-primary-container"
          />
          <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[10px]">
            {[
              { label: `Observed (${pred.rainfall.observed_24h_mm}mm)`, val: Math.round(pred.rainfall.observed_24h_mm) },
              { label: "50mm Heavy", val: 50 },
              { label: "85mm Severe", val: 85 },
              { label: "130mm Cloudburst", val: 130 },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setRainfallMm(p.val)}
                className={`rounded-lg px-2 py-1 transition ${
                  rainfallMm === p.val
                    ? "bg-primary-container font-bold text-on-primary-container"
                    : "bg-surface-container-high text-secondary hover:text-on-surface"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 4 Summary KPI Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-surface-container/90 p-5 shadow-md">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary">
              Potentially Affected Area
            </span>
            <Waves className="h-4 w-4 text-error-vivid" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-[32px] font-bold leading-none text-primary tabular-nums">
              {formatIndianNumber(summary.potentially_affected_area_ha, 1)}
            </span>
            <span className="font-mono text-xs text-secondary">ha (High + Med)</span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-secondary">
            High: {formatIndianNumber(summary.high_risk_area_ha, 0)} ha · Med:{" "}
            {formatIndianNumber(summary.medium_risk_area_ha, 0)} ha
          </div>
        </div>

        <div className="rounded-xl bg-surface-container/90 p-5 shadow-md">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary">
              Risk Zones Breakdown
            </span>
            <Mountain className="h-4 w-4 text-primary-container" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-[32px] font-bold leading-none text-error-vivid tabular-nums">
              {summary.risk_zone_counts.high}
            </span>
            <span className="font-mono text-xs text-secondary">High · {summary.risk_zone_counts.medium} Med</span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-tertiary">
            Low risk grid cells: {summary.risk_zone_counts.low} ({formatIndianNumber(summary.low_risk_area_ha, 0)} ha)
          </div>
        </div>

        <div className="rounded-xl bg-surface-container/90 p-5 shadow-md">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary">
              Est. Affected Roads
            </span>
            <Route className="h-4 w-4 text-primary-container" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-[32px] font-bold leading-none text-primary-container tabular-nums">
              {formatIndianNumber(summary.estimated_affected_roads_km, 1)}
            </span>
            <span className="font-mono text-xs text-secondary">km (OSM extract)</span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-secondary">High + Medium susceptibility corridors</div>
        </div>

        <div className="rounded-xl bg-surface-container/90 p-5 shadow-md">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary">
              Est. Affected Buildings
            </span>
            <Building2 className="h-4 w-4 text-tertiary" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-[32px] font-bold leading-none text-tertiary tabular-nums">
              {formatIndianNumber(summary.estimated_affected_buildings, 0)}
            </span>
            <span className="font-mono text-xs text-secondary">footprints</span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-secondary">Real OpenStreetMap footprints inside risk zones</div>
        </div>
      </section>

      {/* Main Map + Sentinel-1 Before/After Satellite Slider */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          className="xl:col-span-7"
          eyebrow="Copernicus DEM + Lakes + Sentinel-1 SAR + OSM"
          title="Bengaluru Flood-Risk Map (High / Medium / Low)"
          subtitle="Click any ward circle or grid cell to inspect terrain elevation, drainage proximity, and SAR water"
          right={
            <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
              {[
                { label: "High Risk", state: showHigh, set: setShowHigh, dot: "bg-error-vivid" },
                { label: "Medium Risk", state: showMedium, set: setShowMedium, dot: "bg-primary-container" },
                { label: "Low Risk", state: showLow, set: setShowLow, dot: "bg-tertiary" },
                { label: "Sentinel-1 Water", state: showSarWater, set: setShowSarWater, dot: "bg-flood-magenta" },
                { label: "Lakes", state: showLakes, set: setShowLakes, dot: "bg-flood-violet" },
              ].map((l) => (
                <button
                  key={l.label}
                  type="button"
                  onClick={() => l.set(!l.state)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition ${
                    l.state ? "bg-surface-container-high text-on-surface" : "bg-surface-container-low text-secondary/60"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${l.dot}`} />
                  {l.label}
                </button>
              ))}
            </div>
          }
        >
          <div className="h-[460px] overflow-hidden rounded-xl border border-outline-variant/25">
            <MapContainer center={[12.97, 77.62]} zoom={11} className="h-full w-full">
              <FlyToWard target={flyTarget} />
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <GeoJSON
                key={`${rainfallMm}-${showHigh}-${showMedium}-${showLow}`}
                data={filteredZonesGeo as never}
                style={(feat) => {
                  const lvl = String(feat?.properties?.risk_level ?? "low");
                  const col = levelColor(lvl);
                  return {
                    color: col,
                    weight: 1,
                    fillColor: col,
                    fillOpacity: lvl === "high" ? 0.45 : lvl === "medium" ? 0.3 : 0.16,
                  };
                }}
                onEachFeature={(feat, layer) => {
                  const p = feat.properties ?? {};
                  layer.bindPopup(
                    `<strong>${String(p.zone_id)} (${String(p.risk_level).toUpperCase()} RISK)</strong><br/>` +
                      `Elevation: ${p.elevation_m} m · Depression: ${p.depression_m} m<br/>` +
                      `Nearest Lake: ${p.nearest_lake} (${p.distance_to_lake_km} km)<br/>` +
                      `Est. Roads: ${p.estimated_roads_km} km · Buildings: ${p.estimated_buildings}<br/>` +
                      `<em>Model prediction (unvalidated)</em>`
                  );
                }}
              />
              {showSarWater && s1FloodGeo && (
                <GeoJSON
                  data={s1FloodGeo as never}
                  style={{ color: "#d946ef", weight: 2, fillColor: "#d946ef", fillOpacity: 0.6 }}
                />
              )}
              {showLakes &&
                pred.lakes.slice(0, 24).map((lk, i) => (
                  <CircleMarker
                    key={`${lk.name}-${i}`}
                    center={[lk.lat, lk.lon]}
                    radius={5}
                    pathOptions={{ color: "#9d5cb5", weight: 1.5, fillColor: "#9d5cb5", fillOpacity: 0.85 }}
                  >
                    <Popup>
                      <strong>{lk.name}</strong> ({lk.type})
                    </Popup>
                  </CircleMarker>
                ))}
              {pred.wards.map((w) => (
                <CircleMarker
                  key={w.ward_no}
                  center={[w.lat, w.lon]}
                  radius={selectedWard?.ward_no === w.ward_no ? 10 : 7}
                  pathOptions={{
                    color: "#ffe1a7",
                    weight: selectedWard?.ward_no === w.ward_no ? 3 : 1.5,
                    fillColor: levelColor(w.risk_level),
                    fillOpacity: 0.95,
                  }}
                  eventHandlers={{
                    click: () => handleSelectWard(w),
                  }}
                >
                  <Popup>
                    <strong>
                      Ward {w.ward_no}: {w.name}
                    </strong>
                    <br />
                    Risk: {w.risk_score}/100 ({w.risk_level.toUpperCase()})<br />
                    DEM: {w.elevation_m} m · {w.major_lake} ({w.distance_to_lake_km} km)
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </Panel>

        <Panel
          className="xl:col-span-5"
          eyebrow="Sentinel-1 SAR Verification"
          title="Before / After Water Detection"
          subtitle={
            selectedWard
              ? `Zoomed to ${selectedWard.name} (${selectedWard.lat.toFixed(3)}°N, ${selectedWard.lon.toFixed(3)}°E)`
              : "Real Sentinel-1 RTC SAR backscatter comparison"
          }
        >
          <BeforeAfterSlider
            beforeSrc={
              selectedWard
                ? `/api/images/crop?name=s1_before.png&lat=${selectedWard.lat}&lon=${selectedWard.lon}&kind=flood&zoom=3.0`
                : "/api/images/s1_before.png"
            }
            afterSrc={
              selectedWard
                ? `/api/images/crop?name=flood_overlay.png&lat=${selectedWard.lat}&lon=${selectedWard.lon}&kind=flood&zoom=3.0`
                : "/api/images/flood_overlay.png"
            }
            beforeAlt="Sentinel-1 dry reference pass"
            afterAlt="Sentinel-1 flood pass with U-Net water detection"
            beforeLabel={`Before (${floodDates?.date_before ?? "Dry"})`}
            afterLabel={`After + SAR Water (${floodDates?.date_after ?? "Wet"})`}
          />
          <div className="mt-3 rounded-xl bg-surface-container-low p-3 font-mono text-xs text-secondary space-y-1">
            <div className="flex justify-between">
              <span>Elevation Source:</span>
              <span className="text-on-surface">{pred.sources.elevation}</span>
            </div>
            <div className="flex justify-between">
              <span>Rainfall Source:</span>
              <span className="text-on-surface">{pred.sources.rainfall}</span>
            </div>
          </div>
        </Panel>
      </div>

      {/* Ward-Wise Flood Risk + Previous Flood History & Trends */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          className="xl:col-span-6"
          eyebrow="BBMP Ward Breakdown"
          title="Ward-Wise Flood Risk Ranking"
          subtitle="Computed from Copernicus DEM elevation, local depression & lake proximity; click any row to inspect"
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pred.wards.slice(0, 8)} layout="vertical" margin={{ top: 4, right: 20, left: 10, bottom: 4 }}>
                <CartesianGrid stroke="rgba(166,208,189,0.12)" strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} stroke="#a6d0bd" fontSize={11} />
                <YAxis type="category" dataKey="name" stroke="#a6d0bd" fontSize={11} width={135} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#04251b", borderColor: "#4f4633", color: "#c8eada", borderRadius: "8px" }}
                />
                <Bar dataKey="risk_score" radius={[0, 6, 6, 0]}>
                  {pred.wards.slice(0, 8).map((w) => (
                    <Cell key={w.ward_no} fill={levelColor(w.risk_level)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="custom-scrollbar mt-4 max-h-60 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-outline-variant/30 font-mono text-[10px] uppercase text-secondary">
                <tr>
                  <th className="py-2 pr-2">Ward</th>
                  <th className="py-2 pr-2">Elev (m)</th>
                  <th className="py-2 pr-2">Lake Dist</th>
                  <th className="py-2 pr-2">S1 Water</th>
                  <th className="py-2">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {pred.wards.map((w) => (
                  <tr
                    key={w.ward_no}
                    onClick={() => handleSelectWard(w)}
                    className={`cursor-pointer transition hover:bg-surface-container-high ${
                      selectedWard?.ward_no === w.ward_no ? "bg-surface-container-highest" : ""
                    }`}
                  >
                    <td className="py-2 pr-2 font-medium text-on-surface">
                      {w.name} <span className="font-mono text-[10px] text-secondary">#{w.ward_no}</span>
                    </td>
                    <td className="py-2 pr-2 font-mono">{w.elevation_m}</td>
                    <td className="py-2 pr-2 font-mono">{w.distance_to_lake_km} km</td>
                    <td className="py-2 pr-2 font-mono text-flood-magenta">{w.s1_observed_water_ha} ha</td>
                    <td className="py-2">
                      <Badge tone={w.risk_level === "high" ? "coral" : w.risk_level === "medium" ? "gold" : "mint"}>
                        {w.risk_score} · {w.risk_level.toUpperCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          className="xl:col-span-6"
          eyebrow="Historical Context & Trends"
          title="Previous Flood History & Monthly Rainfall Trend"
          subtitle="24-month observed Open-Meteo Bengaluru rainfall (mm) & heavy-rain risk index"
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={pred.rainfall.monthly_history}>
                <CartesianGrid stroke="rgba(166,208,189,0.12)" strokeDasharray="3 3" />
                <XAxis dataKey="month" stroke="#a6d0bd" fontSize={10} />
                <YAxis yAxisId="left" stroke="#a6d0bd" fontSize={11} unit="mm" />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="#fbbf24" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#04251b", borderColor: "#4f4633", color: "#c8eada", borderRadius: "8px" }}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="rainfall_mm"
                  name="Monthly Rainfall (mm)"
                  fill="#72ff9e"
                  fillOpacity={0.22}
                  stroke="#72ff9e"
                  strokeWidth={2}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="risk_index"
                  name="Seasonal Risk Index"
                  stroke="#fbbf24"
                  strokeWidth={2.5}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 space-y-2">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary">
              Documented Past Bengaluru Flood Events
            </div>
            {pred.historical_events.map((ev) => (
              <div key={ev.year} className="rounded-xl bg-surface-container-low p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-primary">{ev.event}</span>
                  <Badge tone="coral">Peak {ev.peak_24h_mm} mm/24h</Badge>
                </div>
                <p className="mt-1 text-secondary">
                  Hotspots: {ev.hotspots} · <span className="font-mono text-[10px]">{ev.source}</span>
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* AI Risk & Prevention Assistant */}
      <Panel
        eyebrow="NVIDIA NIM Risk & Prevention Advisor"
        title={`AI Assistant — ${selectedWard ? `${selectedWard.name} (Ward #${selectedWard.ward_no})` : "Select a Ward"}`}
        subtitle="Explains topographic/drainage flood drivers from real DEM & lake metrics and suggests preventive actions"
        right={<AITagBadge />}
      >
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-5">
            {selectedWard && (
              <div className="grid grid-cols-2 gap-2.5 font-mono text-xs">
                <div className="rounded-xl bg-surface-container-low p-3">
                  <div className="text-[10px] uppercase text-secondary">Elevation / Depression</div>
                  <div className="mt-0.5 text-sm font-bold text-primary">
                    {selectedWard.elevation_m}m ({selectedWard.depression_m >= 0 ? "+" : ""}
                    {selectedWard.depression_m}m)
                  </div>
                </div>
                <div className="rounded-xl bg-surface-container-low p-3">
                  <div className="text-[10px] uppercase text-secondary">Nearest Lake / Drain</div>
                  <div className="mt-0.5 truncate text-sm font-bold text-tertiary">
                    {selectedWard.distance_to_lake_km} km ({selectedWard.major_lake})
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => handleAskAI()}
              disabled={aiBusy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-container px-4 py-3 font-mono text-xs font-bold text-on-primary-container shadow-md hover:bg-primary-fixed-dim disabled:opacity-60"
            >
              <Cpu className="h-4 w-4" aria-hidden="true" />
              <span>
                {aiBusy ? "Analyzing Ward Telemetry..." : `Explain Why ${selectedWard?.name ?? "Area"} Is At Risk & Prevent`}
              </span>
            </button>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAskAI(question);
              }}
              className="flex items-center gap-2 rounded-xl bg-surface-container-lowest p-1.5"
            >
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about drainage bottlenecks or prevention..."
                className="w-full bg-transparent px-2.5 py-1.5 text-xs text-on-surface placeholder:text-outline focus:outline-none"
              />
              <button
                type="submit"
                disabled={aiBusy}
                aria-label="Ask AI assistant"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-primary-container hover:bg-surface-variant"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </form>
          </div>

          <div className="lg:col-span-7">
            {!aiExplain ? (
              <div className="flex h-full flex-col justify-center rounded-xl border border-dashed border-outline-variant/40 p-5 text-xs text-secondary">
                <div className="flex items-center gap-2 font-semibold text-on-surface">
                  <ShieldCheck className="h-4 w-4 text-tertiary" aria-hidden="true" />
                  <span>Grounded Risk Explanation &amp; Preventive Guidance</span>
                </div>
                <p className="mt-1.5">
                  Click a ward on the map/table and click <strong>Explain Why Area Is At Risk &amp; Prevent</strong> to
                  get tailored drainage desilting, lake sluice management, and flood mitigation actions.
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-surface-container-low p-4 text-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-tertiary">
                  <span>SOURCE: {aiExplain.detail_source.toUpperCase()}</span>
                  <span className="flex items-center gap-1 text-primary">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    {aiExplain.ai_tag}
                  </span>
                </div>
                <p className="whitespace-pre-wrap leading-relaxed text-on-surface">{aiExplain.text}</p>
              </div>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
};
