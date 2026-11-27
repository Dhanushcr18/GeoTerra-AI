import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GeoJSON, MapContainer, TileLayer } from "react-leaflet";
import {
  ArrowRight,
  Bell,
  Droplets,
  IndianRupee,
  Layers,
  Radar,
  Satellite,
  ShieldAlert,
  Sprout,
} from "lucide-react";
import { api } from "../api/client";
import { AssumptionTag, Badge, ErrorBox, LoadingSkeleton, Panel, UnvalidatedBadge } from "../components/ui";
import { useGeoTerra } from "../context/GeoTerraContext";
import type { GeoJSONFeatureCollection, SceneItem } from "../types";
import { formatINRCompact, formatIndianNumber } from "../utils/format";

export const OverviewPage: React.FC = () => {
  const { data, loading, error, customLossPerHa, setCustomLossPerHa, refresh } = useGeoTerra();
  const [floodGeo, setFloodGeo] = useState<GeoJSONFeatureCollection | null>(null);
  const [changeGeo, setChangeGeo] = useState<GeoJSONFeatureCollection | null>(null);
  const [aoiGeo, setAoiGeo] = useState<GeoJSONFeatureCollection | null>(null);
  const [scenes, setScenes] = useState<SceneItem[]>([]);

  useEffect(() => {
    Promise.all([
      api.getGeoLayer("flood_extent"),
      api.getGeoLayer("change"),
      api.getGeoLayer("aoi"),
      api.getScenes(),
    ])
      .then(([f, c, a, s]) => {
        setFloodGeo(f);
        setChangeGeo(c);
        setAoiGeo(a);
        setScenes(s);
      })
      .catch(() => {});
  }, []);

  if (loading) return <LoadingSkeleton rows={3} />;
  if (error || !data) return <ErrorBox message={error ?? "No data available."} onRetry={refresh} />;

  const { results } = data;
  const activeLossPerHa = customLossPerHa ?? results.economics.loss_per_ha_inr;
  const inr = formatINRCompact(results.flood.cropland_affected_ha * activeLossPerHa);

  return (
    <div className="flex flex-col gap-6">
      {/* BLOCK 1: HERO SECTION WITH ROTATING RADAR SWEEP */}
      <section className="relative flex flex-col justify-between gap-6 overflow-hidden rounded-xl bg-surface-container-low/95 p-6 shadow-emerald lg:flex-row lg:items-center lg:p-8">
        <div
          className="pointer-events-none absolute right-0 top-0 h-full w-1/2 opacity-20"
          style={{
            background: "radial-gradient(circle at 75% 40%, rgba(114, 255, 158, 0.28) 0%, transparent 65%)",
          }}
        />

        <div className="relative z-10 flex flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-high px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-tertiary">
              <span className="h-2 w-2 animate-pulse rounded-full bg-tertiary-container" />
              SENTINEL-1A/2A (SAR + OPTICAL)
            </span>
            {!results.flood.validated && <UnvalidatedBadge />}
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-primary sm:text-4xl">
            Satellites see it. AI measures it. Authorities act on it.
          </h1>
          <p className="max-w-2xl text-sm text-secondary sm:text-base">
            Multi-spectral SAR telemetry and neural flood segmentation for{" "}
            <strong className="text-on-surface">{results.flood.aoi_name}</strong> — quantifying flooded hectares,
            WorldCover cropland exposure, and anomalous land change requiring official verification.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              to="/engine"
              className="inline-flex items-center gap-2 rounded-xl bg-primary-container px-5 py-2.5 font-mono text-sm font-bold text-on-primary-container shadow-lg transition-all hover:bg-primary-fixed-dim"
            >
              <span>Bengaluru AI Engine</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              to="/flood"
              className="inline-flex items-center gap-2 rounded-xl bg-surface-container-high px-5 py-2.5 font-mono text-sm font-medium text-on-surface transition-colors hover:bg-surface-variant"
            >
              <span>Flood Monitor</span>
            </Link>
            <Link
              to="/change"
              className="inline-flex items-center gap-2 rounded-xl bg-surface-container-high px-5 py-2.5 font-mono text-sm font-medium text-on-surface transition-colors hover:bg-surface-variant"
            >
              <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>Inspect Land Change</span>
            </Link>
          </div>
        </div>

        {/* Concentric Radar Sweep Graphic (Stitch v2) */}
        <div className="relative z-10 flex shrink-0 items-center justify-center lg:w-[290px]">
          <div className="relative flex h-52 w-52 items-center justify-center sm:h-56 sm:w-56">
            <svg className="h-full w-full" viewBox="0 0 240 240">
              <defs>
                <linearGradient id="radar-sweep-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#72ff9e" stopOpacity="0.48" />
                  <stop offset="50%" stopColor="#72ff9e" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#72ff9e" stopOpacity="0" />
                </linearGradient>
              </defs>
              <circle cx="120" cy="120" r="108" fill="none" stroke="#1c3a30" strokeWidth="1" />
              <circle cx="120" cy="120" r="76" fill="none" stroke="#1c3a30" strokeDasharray="3 4" strokeWidth="1" />
              <circle cx="120" cy="120" r="44" fill="none" stroke="#1c3a30" strokeWidth="1" />
              <line x1="120" y1="8" x2="120" y2="232" stroke="#1c3a30" strokeWidth="0.75" />
              <line x1="8" y1="120" x2="232" y2="120" stroke="#1c3a30" strokeWidth="0.75" />
              <g className="origin-center animate-radar-spin" style={{ transformOrigin: "120px 120px" }}>
                <path d="M120 120 L120 12 A108 108 0 0 1 215 68 Z" fill="url(#radar-sweep-grad)" />
                <line x1="120" y1="120" x2="120" y2="12" stroke="#72ff9e" strokeWidth="1.5" />
              </g>
              <circle cx="120" cy="120" r="4" fill="#fbbf24" />
              <circle cx="164" cy="72" r="3.5" fill="#d946ef" />
              <circle cx="78" cy="152" r="3.5" fill="#72ff9e" />
            </svg>
            <div className="absolute -bottom-1 rounded-full bg-surface-container-high px-3 py-0.5 font-mono text-[10px] font-semibold text-tertiary shadow">
              {scenes.length > 0 ? `${scenes.length} STAC SCENES INDEXED` : "SAR COHERENCE ACTIVE"}
            </div>
          </div>
        </div>
      </section>

      {/* BLOCK 2: 4 KPI CARDS (Real Pipeline Metrics) */}
      <section aria-label="Mission summary KPIs" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col justify-between gap-2 rounded-xl bg-surface-container/90 p-5 shadow-md backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary">
              Flooded Extent
            </span>
            <Droplets className="h-4 w-4 text-flood-magenta" aria-hidden="true" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[32px] font-bold leading-none tracking-tight text-flood-magenta tabular-nums">
              {formatIndianNumber(results.flood.flooded_area_ha, 2)}
            </span>
            <span className="font-mono text-xs text-secondary">ha</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-secondary">
            <span>{floodGeo?.features.length ?? results.flood.settlements_affected.length} zones · Permanent water masked</span>
            {!results.flood.validated && <span className="font-mono text-primary">Unvalidated</span>}
          </div>
        </div>

        <div className="flex flex-col justify-between gap-2 rounded-xl bg-surface-container/90 p-5 shadow-md backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary">
              Affected Cropland
            </span>
            <Sprout className="h-4 w-4 text-primary-container" aria-hidden="true" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[32px] font-bold leading-none tracking-tight text-primary-container tabular-nums">
              {formatIndianNumber(results.flood.cropland_affected_ha, 2)}
            </span>
            <span className="font-mono text-xs text-secondary">ha</span>
          </div>
          <div className="text-[11px] text-secondary">ESA WorldCover 10m intersection</div>
        </div>

        <div className="flex flex-col justify-between gap-2 rounded-xl bg-surface-container/90 p-5 shadow-md backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary">
              Estimated Crop Loss
            </span>
            <IndianRupee className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[32px] font-bold leading-none tracking-tight text-primary tabular-nums">
              {inr.main}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-secondary">
            <span>{inr.exact} @ ₹{formatIndianNumber(activeLossPerHa, 0)}/ha</span>
            <AssumptionTag />
          </div>
        </div>

        <div className="flex flex-col justify-between gap-2 rounded-xl bg-surface-container/90 p-5 shadow-md backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary">
              Land-Change Alerts
            </span>
            <ShieldAlert className="h-4 w-4 text-tertiary" aria-hidden="true" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[32px] font-bold leading-none tracking-tight text-tertiary tabular-nums">
              {formatIndianNumber(results.change.changed_area_ha, 2)}
            </span>
            <span className="font-mono text-xs text-secondary">ha</span>
          </div>
          <div className="text-[11px] text-secondary">
            {results.change.polygons.length} polygons · Requires official verification
          </div>
        </div>
      </section>

      {/* BLOCK 3: MISSION PIPELINE (3 Steps In One Row) */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary">
              MISSION PIPELINE
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-primary-container" />
            <span className="font-mono text-xs text-secondary">Autonomous Telemetry-to-Action</span>
          </div>
          <span className="font-mono text-xs text-tertiary">
            {results.flood.date_before} → {results.flood.date_after}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-3 rounded-xl bg-surface-container-high/80 p-5 shadow-md backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-tertiary">
                <Radar className="h-5 w-5" aria-hidden="true" />
              </div>
              <span className="font-mono text-xs font-bold text-secondary">01 // DETECT</span>
            </div>
            <h2 className="text-lg font-semibold text-primary">Continuous Space Radar</h2>
            <p className="text-sm text-secondary">
              Sentinel-1 Synthetic Aperture Radar penetrates monsoon cloud cover with Lee speckle filtering and dB
              calibration.
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-xl bg-surface-container-high/80 p-5 shadow-md backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-primary-container">
                <Layers className="h-5 w-5" aria-hidden="true" />
              </div>
              <span className="font-mono text-xs font-bold text-secondary">02 // MEASURE</span>
            </div>
            <h2 className="text-lg font-semibold text-primary">Neural Geospatial Fusion</h2>
            <p className="text-sm text-secondary">
              Sen1Floods11-trained U-Net segments flood extents, subtracts JRC permanent water, and intersects WorldCover
              &amp; OSM assets in UTM.
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-xl bg-surface-container-high/80 p-5 shadow-md backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-secondary">
                <Bell className="h-5 w-5" aria-hidden="true" />
              </div>
              <span className="font-mono text-xs font-bold text-secondary">03 // ACT</span>
            </div>
            <h2 className="text-lg font-semibold text-primary">Authority Incident Briefs</h2>
            <p className="text-sm text-secondary">
              Authorities receive prioritized settlement rankings, ₹ cropland loss estimates, and downloadable PDF briefs.
            </p>
          </div>
        </div>
      </section>

      {/* BLOCK 4: LIVE AOI PREVIEW + QUICK INR ASSUMPTION CONTROL */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Panel
          className="lg:col-span-8"
          eyebrow="Operational Sector Map"
          title={results.flood.aoi_name}
          subtitle="Magenta: predicted flood extent · Gold: land-change alerts · Dashed: AOI boundary"
          right={
            <Badge tone="mint">
              <Satellite className="h-3 w-3" aria-hidden="true" />
              {results.flood.built_up_affected_ha.toFixed(2)} ha built-up · {results.flood.roads_affected_km.toFixed(2)} km roads
            </Badge>
          }
        >
          <div className="h-[340px] overflow-hidden rounded-xl border border-outline-variant/25">
            <MapContainer center={[12.95, 77.66]} zoom={11} className="h-full w-full">
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {aoiGeo && (
                <GeoJSON data={aoiGeo as never} style={{ color: "#ffe1a7", weight: 1.5, dashArray: "6 4", fillOpacity: 0 }} />
              )}
              {floodGeo && (
                <GeoJSON
                  data={floodGeo as never}
                  style={{ color: "#d946ef", weight: 1.5, fillColor: "#d946ef", fillOpacity: 0.45 }}
                />
              )}
              {changeGeo && (
                <GeoJSON
                  data={changeGeo as never}
                  style={{ color: "#fbbf24", weight: 2, fillColor: "#fbbf24", fillOpacity: 0.35 }}
                />
              )}
            </MapContainer>
          </div>
        </Panel>

        <Panel
          className="lg:col-span-4 flex flex-col justify-between"
          eyebrow="Who Pays, And How Much?"
          title="Quick Cropland Loss Calibration"
          subtitle="Adjust the assumed ₹/ha loss rate; updates propagate across Overview, Impact, and PDF reports."
          right={<AssumptionTag />}
        >
          <div className="space-y-4">
            <div className="rounded-xl bg-surface-container-low p-4">
              <div className="flex items-center justify-between font-mono text-xs text-secondary">
                <span>Assumed Loss / ha</span>
                <span className="font-bold text-primary">₹{formatIndianNumber(activeLossPerHa, 0)}</span>
              </div>
              <input
                type="range"
                min={20000}
                max={200000}
                step={5000}
                value={activeLossPerHa}
                onChange={(e) => setCustomLossPerHa(Number(e.target.value))}
                aria-label="Cropland loss per hectare in INR"
                className="mt-3 w-full cursor-pointer accent-primary-container"
              />
              <div className="mt-2 flex justify-between font-mono text-[10px] text-secondary">
                <span>₹20,000/ha</span>
                <span>Default ₹{formatIndianNumber(results.economics.loss_per_ha_inr, 0)}</span>
                <span>₹2,00,000/ha</span>
              </div>
            </div>

            <div className="rounded-xl bg-surface-container-high p-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-secondary">
                Projected Direct Cropland Exposure
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-primary tabular-nums">{inr.main}</div>
              <div className="mt-1 font-mono text-xs text-secondary">
                {formatIndianNumber(results.flood.cropland_affected_ha, 2)} ha × ₹
                {formatIndianNumber(activeLossPerHa, 0)}/ha
              </div>
            </div>

            <Link
              to="/impact"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-container px-4 py-2.5 font-mono text-xs font-bold text-on-primary-container hover:bg-primary-fixed-dim"
            >
              <span>Open Full Impact &amp; Value Model</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
};
