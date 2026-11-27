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
  Bot,
  Compass,
  Flame,
  Info,
  Layers,
  RefreshCw,
  Satellite,
  Sparkles,
  Sun,
  Thermometer,
  Trees,
} from "lucide-react";
import { api } from "../api/client";
import { BeforeAfterSlider } from "../components/BeforeAfterSlider";
import { useGeoTerra } from "../context/GeoTerraContext";
import { AITagBadge, AssumptionTag, Badge, ErrorBox, LoadingSkeleton, Panel } from "../components/ui";
import type { AIResponse, GeoJSONFeatureCollection, HeatZoneItem, UrbanHeatResponse } from "../types";

const FlyToZone: React.FC<{ lat: number; lon: number }> = ({ lat, lon }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], 13, { duration: 0.7 });
  }, [lat, lon, map]);
  return null;
};

const HEAT_TIER_TONE: Record<string, "coral" | "gold" | "mint"> = {
  "Severe Heat Hotspot": "coral",
  "Moderate Heat Stress": "gold",
  "Cooler Canopy Zone": "mint",
};

export const UrbanHeatPage: React.FC = () => {
  const { demoMode } = useGeoTerra();

  const [horizonYears, setHorizonYears] = useState<number>(5);
  const [data, setData] = useState<UrbanHeatResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string>("peenya_industrial");
  const [viewScope, setViewScope] = useState<"zone" | "city">("zone");
  const [compareMode, setCompareMode] = useState<"lst" | "cooling">("lst");
  const [filterTier, setFilterTier] = useState<"all" | "hotspots" | "planting">("all");
  const [baseLayer, setBaseLayer] = useState<"osm" | "sat">("osm");

  const [showHotspots, setShowHotspots] = useState(true);
  const [showVegDecline, setShowVegDecline] = useState(true);
  const [showPlantation, setShowPlantation] = useState(true);

  const [aiQuestion, setAiQuestion] = useState("");
  const [aiResult, setAiResult] = useState<AIResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const loadHeat = async (horizon = horizonYears, refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else if (!data) setLoading(true);
      setError(null);
      const res = await api.getUrbanHeat(horizon, refresh);
      setData(res);
      if (res.zones.length > 0 && !res.zones.some((z) => z.id === selectedId)) {
        setSelectedId(res.zones[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Landsat thermal LST data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadHeat(horizonYears, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizonYears]);

  const selectedZone: HeatZoneItem | null = useMemo(() => {
    if (!data || data.zones.length === 0) return null;
    return data.zones.find((z) => z.id === selectedId) ?? data.zones[0];
  }, [data, selectedId]);

  const filteredZones = useMemo(() => {
    if (!data) return [];
    if (filterTier === "hotspots") {
      return data.zones.filter((z) => z.heat_tier === "Severe Heat Hotspot");
    }
    if (filterTier === "planting") {
      return data.zones.filter((z) => z.plantation_target_ha >= 20);
    }
    return data.zones;
  }, [data, filterTier]);

  const layerCollections = useMemo(() => {
    const empty: GeoJSONFeatureCollection = { type: "FeatureCollection", features: [] };
    if (!data?.geojson?.features) {
      return { hotspots: empty, vegDecline: empty, plantation: empty };
    }
    return {
      hotspots: {
        type: "FeatureCollection" as const,
        features: data.geojson.features.filter((f) => f.properties?.layer_kind === "heat_hotspot"),
      },
      vegDecline: {
        type: "FeatureCollection" as const,
        features: data.geojson.features.filter((f) => f.properties?.layer_kind === "veg_decline"),
      },
      plantation: {
        type: "FeatureCollection" as const,
        features: data.geojson.features.filter((f) => f.properties?.layer_kind === "plantation_priority"),
      },
    };
  }, [data]);

  const historyChartData = useMemo(() => {
    if (!selectedZone) return [];
    const pts = selectedZone.history.map((h) => ({
      year: String(h.year),
      mean_lst_c: Number(h.mean_lst_c.toFixed(1)),
      p90_lst_c: Number(h.p90_lst_c.toFixed(1)),
      projected_lst_c: null as number | null,
    }));
    if (pts.length > 0) {
      pts[pts.length - 1].projected_lst_c = pts[pts.length - 1].mean_lst_c;
    }
    pts.push({
      year: `${selectedZone.target_year} (Est.)`,
      mean_lst_c: null as unknown as number,
      p90_lst_c: null as unknown as number,
      projected_lst_c: Number(selectedZone.projected_lst_c.toFixed(1)),
    });
    return pts;
  }, [selectedZone]);

  const wardTempBarData = useMemo(() => {
    if (!data?.zones) return [];
    return data.zones.map((z) => ({
      name: z.name.split("–")[0].trim(),
      lst_2026: Number(z.mean_lst_2026_c.toFixed(1)),
      lst_future: Number(z.projected_lst_c.toFixed(1)),
      veg_loss_ha: Number(z.veg_loss_ha.toFixed(1)),
    }));
  }, [data]);

  const askAssistant = async (overrideQuestion?: string) => {
    if (!selectedZone) return;
    setAiLoading(true);
    try {
      const q = (overrideQuestion ?? aiQuestion).trim();
      const res = await api.explainUrbanHeat({
        zone_id: selectedZone.id,
        horizon_years: horizonYears,
        question: q || undefined,
        demo_mode: demoMode,
      });
      setAiResult(res);
    } catch (e) {
      setAiResult({
        text: e instanceof Error ? e.message : "Unable to reach NIM Urban Heat Advisor.",
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
    if (selectedZone) {
      void askAssistant();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedZone?.id, horizonYears]);

  if (loading) return <LoadingSkeleton rows={5} />;
  if (error || !data || !selectedZone) {
    return (
      <ErrorBox
        message={error ?? "No urban heat data available"}
        onRetry={() => void loadHeat(horizonYears, false)}
      />
    );
  }

  const beforeImg = viewScope === "city" ? data.city_images.lst_before : selectedZone.images.lst_before;
  const afterImg =
    viewScope === "city"
      ? compareMode === "cooling"
        ? data.city_images.cooling
        : data.city_images.lst_after
      : compareMode === "cooling"
        ? selectedZone.images.cooling
        : selectedZone.images.lst_after;

  return (
    <div className="space-y-6">
      {/* Header & Surface vs Air Temperature Distinction Banner */}
      <Panel
        eyebrow="LANDSAT 8/9 THERMAL BAND 10 (LWIR11) // 2019 → 2022 → 2024 → 2026"
        title="Bengaluru Urban Heat Island & Tree Cooling Forecast"
        subtitle={data.honesty_notice}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <AssumptionTag label={`Forecast: +${horizonYears}y (${data.summary.target_year} Estimate)`} />
            <div className="flex items-center rounded-xl border border-outline-variant/40 bg-surface-container p-1 font-mono text-xs">
              {[3, 5, 7].map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setHorizonYears(yr)}
                  className={`rounded-lg px-2.5 py-1 transition ${
                    horizonYears === yr
                      ? "bg-primary-container text-on-primary-container font-semibold"
                      : "text-secondary hover:text-on-surface"
                  }`}
                >
                  +{yr}y ({2026 + yr})
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void loadHeat(horizonYears, true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-high px-3 py-1.5 font-mono text-xs text-primary hover:bg-surface-bright disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing Landsat…" : "Refresh Thermal"}
            </button>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/35 bg-primary-container/10 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2 text-primary">
            <Info className="h-4 w-4 shrink-0" />
            <span>
              <b>Surface LST vs Air Temp:</b> Landsat measures <b>ground/roof skin temperature (LST)</b>, not shaded weather-station air temperature.
            </span>
          </div>
          <div className="flex flex-wrap gap-4 font-mono text-xs text-on-surface">
            <span>
              City Mean LST ({data.air_temp_benchmark.acq_date}):{" "}
              <b className="text-warning-orange">{data.summary.city_mean_lst_2026_c.toFixed(1)} °C</b>
            </span>
            <span>
              Station Max Air ({data.air_temp_benchmark.acq_date}):{" "}
              <b className="text-tertiary">{data.air_temp_benchmark.acq_day_max_air_temp_c.toFixed(1)} °C</b>
            </span>
            <span>
              Live 2m Air Now:{" "}
              <b className="text-sky-300">{data.air_temp_benchmark.current_air_temp_c.toFixed(1)} °C</b>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-secondary">
              <span>Hottest Ward (LST)</span>
              <Flame className="h-4 w-4 text-error-vivid" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-error-vivid">
              {data.summary.hottest_zone_lst_c.toFixed(1)} °C
            </p>
            <p className="mt-1 text-xs text-secondary">
              {data.summary.hottest_zone_name} (+{data.summary.max_uhi_spread_c.toFixed(1)} °C above green baseline)
            </p>
          </div>

          <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-secondary">
              <span>Severe Heat Hotspots</span>
              <Thermometer className="h-4 w-4 text-warning-orange" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-warning-orange">
              {data.summary.severe_hotspot_count} / {data.summary.total_zones}
            </p>
            <p className="mt-1 text-xs text-secondary">
              Green Canopy Baseline: {data.summary.coolest_zone_lst_c.toFixed(1)} °C LST
            </p>
          </div>

          <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-secondary">
              <span>Veg Cover Decline</span>
              <Sun className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-primary">
              -{data.summary.total_veg_loss_ha.toFixed(1)} ha
            </p>
            <p className="mt-1 text-xs text-secondary">
              NDVI drop (2019 → 2026) driving surface warming
            </p>
          </div>

          <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-secondary">
              <span>Tree Cooling Targets</span>
              <Trees className="h-4 w-4 text-tertiary" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-tertiary">
              {data.summary.total_plantation_target_ha.toFixed(1)} ha
            </p>
            <p className="mt-1 text-xs text-secondary">
              High-heat + low-NDVI corridors prioritized for tree planting
            </p>
          </div>
        </div>
      </Panel>

      {/* Thermal Map + Landsat Thermal Imagery Comparison */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          className="xl:col-span-7"
          eyebrow="LANDSAT THERMAL HOTSPOTS & PLANTATION CORRIDORS"
          title="Interactive Bengaluru Surface Heat & Greening Map"
          subtitle="Click a ward marker to inspect temperature history and tree-cooling potential."
          right={
            <div className="flex flex-wrap gap-2 font-mono text-xs">
              <button
                type="button"
                onClick={() => setShowHotspots((v) => !v)}
                className={`rounded-lg border px-2.5 py-1 transition ${
                  showHotspots
                    ? "border-error-vivid/60 bg-error-container/40 text-on-error-container"
                    : "border-outline-variant/30 text-secondary"
                }`}
              >
                <Layers className="mr-1 inline h-3 w-3" />
                Heat Hotspots
              </button>
              <button
                type="button"
                onClick={() => setShowVegDecline((v) => !v)}
                className={`rounded-lg border px-2.5 py-1 transition ${
                  showVegDecline
                    ? "border-primary/60 bg-primary-container/20 text-primary"
                    : "border-outline-variant/30 text-secondary"
                }`}
              >
                Veg Decline
              </button>
              <button
                type="button"
                onClick={() => setShowPlantation((v) => !v)}
                className={`rounded-lg border px-2.5 py-1 transition ${
                  showPlantation
                    ? "border-tertiary/60 bg-tertiary-container/20 text-tertiary"
                    : "border-outline-variant/30 text-secondary"
                }`}
              >
                Tree Targets
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
              center={[selectedZone.lat, selectedZone.lon]}
              zoom={12}
              className="h-full w-full"
              scrollWheelZoom
            >
              <FlyToZone lat={selectedZone.lat} lon={selectedZone.lon} />
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

              {showHotspots && layerCollections.hotspots.features.length > 0 && (
                <LeafletGeoJSON
                  key="heat-hotspots"
                  data={layerCollections.hotspots as any}
                  style={{
                    color: "#ef4444",
                    weight: 1.2,
                    fillColor: "#f97316",
                    fillOpacity: 0.44,
                  }}
                />
              )}

              {showVegDecline && layerCollections.vegDecline.features.length > 0 && (
                <LeafletGeoJSON
                  key="heat-veg-decline"
                  data={layerCollections.vegDecline as any}
                  style={{
                    color: "#fbbf24",
                    weight: 1,
                    fillColor: "#fbbf24",
                    fillOpacity: 0.34,
                  }}
                />
              )}

              {showPlantation && layerCollections.plantation.features.length > 0 && (
                <LeafletGeoJSON
                  key="heat-plantation"
                  data={layerCollections.plantation as any}
                  style={{
                    color: "#22c55e",
                    weight: 1.5,
                    fillColor: "#72ff9e",
                    fillOpacity: 0.42,
                  }}
                />
              )}

              {data.zones.map((z) => {
                const isSelected = z.id === selectedZone.id;
                const color =
                  z.heat_tier === "Severe Heat Hotspot"
                    ? "#f87171"
                    : z.heat_tier === "Moderate Heat Stress"
                      ? "#fbbf24"
                      : "#72ff9e";
                return (
                  <CircleMarker
                    key={`${z.id}-${horizonYears}-${isSelected}`}
                    center={[z.lat, z.lon]}
                    radius={isSelected ? 14 : Math.max(8, Math.min(16, Math.round(6 + z.projected_delta_c * 3.5)))}
                    pathOptions={{
                      color: isSelected ? "#ffffff" : color,
                      weight: isSelected ? 2.5 : 1.5,
                      fillColor: color,
                      fillOpacity: 0.78,
                    }}
                    eventHandlers={{
                      click: () => setSelectedId(z.id),
                    }}
                  >
                    <Popup>
                      <div className="min-w-[220px] space-y-1 text-xs text-slate-900">
                        <p className="font-bold text-sm">{z.name}</p>
                        <p className="text-slate-600">{z.zone}</p>
                        <p>
                          Surface LST (2026): <b>{z.mean_lst_2026_c.toFixed(1)} °C</b> (Peak {z.p90_lst_2026_c.toFixed(1)} °C)
                        </p>
                        <p>
                          Est. {z.target_year} LST: <b>{z.projected_lst_c.toFixed(1)} °C</b> (estimate)
                        </p>
                        <p className="text-emerald-700 font-medium">
                          Planting priority: {z.plantation_target_ha.toFixed(1)} ha (est. -{z.potential_cooling_c.toFixed(1)} °C)
                        </p>
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
                <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Severe Heat Hotspot (LST)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Vegetation Decline
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#72ff9e]" /> Tree Plantation Target
              </span>
            </div>
            <span className="font-mono text-[11px] text-primary">Selected: {selectedZone.name}</span>
          </div>
        </Panel>

        {/* Satellite Thermal Swipe Slider */}
        <Panel
          className="xl:col-span-5"
          eyebrow={`LANDSAT 8/9 LWIR11 // ${viewScope === "city" ? "GREATER BENGALURU" : selectedZone.zone}`}
          title={viewScope === "city" ? "Bengaluru Citywide Thermal Heatmap" : selectedZone.name}
          subtitle="Compare 2019 vs 2026 Surface Temperature (°C) or Cooling Targets"
          right={
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
              <button
                type="button"
                onClick={() => setViewScope(viewScope === "zone" ? "city" : "zone")}
                className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 bg-surface-container px-2.5 py-1 text-tertiary hover:bg-surface-bright"
              >
                <Compass className="h-3 w-3" />
                {viewScope === "zone" ? "Citywide LST" : "Ward Zoom"}
              </button>
              <button
                type="button"
                onClick={() => setCompareMode(compareMode === "lst" ? "cooling" : "lst")}
                className="rounded-lg bg-primary-container px-2.5 py-1 font-semibold text-on-primary-container"
              >
                {compareMode === "lst" ? "2026 Thermal LST" : "Tree Cooling Targets"}
              </button>
            </div>
          }
        >
          <BeforeAfterSlider
            beforeSrc={beforeImg}
            afterSrc={afterImg}
            beforeAlt="Landsat 2019-03-13 Land Surface Temperature"
            afterAlt="Landsat 2026-02-12 Land Surface Temperature"
            beforeLabel="2019-03-13 LST"
            afterLabel={compareMode === "cooling" ? "2026 Greening Targets" : "2026-02-12 LST"}
            heightClass="h-72"
          />

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-2.5">
              <p className="font-mono text-[10px] uppercase text-secondary">Surface LST</p>
              <p className="font-mono text-sm font-bold text-warning-orange">
                {selectedZone.mean_lst_2026_c.toFixed(1)} °C
              </p>
            </div>
            <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-2.5">
              <p className="font-mono text-[10px] uppercase text-secondary">2019→2026 Δ</p>
              <p className="font-mono text-sm font-bold text-primary">
                {selectedZone.warming_delta_c >= 0 ? "+" : ""}
                {selectedZone.warming_delta_c.toFixed(2)} °C
              </p>
            </div>
            <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-2.5">
              <p className="font-mono text-[10px] uppercase text-secondary">{selectedZone.target_year} Est.</p>
              <p className="font-mono text-sm font-bold text-error-vivid">
                {selectedZone.projected_lst_c.toFixed(1)} °C
              </p>
            </div>
            <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-2.5">
              <p className="font-mono text-[10px] uppercase text-secondary">Tree Cooling Est.</p>
              <p className="font-mono text-sm font-bold text-tertiary">
                -{selectedZone.potential_cooling_c.toFixed(1)} °C
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-primary/30 bg-primary-container/10 px-3 py-2 text-xs text-primary">
            <Satellite className="mr-1.5 inline h-3.5 w-3.5" />
            {selectedZone.prediction_label} — {selectedZone.heat_driver}
          </div>
        </Panel>
      </div>

      {/* Historical & Predicted Heat Charts + NIM AI Advisor */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          className="xl:col-span-6"
          eyebrow="HISTORICAL LST TRAJECTORY (2019–2026) & WARD COMPARISON"
          title={`${selectedZone.name} Temperature Trend vs Bengaluru Wards`}
        >
          <div className="space-y-5">
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="year" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} domain={["auto", "auto"]} unit=" °C" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#04251b",
                      border: "1px solid rgba(251,191,36,0.3)",
                      borderRadius: "10px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Line type="monotone" dataKey="mean_lst_c" name="Mean LST (°C)" stroke="#fbbf24" strokeWidth={2.5} />
                  <Line type="monotone" dataKey="p90_lst_c" name="Peak Hotspot p90 (°C)" stroke="#f87171" strokeWidth={2} />
                  <Line
                    type="monotone"
                    dataKey="projected_lst_c"
                    name={`Projected ${selectedZone.target_year} (Est.)`}
                    stroke="#f97316"
                    strokeDasharray="5 4"
                    strokeWidth={2.5}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={wardTempBarData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#04251b",
                      border: "1px solid rgba(114,255,158,0.25)",
                      borderRadius: "10px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Bar dataKey="lst_2026" name="2026 Mean LST (°C)" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="lst_future" name={`Est. ${data.summary.target_year} (°C)`} fill="#f87171" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Panel>

        <Panel
          className="xl:col-span-6"
          eyebrow="NVIDIA NIM URBAN COOLING & HEAT MITIGATION ADVISOR"
          title="AI Heat Island & Tree Plantation Assistant"
          subtitle="Explains why zones overheat and recommends tree plantation & greening strategies."
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
              `Why is ${selectedZone.name} hotter than greener parts of Bengaluru?`,
              "Which wards need urgent tree plantation and pocket parks to reduce urban heat?",
              "How much difference can canopy expansion make vs current surface LST trends?",
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
              placeholder={`Ask why ${selectedZone.name} is warming or where to plant trees…`}
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

          <div className="min-h-[245px] whitespace-pre-wrap rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 text-sm leading-relaxed text-on-surface">
            {aiLoading ? (
              <p className="animate-pulse font-mono text-xs text-secondary">
                Evaluating Landsat 8/9 thermal profiles and greening gaps with NIM advisor…
              </p>
            ) : aiResult ? (
              aiResult.text
            ) : (
              "Select a ward or ask a question to inspect urban heat drivers and cooling plans."
            )}
          </div>
        </Panel>
      </div>

      {/* Ward-Wise Thermal Comparison & Plantation Priority Matrix */}
      <Panel
        eyebrow="WARD-WISE LANDSAT THERMAL RANKING & COOLING PLAN"
        title="Surface Temperature Hotspots & Tree Plantation Priority"
        right={
          <div className="flex flex-wrap gap-1.5 font-mono text-xs">
            {(
              [
                ["all", `All Wards (${data.zones.length})`],
                ["hotspots", `Severe Hotspots (${data.summary.severe_hotspot_count})`],
                ["planting", "High Plantation Need (>=20 ha)"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilterTier(k)}
                className={`rounded-lg border px-2.5 py-1 ${
                  filterTier === k
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
                <th className="py-2.5 pr-4">Ward / Thermal Zone</th>
                <th className="py-2.5 pr-4">2026 Mean / Peak LST</th>
                <th className="py-2.5 pr-4">2019→26 Δ</th>
                <th className="py-2.5 pr-4">Veg Loss / NDVI</th>
                <th className="py-2.5 pr-4">Est. {data.summary.target_year} LST</th>
                <th className="py-2.5 pr-4">Cooling Benefit (Est.)</th>
                <th className="py-2.5">Recommended Heat Mitigation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {filteredZones.map((z) => (
                <tr
                  key={z.id}
                  onClick={() => setSelectedId(z.id)}
                  className={`cursor-pointer transition hover:bg-surface-container-high/50 ${
                    z.id === selectedZone.id ? "bg-surface-container-high/70" : ""
                  }`}
                >
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-on-surface">{z.name}</p>
                    <p className="text-[11px] text-secondary">
                      {z.zone} · Ward {z.ward_no}
                    </p>
                  </td>
                  <td className="py-3 pr-4 font-mono">
                    <span className="font-semibold text-warning-orange">{z.mean_lst_2026_c.toFixed(1)} °C</span>
                    <span className="block text-[11px] text-secondary">Peak p90: {z.p90_lst_2026_c.toFixed(1)} °C</span>
                  </td>
                  <td className="py-3 pr-4 font-mono">
                    <span className={z.warming_delta_c > 0 ? "text-error-vivid font-semibold" : "text-tertiary"}>
                      {z.warming_delta_c >= 0 ? "+" : ""}
                      {z.warming_delta_c.toFixed(2)} °C
                    </span>
                    <span className="block text-[10px] text-secondary">+{z.heat_island_anomaly_c.toFixed(1)} °C vs cool</span>
                  </td>
                  <td className="py-3 pr-4 font-mono">
                    <span className="text-primary">-{z.veg_loss_ha.toFixed(1)} ha</span>
                    <span className="block text-[11px] text-secondary">NDVI {z.mean_ndvi_2026.toFixed(2)}</span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-error-vivid font-semibold">
                    {z.projected_lst_c.toFixed(1)} °C
                    <span className="block text-[10px] font-normal text-secondary">Estimate only</span>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={HEAT_TIER_TONE[z.heat_tier] ?? "sage"}>
                      -{z.potential_cooling_c.toFixed(1)} °C ({z.plantation_target_ha.toFixed(0)} ha)
                    </Badge>
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {z.cooling_interventions.map((act) => (
                        <span
                          key={act}
                          className="inline-flex items-center gap-1 rounded-md border border-outline-variant/30 bg-surface-container px-2 py-0.5 text-[11px] text-on-surface"
                        >
                          <Trees className="h-3 w-3 text-tertiary" />
                          {act}
                        </span>
                      ))}
                    </div>
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
