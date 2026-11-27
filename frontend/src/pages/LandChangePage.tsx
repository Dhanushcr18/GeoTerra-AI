import React, { useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import { ArrowUpDown, ClipboardCheck, Cpu, Layers, Radar, ShieldAlert, Trees } from "lucide-react";
import { api } from "../api/client";
import { BeforeAfterSlider } from "../components/BeforeAfterSlider";
import { AITagBadge, Badge, ErrorBox, LoadingSkeleton, Panel } from "../components/ui";
import { useGeoTerra } from "../context/GeoTerraContext";
import type { AIResponse, GeoJSONFeatureCollection } from "../types";
import { formatIndianNumber } from "../utils/format";

type SortKey = "area_ha" | "ndvi_drop" | "confidence" | "near_river";

function getCentroid(geometry: { type: string; coordinates: unknown }): [number, number] | null {
  const pts: Array<[number, number]> = [];
  const walk = (node: unknown) => {
    if (!Array.isArray(node)) return;
    if (node.length >= 2 && typeof node[0] === "number" && typeof node[1] === "number") {
      pts.push([node[0], node[1]]);
    } else {
      for (const c of node) walk(c);
    }
  };
  walk(geometry.coordinates);
  if (!pts.length) return null;
  const lon = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const lat = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return [lat, lon];
}

const FlyToChange: React.FC<{ target: [number, number] | null }> = ({ target }) => {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 14, { duration: 0.8 });
  }, [map, target]);
  return null;
};

export const LandChangePage: React.FC = () => {
  const { data, loading, error, demoMode, updateAiMode, refresh } = useGeoTerra();
  const [changeGeo, setChangeGeo] = useState<GeoJSONFeatureCollection | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("confidence");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedPoly, setSelectedPoly] = useState<string | undefined>(undefined);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [vlmResult, setVlmResult] = useState<AIResponse | null>(null);
  const [vlmLoading, setVlmLoading] = useState(false);

  useEffect(() => {
    api.getGeoLayer("change").then(setChangeGeo).catch(() => {});
  }, []);

  const polyCentroids = useMemo(() => {
    const map = new Map<string, [number, number]>();
    if (!changeGeo) return map;
    for (const f of changeGeo.features) {
      const id = String(f.properties.id ?? "");
      const c = getCentroid(f.geometry);
      if (id && c) map.set(id, c);
    }
    return map;
  }, [changeGeo]);

  const sortedPolygons = useMemo(() => {
    if (!data) return [];
    return [...data.results.change.polygons].sort((a, b) => {
      const av = Number(a[sortKey]);
      const bv = Number(b[sortKey]);
      return sortAsc ? av - bv : bv - av;
    });
  }, [data, sortKey, sortAsc]);

  if (loading) return <LoadingSkeleton rows={3} />;
  if (error || !data) return <ErrorBox message={error ?? "No land change data."} onRetry={refresh} />;

  const { change } = data.results;
  const activePoly =
    change.polygons.find((p) => p.id === selectedPoly) ??
    [...change.polygons].sort((a, b) => b.confidence - a.confidence)[0];
  const explicitCenter = selectedPoly ? polyCentroids.get(selectedPoly) ?? null : null;
  const activeCenter = activePoly ? polyCentroids.get(activePoly.id) ?? null : null;

  const beforeImgSrc = explicitCenter
    ? `/api/images/crop?name=s2_before.png&lat=${explicitCenter[0]}&lon=${explicitCenter[1]}&kind=change&zoom=3.4`
    : "/api/images/s2_before.png";
  const afterImgSrc = explicitCenter
    ? `/api/images/crop?name=change_overlay.png&lat=${explicitCenter[0]}&lon=${explicitCenter[1]}&kind=change&zoom=3.4`
    : "/api/images/change_overlay.png";

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const handleSelectPolygon = (id: string) => {
    setSelectedPoly(id);
    const c = polyCentroids.get(id);
    if (c) setFlyTarget(c);
  };

  const handleDescribe = async () => {
    setVlmLoading(true);
    try {
      const resp = await api.postDescribeSite(demoMode, activePoly?.id);
      setVlmResult(resp);
      updateAiMode(resp.ai_mode);
    } finally {
      setVlmLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Top Context & Mandatory Regulatory Advisory */}
      <div className="flex flex-col justify-between gap-3 rounded-xl bg-surface-container-low/90 p-4 shadow-md lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-2.5 font-mono text-xs">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary-container" />
          <span className="font-semibold text-on-surface">{change.site_name}</span>
          <span className="text-outline">/</span>
          <span className="text-primary">
            Sentinel-2 L2A ({change.dates.before} → {change.dates.after})
          </span>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-full bg-surface-container-highest px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-primary lg:self-auto">
          <ShieldAlert className="h-4 w-4 text-primary-container" aria-hidden="true" />
          Potential suspicious activity: requires official verification
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-surface-container/90 p-5 shadow-md backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary">
              Total Anomalous Clearing
            </span>
            <Layers className="h-4 w-4 text-primary-container" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-[32px] font-bold leading-none text-primary tabular-nums">
              {formatIndianNumber(change.changed_area_ha, 2)}
            </span>
            <span className="font-mono text-xs text-secondary">ha</span>
          </div>
        </div>

        <div className="rounded-xl bg-surface-container/90 p-5 shadow-md backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary">
              Flagged Polygons
            </span>
            <Radar className="h-4 w-4 text-tertiary" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-[32px] font-bold leading-none text-on-surface tabular-nums">
              {change.polygons.length}
            </span>
            <span className="font-mono text-xs text-secondary">sectors</span>
          </div>
        </div>

        <div className="rounded-xl bg-surface-container/90 p-5 shadow-md backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary">
              Vegetation Loss
            </span>
            <Trees className="h-4 w-4 text-error-vivid" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-[32px] font-bold leading-none text-primary tabular-nums">
              {formatIndianNumber(change.vegetation_loss_ha, 2)}
            </span>
            <span className="font-mono text-xs text-secondary">ha NDVI drop</span>
          </div>
        </div>

        <div className="rounded-xl bg-surface-container/90 p-5 shadow-md backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary">
              Bare Soil Increase
            </span>
            <ClipboardCheck className="h-4 w-4 text-tertiary" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-[32px] font-bold leading-none text-tertiary tabular-nums">
              {formatIndianNumber(change.bare_soil_increase_ha, 2)}
            </span>
            <span className="font-mono text-xs text-secondary">ha</span>
          </div>
        </div>
      </section>

      {/* Main 12-Col Layout: Map + Zoomed Swipe (7 cols) | Ranked Polygons + Selected Details + NIM VLM (5 cols) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-7">
          <Panel
            eyebrow="Temporal Deficit Mapping"
            title="Flagged Polygons by Confidence"
            subtitle="Click any polygon on the map to zoom the Sentinel-2 Before/After comparison and inspect details."
          >
            <div className="h-[380px] overflow-hidden rounded-xl border border-outline-variant/25">
              <MapContainer center={[13.08, 77.6]} zoom={11} className="h-full w-full">
                <FlyToChange target={flyTarget} />
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {changeGeo && (
                  <GeoJSON
                    data={changeGeo as never}
                    style={(feat) => {
                      const isSel = String(feat?.properties?.id ?? "") === selectedPoly;
                      return {
                        color: isSel ? "#72ff9e" : "#fbbf24",
                        weight: isSel ? 3.5 : 2,
                        fillColor: isSel ? "#72ff9e" : "#fbbf24",
                        fillOpacity: isSel ? 0.5 : 0.35,
                      };
                    }}
                    onEachFeature={(feat, layer) => {
                      const p = feat.properties ?? {};
                      const id = String(p.id ?? "");
                      layer.bindPopup(
                        `<strong>${id}</strong><br/>Area: ${Number(p.area_ha ?? 0).toFixed(2)} ha · NDVI drop: ${Number(
                          p.ndvi_drop ?? 0
                        ).toFixed(2)}`
                      );
                      layer.on("click", () => handleSelectPolygon(id));
                    }}
                  />
                )}
                {explicitCenter && (
                  <CircleMarker
                    center={explicitCenter}
                    radius={12}
                    pathOptions={{ color: "#72ff9e", weight: 3, fillColor: "#72ff9e", fillOpacity: 0.25 }}
                  />
                )}
              </MapContainer>
            </div>
          </Panel>

          <Panel
            eyebrow="Optical Change Verification"
            title="Sentinel-2 Before / After Swipe"
            subtitle={
              explicitCenter
                ? `Zoomed to ${activePoly?.id} (${explicitCenter[0].toFixed(4)}°N, ${explicitCenter[1].toFixed(4)}°E)`
                : "NDVI drop + Bare Soil Index overlay"
            }
            right={
              selectedPoly ? (
                <button
                  type="button"
                  onClick={() => setSelectedPoly(undefined)}
                  className="rounded-lg bg-surface-container-high px-2.5 py-1 font-mono text-[11px] font-semibold text-primary hover:bg-surface-bright"
                >
                  Full Corridor
                </button>
              ) : undefined
            }
          >
            <BeforeAfterSlider
              beforeSrc={beforeImgSrc}
              afterSrc={afterImgSrc}
              beforeAlt="Sentinel-2 before optical tile"
              afterAlt="Sentinel-2 after with land-change overlay"
              beforeLabel={`Before (${change.dates.before})`}
              afterLabel={selectedPoly ? `${selectedPoly} After (${change.dates.after})` : `After + Change (${change.dates.after})`}
            />
          </Panel>
        </div>

        {/* Right 5 Cols: Ranked Sectors + Selected Polygon Details + NIM VLM */}
        <div className="flex flex-col gap-5 lg:col-span-5">
          <Panel
            eyebrow="Selected Sector & Verification"
            title={activePoly ? `Site ${activePoly.id}` : "Select a polygon"}
            right={<AITagBadge />}
          >
            {activePoly && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="rounded-xl bg-surface-container-high p-3">
                    <div className="font-mono text-[10px] uppercase text-secondary">Area</div>
                    <div className="mt-0.5 font-mono text-lg font-bold text-primary tabular-nums">
                      {activePoly.area_ha.toFixed(2)} ha
                    </div>
                  </div>
                  <div className="rounded-xl bg-surface-container-high p-3">
                    <div className="font-mono text-[10px] uppercase text-secondary">NDVI Drop</div>
                    <div className="mt-0.5 font-mono text-lg font-bold text-error-vivid tabular-nums">
                      -{activePoly.ndvi_drop.toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-surface-container-high p-3">
                    <div className="font-mono text-[10px] uppercase text-secondary">Confidence</div>
                    <div className="mt-0.5 font-mono text-lg font-bold text-tertiary tabular-nums">
                      {(activePoly.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>

                {activeCenter && (
                  <div className="flex items-center justify-between rounded-xl bg-surface-container-low px-3 py-2 font-mono text-xs">
                    <span className="text-secondary">Centroid:</span>
                    <span className="text-on-surface">
                      {activeCenter[0].toFixed(4)}°N, {activeCenter[1].toFixed(4)}°E
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleDescribe}
                  disabled={vlmLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-container px-4 py-3 font-mono text-xs font-bold text-on-primary-container shadow-md hover:bg-primary-fixed-dim disabled:opacity-60"
                >
                  <Cpu className="h-4 w-4" aria-hidden="true" />
                  <span>{vlmLoading ? "Analyzing with NVIDIA NIM VLM..." : "Describe with AI (NVIDIA NIM VLM)"}</span>
                </button>

                {vlmResult && (
                  <div className="space-y-2 rounded-xl bg-surface-container-low p-3.5 text-xs">
                    <div className="flex items-center justify-between font-mono text-[10px] text-tertiary">
                      <span>SOURCE: {vlmResult.detail_source.toUpperCase()}</span>
                      <span>{vlmResult.ai_tag}</span>
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed text-on-surface">{vlmResult.text}</p>
                  </div>
                )}
              </div>
            )}
          </Panel>

          <Panel
            eyebrow="Priority Queue"
            title={`Ranked Clearing Sectors (${sortedPolygons.length})`}
            subtitle="Click any row to highlight polygon & zoom Before/After imagery"
          >
            <div className="mb-3 flex flex-wrap gap-1.5">
              {(
                [
                  ["confidence", "Confidence"],
                  ["area_ha", "Area (ha)"],
                  ["ndvi_drop", "NDVI Drop"],
                  ["near_river", "Near River"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleSort(key)}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-mono text-[11px] ${
                    sortKey === key
                      ? "bg-primary-container font-bold text-on-primary-container"
                      : "bg-surface-container-high text-secondary hover:text-on-surface"
                  }`}
                >
                  <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>

            <div className="custom-scrollbar max-h-[340px] space-y-2 overflow-y-auto pr-1">
              {sortedPolygons.map((poly) => {
                const isActive = activePoly?.id === poly.id;
                return (
                  <button
                    key={poly.id}
                    type="button"
                    onClick={() => handleSelectPolygon(poly.id)}
                    className={`flex w-full flex-col gap-1.5 rounded-xl p-3 text-left transition-all ${
                      isActive
                        ? "bg-surface-container-highest ring-1 ring-primary-container/60"
                        : "bg-surface-container-low hover:bg-surface-container-high"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-on-surface">{poly.id}</span>
                      <Badge tone={poly.near_river ? "coral" : "gold"}>
                        {poly.near_river ? "Near River" : "Inland"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                      <span className="text-primary">{poly.area_ha.toFixed(2)} ha</span>
                      <span className="text-error-vivid">-{poly.ndvi_drop.toFixed(2)} NDVI</span>
                      <span className="text-right text-tertiary">{(poly.confidence * 100).toFixed(0)}% conf</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
};
