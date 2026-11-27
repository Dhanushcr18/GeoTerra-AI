import React, { useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import {
  Compass,
  Crosshair,
  Hospital,
  Layers,
  Navigation,
  X,
  Zap,
} from "lucide-react";
import { api } from "../api/client";
import { BeforeAfterSlider } from "../components/BeforeAfterSlider";
import { AITagBadge, AssumptionTag, Badge, ErrorBox, LoadingSkeleton, Panel, UnvalidatedBadge } from "../components/ui";
import { useGeoTerra } from "../context/GeoTerraContext";
import type { AIResponse, GeoJSONFeatureCollection } from "../types";
import { formatINRCompact, formatIndianNumber } from "../utils/format";

interface SelectedFloodZone {
  id: string;
  name: string;
  area_ha: number;
  confidence: number | null;
  lat: number;
  lon: number;
  priority: "high" | "medium" | "low";
  population_estimate: number | null;
  source: "map" | "settlement";
}

function extractRingCoords(geometry: { type: string; coordinates: unknown }): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const walk = (node: unknown) => {
    if (!Array.isArray(node)) return;
    if (node.length >= 2 && typeof node[0] === "number" && typeof node[1] === "number") {
      pts.push([node[0], node[1]]);
    } else {
      for (const child of node) walk(child);
    }
  };
  walk(geometry.coordinates);
  return pts;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const MapFlyTo: React.FC<{ target: [number, number] | null }> = ({ target }) => {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 14, { duration: 0.85 });
  }, [map, target]);
  return null;
};

export const FloodMonitorPage: React.FC = () => {
  const { data, loading, error, demoMode, updateAiMode, refresh } = useGeoTerra();
  const [floodGeo, setFloodGeo] = useState<GeoJSONFeatureCollection | null>(null);
  const [assetsGeo, setAssetsGeo] = useState<GeoJSONFeatureCollection | null>(null);
  const [aoiGeo, setAoiGeo] = useState<GeoJSONFeatureCollection | null>(null);

  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");
  const [baseLayer, setBaseLayer] = useState<"osm" | "satellite">("osm");
  const [showFlood, setShowFlood] = useState(true);
  const [showPermWater, setShowPermWater] = useState(true);
  const [showRoads, setShowRoads] = useState(true);
  const [showBuildings, setShowBuildings] = useState(true);
  const [showInfra, setShowInfra] = useState(true);
  const [showAoi, setShowAoi] = useState(true);
  const [layersOpen, setLayersOpen] = useState(true);
  const [drawerTab, setDrawerTab] = useState<"affected" | "zone" | "alert">("affected");

  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [selectedZone, setSelectedZone] = useState<SelectedFloodZone | null>(null);
  const [aiAlert, setAiAlert] = useState<AIResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.getGeoLayer("flood_extent"), api.getGeoLayer("assets"), api.getGeoLayer("aoi")])
      .then(([f, a, o]) => {
        setFloodGeo(f);
        setAssetsGeo(a);
        setAoiGeo(o);
      })
      .catch(() => {});
  }, []);

  const enrichedFloodGeo = useMemo<GeoJSONFeatureCollection | null>(() => {
    if (!floodGeo) return null;
    return {
      type: "FeatureCollection",
      features: floodGeo.features.map((feat, idx) => {
        const pts = extractRingCoords(feat.geometry);
        const lon = pts.length ? pts.reduce((s, p) => s + p[0], 0) / pts.length : 77.66;
        const lat = pts.length ? pts.reduce((s, p) => s + p[1], 0) / pts.length : 12.95;
        const areaHa = Number(feat.properties.area_ha ?? 0);
        const prio: "high" | "medium" | "low" = areaHa >= 5 ? "high" : areaHa >= 1.5 ? "medium" : "low";
        return {
          ...feat,
          properties: {
            ...feat.properties,
            id: String(feat.properties.id ?? `FZ-${String(idx + 1).padStart(3, "0")}`),
            zone: String(feat.properties.zone ?? `Flood Zone ${idx + 1}`),
            _lat: lat,
            _lon: lon,
            _priority: prio,
          },
        };
      }),
    };
  }, [floodGeo]);

  const splitAssets = useMemo(() => {
    const perm: GeoJSONFeatureCollection = { type: "FeatureCollection", features: [] };
    const roads: GeoJSONFeatureCollection = { type: "FeatureCollection", features: [] };
    const buildings: GeoJSONFeatureCollection = { type: "FeatureCollection", features: [] };
    const infra: GeoJSONFeatureCollection["features"] = [];
    for (const f of assetsGeo?.features ?? []) {
      const layer = String(f.properties.layer ?? "");
      if (layer === "permanent_water") perm.features.push(f);
      else if (layer === "road") roads.features.push(f);
      else if (layer === "building") buildings.features.push(f);
      else if (layer === "infrastructure") infra.push(f);
    }
    return { permanentWater: perm, roads, buildings, infra };
  }, [assetsGeo]);

  const selectZone = (z: SelectedFloodZone) => {
    setSelectedZone(z);
    setFlyTarget([z.lat, z.lon]);
    setDrawerTab("zone");
  };

  if (loading) return <LoadingSkeleton rows={3} />;
  if (error || !data) return <ErrorBox message={error ?? "No flood data available."} onRetry={refresh} />;

  const { flood, economics, model } = data.results;
  const estLoss = formatINRCompact(flood.cropland_affected_ha * economics.loss_per_ha_inr);
  const nearestInfra = selectedZone
    ? [...flood.critical_infrastructure_affected]
        .map((item) => ({
          ...item,
          distKm: haversineKm(selectedZone.lat, selectedZone.lon, item.lat, item.lon),
        }))
        .sort((a, b) => a.distKm - b.distKm)
        .slice(0, 3)
    : [];

  const handleGenerateAlert = async () => {
    setAiLoading(true);
    try {
      const resp = await api.postAlert("KSDMA / BBMP", demoMode);
      setAiAlert(resp);
      updateAiMode(resp.ai_mode);
      setDrawerTab("alert");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Slim Top 4-Metric Summary Bar (Stitch v2) */}
      <div className="flex flex-col justify-between gap-4 rounded-xl bg-surface-container-low/95 p-4 shadow-md lg:flex-row lg:items-center">
        <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-secondary">
              Flooded Extent
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-bold text-flood-magenta tabular-nums">
                {formatIndianNumber(flood.flooded_area_ha, 2)} ha
              </span>
              <span className="font-mono text-[10px] text-secondary">
                {enrichedFloodGeo?.features.length ?? flood.settlements_affected.length} zones
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-secondary">
              Cropland Impact
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-bold text-primary-container tabular-nums">
                {formatIndianNumber(flood.cropland_affected_ha, 2)} ha
              </span>
              <span className="font-mono text-[10px] text-primary">{estLoss.main}</span>
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-secondary">
              Built-Up &amp; Roads
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-bold text-error-vivid tabular-nums">
                {formatIndianNumber(flood.built_up_affected_ha, 2)} ha
              </span>
              <span className="font-mono text-[10px] text-secondary">
                {formatIndianNumber(flood.roads_affected_km, 2)} km roads
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-secondary">
              Critical Infra
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-bold text-tertiary tabular-nums">
                {flood.critical_infrastructure_affected.length}
              </span>
              <span className="font-mono text-[10px] text-secondary">facilities flagged</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!flood.validated && <UnvalidatedBadge />}
        </div>
      </div>

      {/* Main 12-Col Tactical Map + Right Drawer */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Left 8 Cols: Full-Height Interactive Map + SAR Before/After Swipe */}
        <div className="flex flex-col gap-4 xl:col-span-8">
          <div className="relative overflow-hidden rounded-xl bg-surface-container-lowest shadow-emerald">
            {/* Floating Top Controls */}
            <div className="pointer-events-none relative z-10 flex flex-wrap items-start justify-between gap-2 bg-surface-container-low/80 p-3 backdrop-blur-md">
              {/* Layer Control Pill */}
              <div className="pointer-events-auto rounded-xl bg-surface-container/95 p-2 shadow-lg">
                <button
                  type="button"
                  onClick={() => setLayersOpen(!layersOpen)}
                  className="flex w-full items-center justify-between gap-3 px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase text-secondary hover:text-on-surface"
                >
                  <span className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-primary-container" aria-hidden="true" />
                    Map Overlays
                  </span>
                  <span className="text-[10px] text-primary">{layersOpen ? "Hide" : "Show"}</span>
                </button>
                {layersOpen && viewMode === "2d" && (
                  <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {[
                      { label: "Flood Extent", state: showFlood, set: setShowFlood, dot: "bg-flood-magenta" },
                      { label: "Permanent Water", state: showPermWater, set: setShowPermWater, dot: "bg-flood-violet" },
                      { label: "Roads", state: showRoads, set: setShowRoads, dot: "bg-error-vivid" },
                      { label: "Buildings", state: showBuildings, set: setShowBuildings, dot: "bg-primary-container" },
                      { label: "Critical Infra", state: showInfra, set: setShowInfra, dot: "bg-tertiary" },
                      { label: "AOI Boundary", state: showAoi, set: setShowAoi, dot: "bg-primary" },
                    ].map(({ label, state, set, dot }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => set(!state)}
                        aria-pressed={state}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-[11px] transition ${
                          state
                            ? "bg-surface-container-high text-on-surface ring-1 ring-primary-container/40"
                            : "bg-surface-container-low text-secondary/70"
                        }`}
                      >
                        <span className={`h-2.5 w-2.5 rounded-sm ${dot}`} />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Coordinates + 2D / 3D + Base Map */}
              <div className="pointer-events-auto flex flex-wrap items-center gap-2">
                {selectedZone && (
                  <div className="hidden items-center gap-1.5 rounded-xl bg-surface-container/95 px-3 py-1.5 font-mono text-[11px] text-on-surface shadow md:flex">
                    <Navigation className="h-3.5 w-3.5 text-tertiary" aria-hidden="true" />
                    <span>
                      {selectedZone.lat.toFixed(4)}°N, {selectedZone.lon.toFixed(4)}°E
                    </span>
                  </div>
                )}

                {viewMode === "2d" && (
                  <div className="flex rounded-xl bg-surface-container/95 p-1 font-mono text-xs shadow">
                    <button
                      type="button"
                      onClick={() => setBaseLayer("osm")}
                      className={`rounded-lg px-2.5 py-1 ${
                        baseLayer === "osm" ? "bg-surface-bright font-semibold text-on-surface" : "text-secondary"
                      }`}
                    >
                      Street
                    </button>
                    <button
                      type="button"
                      onClick={() => setBaseLayer("satellite")}
                      className={`rounded-lg px-2.5 py-1 ${
                        baseLayer === "satellite"
                          ? "bg-surface-bright font-semibold text-on-surface"
                          : "text-secondary"
                      }`}
                    >
                      Satellite
                    </button>
                  </div>
                )}

                <div className="flex rounded-xl bg-surface-container-high/95 p-1 font-mono text-xs shadow">
                  <button
                    type="button"
                    onClick={() => setViewMode("2d")}
                    className={`rounded-lg px-3 py-1 font-bold transition ${
                      viewMode === "2d" ? "bg-primary-container text-on-primary-container" : "text-secondary"
                    }`}
                  >
                    2D Map
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("3d")}
                    className={`rounded-lg px-3 py-1 font-bold transition ${
                      viewMode === "3d" ? "bg-primary-container text-on-primary-container" : "text-secondary"
                    }`}
                  >
                    3D DEM
                  </button>
                </div>
              </div>
            </div>

            {viewMode === "2d" ? (
              <div className="h-[500px] w-full xl:h-[560px]">
                <MapContainer center={[12.95, 77.66]} zoom={11} className="h-full w-full">
                  <MapFlyTo target={flyTarget} />
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
                  {showAoi && aoiGeo && (
                    <GeoJSON
                      data={aoiGeo as never}
                      style={{ color: "#ffe1a7", weight: 1.5, dashArray: "6 5", fillOpacity: 0 }}
                    />
                  )}
                  {showFlood && enrichedFloodGeo && (
                    <GeoJSON
                      data={enrichedFloodGeo as never}
                      style={{ color: "#d946ef", weight: 2, fillColor: "#d946ef", fillOpacity: 0.5 }}
                      onEachFeature={(feat, layer) => {
                        const p = feat.properties ?? {};
                        const areaHa = Number(p.area_ha ?? 0);
                        const conf = typeof p.mean_confidence === "number" ? p.mean_confidence : null;
                        const lat = Number(p._lat ?? 12.95);
                        const lon = Number(p._lon ?? 77.66);
                        const prio = String(p._priority ?? "medium") as "high" | "medium" | "low";
                        const id = String(p.id ?? "FZ");
                        const name = String(p.zone ?? "Flood Zone");

                        layer.bindPopup(
                          `<strong>${name} (${id})</strong><br/>Area: ${areaHa.toFixed(2)} ha${
                            conf !== null ? ` · Conf: ${(conf * 100).toFixed(0)}%` : ""
                          }<br/><em>Model prediction (unvalidated)</em>`
                        );

                        layer.on("click", () => {
                          selectZone({
                            id,
                            name,
                            area_ha: areaHa,
                            confidence: conf,
                            lat,
                            lon,
                            priority: prio,
                            population_estimate: null,
                            source: "map",
                          });
                        });
                      }}
                    />
                  )}
                  {selectedZone && (
                    <CircleMarker
                      center={[selectedZone.lat, selectedZone.lon]}
                      radius={14}
                      pathOptions={{ color: "#fbbf24", weight: 3, fillColor: "#fbbf24", fillOpacity: 0.25 }}
                    />
                  )}
                  {showPermWater && splitAssets.permanentWater.features.length > 0 && (
                    <GeoJSON
                      data={splitAssets.permanentWater as never}
                      style={{ color: "#9d5cb5", weight: 1.5, fillColor: "#9d5cb5", fillOpacity: 0.55 }}
                    />
                  )}
                  {showRoads && splitAssets.roads.features.length > 0 && (
                    <GeoJSON data={splitAssets.roads as never} style={{ color: "#f43f5e", weight: 3.5 }} />
                  )}
                  {showBuildings && splitAssets.buildings.features.length > 0 && (
                    <GeoJSON
                      data={splitAssets.buildings as never}
                      style={{ color: "#fbbf24", weight: 1.5, fillColor: "#fbbf24", fillOpacity: 0.45 }}
                    />
                  )}
                  {showInfra &&
                    splitAssets.infra.map((feat, idx) => {
                      const coords = feat.geometry.coordinates as [number, number];
                      const t = String(feat.properties.type ?? "facility");
                      const color = t === "hospital" ? "#f43f5e" : t === "substation" ? "#fbbf24" : "#72ff9e";
                      return (
                        <CircleMarker
                          key={idx}
                          center={[coords[1], coords[0]]}
                          radius={7}
                          pathOptions={{ color: "#f5f1e6", weight: 1.5, fillColor: color, fillOpacity: 0.95 }}
                        >
                          <Popup>
                            <strong>{String(feat.properties.name ?? "Facility")}</strong>
                            <br />
                            Type: {t}
                          </Popup>
                        </CircleMarker>
                      );
                    })}
                </MapContainer>
              </div>
            ) : (
              <div className="relative h-[500px] bg-gradient-to-b from-surface-container-high via-surface-container to-surface-container-low xl:h-[560px]">
                <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 1000 460">
                  <defs>
                    <pattern
                      id="eoTopoGrid"
                      width="40"
                      height="40"
                      patternTransform="rotate(24 0 0) skewX(-20)"
                      patternUnits="userSpaceOnUse"
                    >
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#a6d0bd" strokeOpacity="0.2" strokeWidth="0.7" />
                    </pattern>
                    <linearGradient id="eoFloodPlane" x1="0%" x2="100%" y1="20%" y2="80%">
                      <stop offset="0%" stopColor="#fbaeff" stopOpacity="0.6" />
                      <stop offset="60%" stopColor="#d946ef" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#9100a6" stopOpacity="0.65" />
                    </linearGradient>
                  </defs>
                  <rect width="1000" height="460" fill="url(#eoTopoGrid)" />
                  <g fill="none" stroke="#ffe1a7" strokeOpacity="0.35" strokeWidth="1.1">
                    <path d="M-20,110 Q200,70 440,100 T960,70 L1020,80" />
                    <path d="M-20,165 Q240,115 500,155 T980,120 L1020,130" />
                    <path d="M-20,235 Q280,185 550,225 T1000,190 L1020,200" />
                    <path d="M-20,315 Q320,265 610,305 T1000,275 L1020,285" />
                  </g>
                  <path
                    d="M-40,190 C150,155 280,255 480,220 C650,190 790,135 950,165 L1040,180 L1040,320 C850,295 710,360 520,340 C310,320 170,275 -40,300 Z"
                    fill="url(#eoFloodPlane)"
                    stroke="#ffd9fd"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M80,130 L290,220 L520,210 L760,320"
                    fill="none"
                    stroke="#f43f5e"
                    strokeDasharray="10 4"
                    strokeWidth="3.5"
                  />
                </svg>
                <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface/90 px-3 py-2 font-mono text-[11px] text-secondary backdrop-blur-md">
                  <span className="flex items-center gap-1.5">
                    <Compass className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    3D DEM Terrain Wireframe (Elevation Model Approximation)
                  </span>
                  <span className="text-primary">Switch to 2D Map for interactive GeoJSON inspection</span>
                </div>
              </div>
            )}
          </div>

          {/* Zoomable Before/After SAR Swipe Card */}
          <Panel
            eyebrow="Satellite Imagery"
            title="Sentinel-1 SAR Before / After Swipe"
            subtitle={
              selectedZone
                ? `Zoomed to ${selectedZone.name} (${selectedZone.lat.toFixed(4)}°N, ${selectedZone.lon.toFixed(4)}°E)`
                : `Pre-Flood (${flood.date_before}) vs Post-Flood + U-Net (${flood.date_after})`
            }
            right={
              selectedZone ? (
                <button
                  type="button"
                  onClick={() => setSelectedZone(null)}
                  className="rounded-lg bg-surface-container-high px-2.5 py-1 font-mono text-[11px] font-semibold text-primary hover:bg-surface-bright"
                >
                  Reset to Full AOI
                </button>
              ) : undefined
            }
          >
            <BeforeAfterSlider
              beforeSrc={
                selectedZone
                  ? `/api/images/crop?name=s1_before.png&lat=${selectedZone.lat}&lon=${selectedZone.lon}&kind=flood&zoom=3.2`
                  : "/api/images/s1_before.png"
              }
              afterSrc={
                selectedZone
                  ? `/api/images/crop?name=flood_overlay.png&lat=${selectedZone.lat}&lon=${selectedZone.lon}&kind=flood&zoom=3.2`
                  : "/api/images/flood_overlay.png"
              }
              beforeAlt="Sentinel-1 dry reference SAR tile"
              afterAlt="Sentinel-1 flood prediction overlay tile"
              beforeLabel={`Pre-Flood (${flood.date_before})`}
              afterLabel={
                selectedZone ? `${selectedZone.id} Post-Flood (${flood.date_after})` : `Post-Flood + U-Net (${flood.date_after})`
              }
            />
          </Panel>
        </div>

        {/* Right 4 Cols: Tactical Sector Drawer (Stitch v2 Tabbed Drawer) */}
        <aside className="flex flex-col overflow-hidden rounded-xl bg-surface-container/95 shadow-emerald backdrop-blur-2xl xl:col-span-4">
          <div className="flex items-center justify-between bg-surface-container-high/70 p-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-flood-magenta" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-base font-semibold text-on-surface">{flood.aoi_name}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-secondary">
                  Sector Operational Telemetry
                </span>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2 py-0.5 font-mono text-[10px] text-tertiary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tertiary" />
              SAR ACTIVE
            </span>
          </div>

          {/* Drawer Tabs */}
          <div className="flex gap-1 bg-surface-container-low px-3 pt-2">
            {[
              { id: "affected" as const, label: `Affected (${flood.settlements_affected.length})` },
              { id: "zone" as const, label: "Zone Details" },
              { id: "alert" as const, label: "District Alert" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setDrawerTab(t.id)}
                className={`flex-1 rounded-t-lg py-2 font-mono text-xs transition-colors ${
                  drawerTab === t.id
                    ? "bg-surface-container font-semibold text-primary-container"
                    : "text-secondary hover:text-on-surface"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
            {drawerTab === "affected" && (
              <>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary">
                      Priority Settlements (Click to Zoom)
                    </span>
                    <span className="font-mono text-[11px] text-tertiary">
                      {enrichedFloodGeo?.features.length ?? flood.settlements_affected.length} zones
                    </span>
                  </div>
                  <div className="space-y-2">
                    {flood.settlements_affected.map((s, idx) => {
                      const active = selectedZone?.name === s.name;
                      return (
                        <button
                          key={s.name}
                          type="button"
                          onClick={() =>
                            selectZone({
                              id: `FZ-${String(idx + 1).padStart(3, "0")}`,
                              name: s.name,
                              area_ha: Number((flood.flooded_area_ha / Math.max(flood.settlements_affected.length, 1)).toFixed(2)),
                              confidence: null,
                              lat: s.lat,
                              lon: s.lon,
                              priority: s.priority,
                              population_estimate: s.population_estimate,
                              source: "settlement",
                            })
                          }
                          className={`flex w-full items-center justify-between rounded-xl p-3 text-left transition-all ${
                            active
                              ? "bg-surface-container-highest ring-1 ring-primary-container/60"
                              : "bg-surface-container-low/80 hover:bg-surface-container-high"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold text-on-surface">
                                {idx + 1}. {s.name}
                              </span>
                              <Badge tone={s.priority === "high" ? "coral" : s.priority === "medium" ? "gold" : "mint"}>
                                {s.priority.toUpperCase()}
                              </Badge>
                            </div>
                            <div className="mt-0.5 font-mono text-[11px] text-secondary">
                              {s.lat.toFixed(4)}°N, {s.lon.toFixed(4)}°E · Pop:{" "}
                              {s.population_estimate !== null ? formatIndianNumber(s.population_estimate, 0) : "N/A"}
                            </div>
                          </div>
                          <Crosshair className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary">
                    Critical Infrastructure Within Flood Extent
                  </span>
                  <div className="mt-2 space-y-2">
                    {flood.critical_infrastructure_affected.map((inf, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setFlyTarget([inf.lat, inf.lon])}
                        className="flex w-full items-center justify-between rounded-xl bg-surface-container-low p-3 text-left hover:bg-surface-container-high"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-mono text-xs font-bold text-on-surface">{inf.name}</div>
                          <div className="font-mono text-[10px] uppercase text-secondary">{inf.type}</div>
                        </div>
                        <Hospital className="h-4 w-4 shrink-0 text-error-vivid" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl bg-surface-container-low p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-secondary">
                      Sen1Floods11 Benchmark (U-Net)
                    </span>
                    <span className="font-mono text-xs font-bold text-tertiary">
                      Test IoU {model.metrics.test.iou.toFixed(2)} · F1 {model.metrics.test.f1.toFixed(2)}
                    </span>
                  </div>
                </div>
              </>
            )}

            {drawerTab === "zone" && (
              <div className="space-y-4">
                {!selectedZone ? (
                  <p className="rounded-xl border border-dashed border-outline-variant/40 p-4 text-xs text-secondary">
                    Click any flood polygon on the 2D map or any settlement in the Affected tab to inspect full telemetry
                    and zoom the SAR Before/After comparison.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono text-[10px] uppercase text-secondary">Selected Flood Zone</span>
                        <h3 className="text-lg font-bold text-primary">
                          {selectedZone.name} ({selectedZone.id})
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedZone(null)}
                        className="rounded-lg bg-surface-container-high p-1.5 text-secondary hover:text-on-surface"
                        aria-label="Clear selection"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge
                        tone={
                          selectedZone.priority === "high"
                            ? "coral"
                            : selectedZone.priority === "medium"
                              ? "gold"
                              : "mint"
                        }
                      >
                        {selectedZone.priority.toUpperCase()} PRIORITY
                      </Badge>
                      <UnvalidatedBadge />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-xl bg-surface-container-high p-3">
                        <div className="font-mono text-[10px] uppercase text-secondary">Zone Flood Area</div>
                        <div className="mt-1 font-mono text-xl font-bold text-flood-magenta tabular-nums">
                          {formatIndianNumber(selectedZone.area_ha, 2)} ha
                        </div>
                      </div>
                      <div className="rounded-xl bg-surface-container-high p-3">
                        <div className="font-mono text-[10px] uppercase text-secondary">Model Confidence</div>
                        <div className="mt-1 font-mono text-xl font-bold text-tertiary tabular-nums">
                          {selectedZone.confidence !== null ? `${(selectedZone.confidence * 100).toFixed(0)}%` : "N/A"}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl bg-surface-container-low p-3 font-mono text-xs space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-secondary">Coordinates:</span>
                        <span className="text-on-surface">
                          {selectedZone.lat.toFixed(4)}°N, {selectedZone.lon.toFixed(4)}°E
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-secondary">Estimated Pop:</span>
                        <span className="text-on-surface">
                          {selectedZone.population_estimate !== null
                            ? formatIndianNumber(selectedZone.population_estimate, 0)
                            : "Area-level only"}
                        </span>
                      </div>
                    </div>

                    {nearestInfra.length > 0 && (
                      <div>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-secondary">
                          Nearest Critical Facilities
                        </span>
                        <div className="mt-2 space-y-1.5">
                          {nearestInfra.map((inf, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between rounded-lg bg-surface-container-low px-3 py-2 font-mono text-xs"
                            >
                              <span className="truncate text-on-surface">{inf.name}</span>
                              <span className="shrink-0 text-primary">{inf.distKm.toFixed(2)} km</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {drawerTab === "alert" && (
              <div className="space-y-4">
                <div className="rounded-xl bg-surface-container-low p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-primary">AI Authority Flood Brief</span>
                    <AITagBadge />
                  </div>
                  <p className="mt-1.5 text-xs text-secondary">
                    Generates an actionable English &amp; Kannada field-dispatch summary grounded in real GeoJSON
                    telemetry via NVIDIA NIM.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateAlert}
                  disabled={aiLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-container px-4 py-3 font-mono text-xs font-bold text-on-primary-container shadow-lg hover:bg-primary-fixed-dim disabled:opacity-60"
                >
                  <Zap className="h-4 w-4" aria-hidden="true" />
                  <span>{aiLoading ? "Generating NVIDIA NIM Brief..." : "Generate AI Flood Alert"}</span>
                </button>

                {aiAlert && (
                  <div className="space-y-2 rounded-xl bg-surface-container-high p-4 text-xs">
                    <div className="flex items-center justify-between font-mono text-[10px] text-tertiary">
                      <span>SOURCE: {aiAlert.detail_source.toUpperCase()}</span>
                      <span>MODE: {aiAlert.ai_mode.toUpperCase()}</span>
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed text-on-surface">{aiAlert.text}</p>
                  </div>
                )}

                <div className="flex items-center justify-between rounded-xl bg-surface-container-low p-3 text-xs">
                  <span className="text-secondary">Cropland Loss Estimate</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-primary">{estLoss.main}</span>
                    <AssumptionTag />
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
