import React, { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Building2, Coins, FileDown, IndianRupee, RotateCcw, Zap } from "lucide-react";
import { api } from "../api/client";
import { AssumptionTag, Badge, ErrorBox, LoadingSkeleton, Panel } from "../components/ui";
import { useGeoTerra } from "../context/GeoTerraContext";
import { formatINRCompact, formatIndianNumber } from "../utils/format";

const BUYERS = [
  {
    buyer: "State Disaster Management Authorities (KSDMA / DDMA)",
    region: "Karnataka & Monsoon-Prone Districts",
    need: "Rapid ward-level flood extent & critical asset exposure during cloud-covered monsoons",
    value: "Cuts situational assessment from days to minutes; prioritizes pumping & relief deployment.",
    badge: "Operational Pilot",
  },
  {
    buyer: "Crop Insurers (PMFBY / Reinsurers)",
    region: "Kharif & Rabi Agricultural Belts",
    need: "Independent hectare-level flooded cropland verification & loss-curve estimation",
    value: "Reduces manual field-audit latency and supports faster parametric claim triage.",
    badge: "Evaluation",
  },
  {
    buyer: "Mining, Forest & Pollution Control Departments",
    region: "Peri-Urban & River-Buffer Corridors",
    need: "Continuous vegetation loss & river-buffer disturbance screening",
    value: "Delivers geo-referenced polygons and evidence PDFs for authorized field inspections.",
    badge: "Ready for Integration",
  },
];

export const ImpactValuePage: React.FC = () => {
  const {
    data,
    loading,
    error,
    demoMode,
    customLossPerHa: whatIfLoss,
    setCustomLossPerHa: setWhatIfLoss,
    refresh,
  } = useGeoTerra();
  const [pdfBusy, setPdfBusy] = useState(false);

  if (loading) return <LoadingSkeleton rows={3} />;
  if (error || !data) return <ErrorBox message={error ?? "No economics data."} onRetry={refresh} />;

  const { results, derived } = data;
  const activeLossPerHa = whatIfLoss ?? results.economics.loss_per_ha_inr;
  const whatIfTotalInr = results.flood.cropland_affected_ha * activeLossPerHa;
  const formattedTotal = formatINRCompact(whatIfTotalInr);

  const timeChartData = [
    { method: "Manual Ground Survey", hours: derived.manual_assessment_hours },
    { method: "GeoTerra AI Pipeline", hours: results.economics.assessment_time_geoterra_hours },
  ];

  const handleExportPdf = async () => {
    setPdfBusy(true);
    try {
      await api.downloadPdfReport(demoMode);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6">
      {/* SECTION 1: Hero Economic Loss Formula Card (Stitch v2) */}
      <section className="relative overflow-hidden rounded-xl bg-surface-container/90 p-6 shadow-emerald backdrop-blur-xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <IndianRupee className="h-5 w-5 text-primary-container" aria-hidden="true" />
            <span className="font-mono text-xs font-semibold uppercase tracking-widest text-secondary">
              Who Pays &amp; How Much — Editable Cropland Loss Model
            </span>
          </div>
          <AssumptionTag label="Labeled Assumption" />
        </div>

        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-12">
          {/* Interactive Formula Display */}
          <div className="space-y-4 lg:col-span-7">
            <div className="flex flex-wrap items-baseline gap-3 font-mono">
              <div className="rounded-xl bg-surface-container-low px-4 py-3">
                <span className="block text-[10px] uppercase text-secondary">Affected Cropland</span>
                <span className="text-2xl font-bold text-on-surface tabular-nums">
                  {formatIndianNumber(results.flood.cropland_affected_ha, 2)} ha
                </span>
              </div>
              <span className="text-2xl font-bold text-secondary">×</span>
              <div className="rounded-xl bg-surface-container-low px-4 py-3">
                <span className="block text-[10px] uppercase text-secondary">Assumed Loss / ha</span>
                <span className="text-2xl font-bold text-primary-container tabular-nums">
                  ₹{formatIndianNumber(activeLossPerHa, 0)}
                </span>
              </div>
              <span className="text-2xl font-bold text-secondary">=</span>
              <div className="rounded-xl bg-surface-container-high px-5 py-3 ring-1 ring-primary-container/40">
                <span className="block text-[10px] uppercase text-secondary">Estimated Direct Loss</span>
                <span className="text-3xl font-bold text-primary tabular-nums">{formattedTotal.main}</span>
              </div>
            </div>

            <div className="rounded-xl bg-surface-container-low p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono font-semibold text-secondary">Adjust Loss Per Hectare (INR/ha)</span>
                <button
                  type="button"
                  onClick={() => setWhatIfLoss(results.economics.loss_per_ha_inr)}
                  className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  Reset Default (₹{formatIndianNumber(results.economics.loss_per_ha_inr, 0)})
                </button>
              </div>
              <input
                type="range"
                min={20000}
                max={200000}
                step={5000}
                value={activeLossPerHa}
                onChange={(e) => setWhatIfLoss(Number(e.target.value))}
                aria-label="What-if loss per hectare slider"
                className="mt-3 w-full cursor-pointer accent-primary-container"
              />
              <p className="mt-2 text-xs text-secondary">
                Direct cropland exposure = Affected Cropland (ha) × Assumed Loss/ha. Adjust slider to model crop value.
              </p>
            </div>
          </div>

          {/* Right Summary Exposure Breakdown */}
          <div className="flex flex-col gap-3 rounded-xl bg-surface-container-low p-5 lg:col-span-5">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary">
              Secondary Physical Exposure (Not Included in Crop Formula)
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-surface-container p-3">
                <div className="font-mono text-[10px] uppercase text-secondary">Built-Up Area</div>
                <div className="mt-1 font-mono text-lg font-bold text-on-surface tabular-nums">
                  {formatIndianNumber(results.flood.built_up_affected_ha, 2)} ha
                </div>
              </div>
              <div className="rounded-lg bg-surface-container p-3">
                <div className="font-mono text-[10px] uppercase text-secondary">Roads Intersected</div>
                <div className="mt-1 font-mono text-lg font-bold text-error-vivid tabular-nums">
                  {formatIndianNumber(results.flood.roads_affected_km, 2)} km
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-surface-container-high px-3 py-2 text-xs">
              <span className="text-secondary">Estimated In Crores</span>
              <span className="font-mono font-bold text-tertiary">{(whatIfTotalInr / 1e7).toFixed(3)} Cr</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: Two Equal-Width Comparison Cards (Stitch v2) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel
          eyebrow="Decision Time Saved"
          title="Manual Ground Survey vs. GeoTerra AI"
          subtitle="Hours from satellite overpass to verified situational brief"
          right={<Badge tone="mint">{derived.time_saved_hours.toFixed(1)} hrs saved</Badge>}
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeChartData} layout="vertical" margin={{ top: 8, right: 24, left: 16, bottom: 8 }}>
                <CartesianGrid stroke="rgba(166,208,189,0.12)" strokeDasharray="3 3" />
                <XAxis type="number" stroke="#a6d0bd" fontSize={12} unit="h" />
                <YAxis type="category" dataKey="method" stroke="#a6d0bd" fontSize={12} width={150} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#04251b",
                    borderColor: "#4f4633",
                    color: "#c8eada",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="hours" fill="#72ff9e" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-container-high/60 p-3">
            <div className="flex items-center gap-2 text-xs text-on-surface">
              <Zap className="h-4 w-4 text-tertiary" aria-hidden="true" />
              <span>Assessment Latency Reduction</span>
            </div>
            <span className="font-mono text-sm font-bold text-tertiary">
              {derived.time_speedup_factor.toFixed(1)}× Faster
            </span>
          </div>
        </Panel>

        <Panel
          eyebrow="Stakeholder Accountability"
          title="Who Benefits & Institutional Value"
          subtitle="Public agencies and parametric insurers served by open-data pipeline"
          right={<Building2 className="h-5 w-5 text-primary" aria-hidden="true" />}
        >
          <div className="space-y-3">
            {BUYERS.map((b) => (
              <div key={b.buyer} className="rounded-xl bg-surface-container-low p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-on-surface">{b.buyer}</span>
                  <Badge tone="gold">{b.badge}</Badge>
                </div>
                <p className="mt-1 text-xs text-secondary">{b.value}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* SECTION 3: Cost Structure & Export Action Bar */}
      <div className="flex flex-col items-center justify-between gap-4 rounded-xl bg-surface-container/90 p-5 shadow-md md:flex-row">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-container-low text-primary-container">
            <Coins className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-secondary">
                Operational Ingest Cost Model
              </span>
              <Badge tone="mint">Zero Vendor Lock-in</Badge>
            </div>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              Open Copernicus Sentinel-1/2 feeds (₹0.00 data cost) + PyTorch/STAC cloud inference + Instant PDF
              situational briefs.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExportPdf}
          disabled={pdfBusy}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary-container px-5 py-3 font-mono text-xs font-bold text-on-primary-container shadow-lg hover:bg-primary-fixed-dim disabled:opacity-60"
        >
          <FileDown className="h-4 w-4" aria-hidden="true" />
          <span>{pdfBusy ? "Compiling PDF Brief..." : "Export Evidence Brief (PDF)"}</span>
        </button>
      </div>
    </div>
  );
};
