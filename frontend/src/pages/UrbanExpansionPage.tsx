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
  Building2,
  Compass,
  HardHat,
  Layers,
  RefreshCw,
  Route,
  Satellite,
  Sparkles,
  Trees,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { api } from "../api/client";
import { BeforeAfterSlider } from "../components/BeforeAfterSlider";
import { useGeoTerra } from "../context/GeoTerraContext";
import { AITagBadge, AssumptionTag, Badge, ErrorBox, LoadingSkeleton, Panel } from "../components/ui";
import type { AIResponse, GeoJSONFeatureCollection, UrbanCorridorItem, UrbanExpansionResponse } from "../types";

const FlyToCorridor: React.FC<{ lat: number; lon: number }> = ({ lat, lon }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], 13, { duration: 0.7 });
  }, [lat, lon, map]);
  return null;
};

const TIER_TONE: Record<string, "coral" | "gold" | "mint"> = {
  "Fast-Growing Hotspot": "coral",
  "Moderate Expansion": "gold",
  "Stable Core": "mint",
};

export const UrbanExpansionPage: React.FC = () => {
  const { demoMode } = useGeoTerra();

  const [horizonYears, setHorizonYears] = useState<number>(5);
  const [data, setData] = useState<UrbanExpansionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string>("bellandur_sarjapur");
  const [viewScope, setViewScope] = useState<"corridor" | "city">("corridor");
  const [beforeYear, setBeforeYear] = useState<"2019" | "2022" | "2024">("2019");
  const [compareMode, setCompareMode] = useState<"overlay" | "after">("overlay");
  const [filterTier, setFilterTier] = useState<"all" | "hotspots" | "infra">("all");
  const [infraFilter, setInfraFilter] = useState<string>("all");
  const [baseLayer, setBaseLayer] = useState<"osm" | "sat">("osm");

  const [showNewUrban, setShowNewUrban] = useState(true);
  const [showConstruction, setShowConstruction] = useState(true);
  const [showVegLoss, setShowVegLoss] = useState(true);
  const [showProjected, setShowProjected] = useState(true);

  const [aiQuestion, setAiQuestion] = useState("");
  const [aiResult, setAiResult] = useState<AIResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const loadUrban = async (horizon = horizonYears, refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else if (!data) setLoading(true);
      setError(null);
      const res = await api.getUrbanExpansion(horizon, refresh);
      setData(res);
      if (res.corridors.length > 0 && !res.corridors.some((c) => c.id === selectedId)) {
        setSelectedId(res.corridors[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Bengaluru urban expansion telemetry");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadUrban(horizonYears, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizonYears]);

  const selectedCorridor: UrbanCorridorItem | null = useMemo(() => {
    if (!data || data.corridors.length === 0) return null;
    return data.corridors.find((c) => c.id === selectedId) ?? data.corridors[0];
  }, [data, selectedId]);

  const filteredCorridors = useMemo(() => {
    if (!data) return [];
    let list = data.corridors;
    if (filterTier === "hotspots") {
      list = list.filter((c) => c.growth_tier === "Fast-Growing Hotspot");
    } else if (filterTier === "infra") {
      list = list.filter((c) => c.infrastructure_needs.length >= 2);
    }
    if (infraFilter !== "all") {
      list = list.filter((c) =>
        c.infrastructure_needs.some((n) => n.toLowerCase().includes(infraFilter)),
      );
    }
    return list;
  }, [data, filterTier, infraFilter]);

  const layerCollections = useMemo(() => {
    const empty: GeoJSONFeatureCollection = { type: "FeatureCollection", features: [] };
    if (!data?.geojson?.features) {
      return { newUrban: empty, construction: empty, vegLoss: empty };
    }
    return {
      newUrban: {
        type: "FeatureCollection" as const,
        features: data.geojson.features.filter((f) => f.properties?.layer_kind === "new_urban"),
      },
      construction: {
        type: "FeatureCollection" as const,
        features: data.geojson.features.filter((f) => f.properties?.layer_kind === "construction"),
      },
      vegLoss: {
        type: "FeatureCollection" as const,
        features: data.geojson.features.filter((f) => f.properties?.layer_kind === "veg_loss"),
      },
    };
  }, [data]);

  const trajectoryChartData = useMemo(() => {
    if (!selectedCorridor) return [];
    const pts = selectedCorridor.history.map((h) => ({
      year: String(h.year),
      built_ha: Number(h.built_ha.toFixed(1)),
      veg_ha: Number(h.veg_ha.toFixed(1)),
      projected_built_ha: null as number | null,
    }));
    if (pts.length > 0) {
      pts[pts.length - 1].projected_built_ha = pts[pts.length - 1].built_ha;
    }
    pts.push({
      year: `${selectedCorridor.target_year} (Est.)`,
      built_ha: null as unknown as number,
      veg_ha: Number(selectedCorridor.projected_veg_ha.toFixed(1)),
      projected_built_ha: Number(selectedCorridor.projected_built_ha.toFixed(1)),
    });
    return pts;
  }, [selectedCorridor]);

  const wardComparisonData = useMemo(() => {
    if (!data?.corridors) return [];
    return data.corridors.map((c) => ({
      name: c.name.split("–")[0].trim(),
      new_urban_ha: Number(c.new_urban_ha.toFixed(1)),
      veg_loss_ha: Number(c.veg_loss_ha.toFixed(1)),
      projected_ha: Number(c.projected_added_ha.toFixed(1)),
    }));
  }, [data]);

  const askAssistant = async (overrideQuestion?: string) => {
    if (!selectedCorridor) return;
    setAiLoading(true);
    try {
      const q = (overrideQuestion ?? aiQuestion).trim();
      const res = await api.explainUrbanExpansion({
        corridor_id: selectedCorridor.id,
        horizon_years: horizonYears,
        question: q || undefined,
        demo_mode: demoMode,
      });
      setAiResult(res);
    } catch (e) {
      setAiResult({
        text: e instanceof Error ? e.message : "Unable to reach NIM Urban Planning Advisor.",
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
    if (selectedCorridor) {
      void askAssistant();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCorridor?.id, horizonYears]);

  if (loading) return <LoadingSkeleton rows={5} />;
  if (error || !data || !selectedCorridor) {
    return (
      <ErrorBox
        message={error ?? "No urban expansion telemetry loaded"}
        onRetry={() => void loadUrban(horizonYears, false)}
      />
    );
  }

  const beforeDateLabel =
    beforeYear === "2024" ? "2024-03-13" : beforeYear === "2022" ? "2022-03-04" : "2019-03-30";
  const sliderBeforeSrc =
    viewScope === "city"
      ? data.city_images.before
      : beforeYear === "2024"
        ? (selectedCorridor.images.y2024 ?? selectedCorridor.images.before)
        : beforeYear === "2022"
          ? (selectedCorridor.images.y2022 ?? selectedCorridor.images.before)
          : selectedCorridor.images.before;
  const sliderAfterSrc =
    viewScope === "city"
      ? compareMode === "overlay"
        ? data.city_images.overlay
        : data.city_images.after
      : compareMode === "overlay"
        ? selectedCorridor.images.overlay
        : selectedCorridor.images.after;

  return (
    <div className="space-y-6">
      {/* Header + Projection Horizon Controls */}
      <Panel
        eyebrow="SENTINEL-2 MULTI-YEAR URBAN CHANGE (2019 → 2022 → 2024 → 2026)"
        title="Bengaluru Urban Expansion & Infrastructure Forecast"
        subtitle={data.prediction_notice}
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
              onClick={() => void loadUrban(horizonYears, true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-high px-3 py-1.5 font-mono text-xs text-primary hover:bg-surface-bright disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing S2…" : "Refresh S2"}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-secondary">
              <span>New Urban (2019–2026)</span>
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-primary">
              +{data.summary.measured_new_urban_ha.toFixed(1)} ha
            </p>
            <p className="mt-1 text-xs text-secondary">
              Measured across {data.summary.total_corridors} Bengaluru corridors (10 m Sentinel-2)
            </p>
          </div>

          <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-secondary">
              <span>Active Construction</span>
              <HardHat className="h-4 w-4 text-warning-orange" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-warning-orange">
              {data.summary.measured_active_construction_ha.toFixed(1)} ha
            </p>
            <p className="mt-1 text-xs text-secondary">
              Bare soil &amp; rising NDBI zones (2024 → 2026)
            </p>
          </div>

          <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-secondary">
              <span>Green Cover Loss</span>
              <Trees className="h-4 w-4 text-error-vivid" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-error-vivid">
              -{data.summary.measured_veg_loss_ha.toFixed(1)} ha
            </p>
            <p className="mt-1 text-xs text-secondary">
              NDVI decline in dry-season canopy (2019 → 2026)
            </p>
          </div>

          <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-secondary">
              <span>Projected +{horizonYears}y Infill (Est.)</span>
              <TrendingUp className="h-4 w-4 text-tertiary" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-tertiary">
              +{data.summary.projected_additional_urban_ha.toFixed(1)} ha
            </p>
            <p className="mt-1 text-xs text-secondary">
              {data.summary.fast_growing_count} fast-growing hotspots · {data.summary.infra_priority_count} need infra upgrades
            </p>
          </div>
        </div>
      </Panel>

      {/* Interactive Map + Before/After Satellite Slider */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          className="xl:col-span-7"
          eyebrow="SPATIAL EXPANSION HEATMAP // SENTINEL-2 CHANGE POLYGONS"
          title="Bengaluru Growth Corridors & Vegetation Loss Map"
          subtitle="Click any marker to inspect ward growth history and infrastructure gaps."
          right={
            <div className="flex flex-wrap gap-2 font-mono text-xs">
              <button
                type="button"
                onClick={() => setShowNewUrban((v) => !v)}
                className={`rounded-lg border px-2.5 py-1 transition ${
                  showNewUrban
                    ? "border-warning-orange/60 bg-warning-orange/20 text-warning-orange"
                    : "border-outline-variant/30 text-secondary"
                }`}
              >
                <Layers className="mr-1 inline h-3 w-3" />
                New Urban
              </button>
              <button
                type="button"
                onClick={() => setShowConstruction((v) => !v)}
                className={`rounded-lg border px-2.5 py-1 transition ${
                  showConstruction
                    ? "border-primary/60 bg-primary-container/20 text-primary"
                    : "border-outline-variant/30 text-secondary"
                }`}
              >
                Construction
              </button>
              <button
                type="button"
                onClick={() => setShowVegLoss((v) => !v)}
                className={`rounded-lg border px-2.5 py-1 transition ${
                  showVegLoss
                    ? "border-flood-magenta/60 bg-flood-magenta/15 text-flood-magenta"
                    : "border-outline-variant/30 text-secondary"
                }`}
              >
                Veg Loss
              </button>
              <button
                type="button"
                onClick={() => setShowProjected((v) => !v)}
                className={`rounded-lg border px-2.5 py-1 transition ${
                  showProjected
                    ? "border-sky-400/70 bg-sky-400/15 text-sky-300"
                    : "border-outline-variant/30 text-secondary"
                }`}
              >
                {data.summary.target_year} Forecast
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
              center={[selectedCorridor.lat, selectedCorridor.lon]}
              zoom={12}
              className="h-full w-full"
              scrollWheelZoom
            >
              <FlyToCorridor lat={selectedCorridor.lat} lon={selectedCorridor.lon} />
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

              {showNewUrban && layerCollections.newUrban.features.length > 0 && (
                <LeafletGeoJSON
                  key="urban-new"
                  data={layerCollections.newUrban as any}
                  style={{
                    color: "#f97316",
                    weight: 1,
                    fillColor: "#f97316",
                    fillOpacity: 0.42,
                  }}
                />
              )}

              {showConstruction && layerCollections.construction.features.length > 0 && (
                <LeafletGeoJSON
                  key="urban-constr"
                  data={layerCollections.construction as any}
                  style={{
                    color: "#fbbf24",
                    weight: 1.2,
                    fillColor: "#fbbf24",
                    fillOpacity: 0.55,
                  }}
                />
              )}

              {showVegLoss && layerCollections.vegLoss.features.length > 0 && (
                <LeafletGeoJSON
                  key="urban-veg-loss"
                  data={layerCollections.vegLoss as any}
                  style={{
                    color: "#e879f9",
                    weight: 1,
                    fillColor: "#d946ef",
                    fillOpacity: 0.36,
                  }}
                />
              )}

              {showProjected &&
                data.corridors.map((c) => (
                  <CircleMarker
                    key={`proj-${c.id}-${horizonYears}`}
                    center={[c.lat, c.lon]}
                    radius={Math.max(12, Math.min(38, Math.round(c.projected_added_ha / 3.4)))}
                    pathOptions={{
                      color: "#38bdf8",
                      weight: 1.5,
                      dashArray: "5 4",
                      fillColor: "#38bdf8",
                      fillOpacity: 0.14,
                    }}
                    interactive={false}
                  />
                ))}

              {data.corridors.map((c) => {
                const isSelected = c.id === selectedCorridor.id;
                const color =
                  c.growth_tier === "Fast-Growing Hotspot"
                    ? "#f87171"
                    : c.growth_tier === "Moderate Expansion"
                      ? "#fbbf24"
                      : "#72ff9e";
                return (
                  <CircleMarker
                    key={`${c.id}-${horizonYears}-${isSelected}`}
                    center={[c.lat, c.lon]}
                    radius={Math.max(7, Math.min(20, Math.round(c.growth_pressure_score / 5.2)))}
                    pathOptions={{
                      color: isSelected ? "#ffffff" : color,
                      weight: isSelected ? 2.5 : 1.5,
                      fillColor: color,
                      fillOpacity: 0.38,
                    }}
                    eventHandlers={{
                      click: () => setSelectedId(c.id),
                    }}
                  >
                    <Popup>
                      <div className="min-w-[220px] space-y-1 text-xs text-slate-900">
                        <p className="font-bold text-sm">{c.name}</p>
                        <p className="text-slate-600">{c.zone}</p>
                        <p>
                          New urban (2019–2026): <b>+{c.new_urban_ha.toFixed(1)} ha</b>
                        </p>
                        <p>
                          Veg loss: <b>-{c.veg_loss_ha.toFixed(1)} ha</b> · Construction: <b>{c.active_construction_ha.toFixed(1)} ha</b>
                        </p>
                        <p className="text-amber-700 font-medium">
                          {c.target_year} Est. Growth: +{c.projected_added_ha.toFixed(1)} ha (estimate)
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
                <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Newly Developed Urban
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Active Construction
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-fuchsia-400" /> Vegetation Loss
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border border-dashed border-sky-400 bg-sky-400/20" /> {data.summary.target_year} Forecast Ring (Est.)
              </span>
            </div>
            <span className="font-mono text-[11px] text-primary">Selected: {selectedCorridor.name}</span>
          </div>
        </Panel>

        {/* Satellite Comparison Slider */}
        <Panel
          className="xl:col-span-5"
          eyebrow={`SENTINEL-2 RGB // ${viewScope === "city" ? "GREATER BENGALURU" : selectedCorridor.zone}`}
          title={viewScope === "city" ? "Greater Bengaluru Macro Change" : selectedCorridor.name}
          subtitle="Orange: New Urban · Gold: Construction · Magenta: Vegetation Loss"
          right={
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
              {viewScope === "corridor" &&
                (["2019", "2022", "2024"] as const).map((yr) => (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => setBeforeYear(yr)}
                    className={`rounded-lg border px-2 py-1 ${
                      beforeYear === yr
                        ? "border-tertiary/60 bg-tertiary-container/25 text-tertiary"
                        : "border-outline-variant/30 text-secondary"
                    }`}
                  >
                    {yr}
                  </button>
                ))}
              <button
                type="button"
                onClick={() => setViewScope(viewScope === "corridor" ? "city" : "corridor")}
                className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 bg-surface-container px-2.5 py-1 text-tertiary hover:bg-surface-bright"
              >
                <Compass className="h-3 w-3" />
                {viewScope === "corridor" ? "Citywide View" : "Corridor Zoom"}
              </button>
              <button
                type="button"
                onClick={() => setCompareMode(compareMode === "overlay" ? "after" : "overlay")}
                className="rounded-lg bg-primary-container px-2.5 py-1 font-semibold text-on-primary-container"
              >
                {compareMode === "overlay" ? "Changes Mask" : "2026 Raw RGB"}
              </button>
            </div>
          }
        >
          <BeforeAfterSlider
            beforeSrc={sliderBeforeSrc}
            afterSrc={sliderAfterSrc}
            beforeAlt={`Sentinel-2 ${viewScope === "city" ? "2019-03-30" : beforeDateLabel} baseline`}
            afterAlt="Sentinel-2 2026-02-01 urban expansion comparison"
            beforeLabel={`Before: ${viewScope === "city" ? "2019-03-30" : beforeDateLabel}`}
            afterLabel={compareMode === "overlay" ? "2026 Change Mask" : "After: 2026-02-01"}
            heightClass="h-72"
          />

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-2.5">
              <p className="font-mono text-[10px] uppercase text-secondary">New Urban</p>
              <p className="font-mono text-sm font-bold text-primary">+{selectedCorridor.new_urban_ha.toFixed(1)} ha</p>
            </div>
            <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-2.5">
              <p className="font-mono text-[10px] uppercase text-secondary">Construction</p>
              <p className="font-mono text-sm font-bold text-warning-orange">
                {selectedCorridor.active_construction_ha.toFixed(1)} ha
              </p>
            </div>
            <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-2.5">
              <p className="font-mono text-[10px] uppercase text-secondary">Veg Loss</p>
              <p className="font-mono text-sm font-bold text-error-vivid">
                -{selectedCorridor.veg_loss_ha.toFixed(1)} ha
              </p>
            </div>
            <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-2.5">
              <p className="font-mono text-[10px] uppercase text-secondary">{selectedCorridor.target_year} Est.</p>
              <p className="font-mono text-sm font-bold text-tertiary">
                +{selectedCorridor.projected_added_ha.toFixed(1)} ha
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-primary/30 bg-primary-container/10 px-3 py-2 text-xs text-primary">
            <Satellite className="mr-1.5 inline h-3.5 w-3.5" />
            {selectedCorridor.prediction_label} — {selectedCorridor.water_note}
          </div>
        </Panel>
      </div>

      {/* Trajectory + Ward Comparison Charts + AI Infrastructure Planner */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          className="xl:col-span-6"
          eyebrow="HISTORICAL OBSERVED (2019–2026) VS FUTURE ESTIMATE"
          title={`${selectedCorridor.name} Urban vs Green Trajectory`}
        >
          <div className="space-y-5">
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trajectoryChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="year" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} unit=" ha" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#04251b",
                      border: "1px solid rgba(251,191,36,0.3)",
                      borderRadius: "10px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Line type="monotone" dataKey="built_ha" name="Observed Built-up (ha)" stroke="#fbbf24" strokeWidth={2.5} />
                  <Line
                    type="monotone"
                    dataKey="projected_built_ha"
                    name={`Projected ${selectedCorridor.target_year} (Est.)`}
                    stroke="#f97316"
                    strokeDasharray="5 4"
                    strokeWidth={2.5}
                  />
                  <Line type="monotone" dataKey="veg_ha" name="Green Cover (ha)" stroke="#72ff9e" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={wardComparisonData}>
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
                  <Bar dataKey="new_urban_ha" name="New Urban 19–26" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="veg_loss_ha" name="Veg Loss 19–26" fill="#e879f9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="projected_ha" name={`Est. +${horizonYears}y`} fill="#38bdf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Panel>

        <Panel
          className="xl:col-span-6"
          eyebrow="NVIDIA NIM INFRASTRUCTURE & MASTERPLAN ADVISOR"
          title="AI Urban Expansion & Infrastructure Assistant"
          subtitle="Recommends roads, drainage, piped water & green-cover actions from real growth trends."
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
              `Why is ${selectedCorridor.name} expanding rapidly and what infrastructure is needed?`,
              `Which Bengaluru wards will face the highest growth pressure by ${data.summary.target_year}?`,
              "Where should BBMP and BWSSB prioritize new roads, stormwater drains, and piped water?",
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
              placeholder={`Ask about ${selectedCorridor.name} roads, water, drainage or growth…`}
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
                Evaluating Sentinel-2 2019–2026 growth corridors with NIM advisor…
              </p>
            ) : aiResult ? (
              aiResult.text
            ) : (
              "Select a corridor or ask a question to inspect infrastructure recommendations."
            )}
          </div>
        </Panel>
      </div>

      {/* Ward-Wise Growth & Infrastructure Priority Table */}
      <Panel
        eyebrow="WARD-WISE GROWTH & INFRASTRUCTURE DEFICIT MATRIX"
        title="Fast-Growing Corridors & Recommended Public Infrastructure"
        right={
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
            {(
              [
                ["all", `All (${data.corridors.length})`],
                ["hotspots", `Fast-Growing (${data.summary.fast_growing_count})`],
                ["infra", `Infra Priority (${data.summary.infra_priority_count})`],
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
            <span className="mx-1 text-outline-variant">|</span>
            {(
              [
                ["all", "All Infra"],
                ["roads", "Roads"],
                ["drainage", "Drainage"],
                ["water", "Water Supply"],
                ["canopy", "Greenbelt"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setInfraFilter(k)}
                className={`rounded-lg border px-2 py-1 ${
                  infraFilter === k
                    ? "border-tertiary/60 bg-tertiary-container/20 text-tertiary"
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
                <th className="py-2.5 pr-4">Ward / Corridor</th>
                <th className="py-2.5 pr-4">Built 19 → 26</th>
                <th className="py-2.5 pr-4">New Urban / Constr.</th>
                <th className="py-2.5 pr-4">Veg Loss</th>
                <th className="py-2.5 pr-4">Est. +{horizonYears}y ({data.summary.target_year})</th>
                <th className="py-2.5 pr-4">Pressure</th>
                <th className="py-2.5">
                  <Wrench className="mr-1 inline h-3.5 w-3.5" />
                  Infrastructure Needs
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {filteredCorridors.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`cursor-pointer transition hover:bg-surface-container-high/50 ${
                    c.id === selectedCorridor.id ? "bg-surface-container-high/70" : ""
                  }`}
                >
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-on-surface">{c.name}</p>
                    <p className="text-[11px] text-secondary">
                      {c.zone} {c.ward_no > 0 ? `· Ward ${c.ward_no}` : ""}
                    </p>
                  </td>
                  <td className="py-3 pr-4 font-mono text-secondary">
                    {c.built_2019_ha.toFixed(0)} → <span className="text-on-surface font-semibold">{c.built_2026_ha.toFixed(0)} ha</span>
                  </td>
                  <td className="py-3 pr-4 font-mono">
                    <span className="text-primary font-semibold">+{c.new_urban_ha.toFixed(1)} ha</span>
                    <span className="block text-[11px] text-warning-orange">{c.active_construction_ha.toFixed(1)} ha constr.</span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-error-vivid">
                    -{c.veg_loss_ha.toFixed(1)} ha ({c.veg_change_pct.toFixed(1)}%)
                  </td>
                  <td className="py-3 pr-4 font-mono text-tertiary font-semibold">
                    +{c.projected_added_ha.toFixed(1)} ha
                    <span className="block text-[10px] font-normal text-secondary">Estimate only</span>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={TIER_TONE[c.growth_tier] ?? "sage"}>
                      {c.growth_pressure_score.toFixed(0)}/100
                    </Badge>
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {c.infrastructure_needs.map((need) => (
                        <span
                          key={need}
                          className="inline-flex items-center gap-1 rounded-md border border-outline-variant/30 bg-surface-container px-2 py-0.5 text-[11px] text-on-surface"
                        >
                          <Route className="h-3 w-3 text-primary" />
                          {need}
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
