import React, { useState } from "react";
import { ArrowRight, BookMarked, Cpu, Database, Gavel, Orbit, Satellite, ShieldCheck, Users } from "lucide-react";
import { Badge, Panel } from "../components/ui";

const PIPELINE_STAGES = [
  {
    step: "STAGE 01",
    title: "Planetary Computer STAC",
    sub: "Sentinel-1 RTC (VV/VH) + Sentinel-2 L2A (SCL cloud mask)",
    detail: "Queries planetarycomputer.microsoft.com/api/stac/v1 with planetary_computer.sign_inplace and groups Sentinel-1 scenes by matching orbit direction and relative orbit.",
  },
  {
    step: "STAGE 02",
    title: "Radiometric & Spectral Prep",
    sub: "Linear power → dB + NDVI / Bare Soil Index",
    detail: "Converts Sentinel-1 RTC linear power via 10*log10(max(x, 1e-6)) to match Sen1Floods11 dB units, and masks Sentinel-2 clouds using the SCL band.",
  },
  {
    step: "STAGE 03",
    title: "U-Net & Change Detection",
    sub: "ResNet-34 U-Net (Sen1Floods11) + ΔNDVI/BSI",
    detail: "Runs cosine-blended 256×256 sliding-window U-Net inference on SAR bands and polygons NDVI drop + BSI increase above thresholds.",
  },
  {
    step: "STAGE 04",
    title: "UTM 43N Impact Overlay",
    sub: "JRC GSW + ESA WorldCover + OpenStreetMap",
    detail: "Removes permanent water (JRC GSW), reprojects polygons to EPSG:32643 for exact hectare & road-km measurements, and checks river proximity.",
  },
  {
    step: "STAGE 05",
    title: "NVIDIA NIM & Evidence PDF",
    sub: "Grounded LLM/VLM advisories + offline cache",
    detail: "Generates temperature-0.2 grounded advisories, site triage, and downloadable PDF dossiers with SHA-256 disk caching and deterministic fallbacks.",
  },
];

export const AboutMethodPage: React.FC = () => {
  const [activeStage, setActiveStage] = useState(2);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone="mint">Earth Observation Core · Aeromania &apos;26 Mach-A-Thon</Badge>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-primary">
            System Architecture &amp; Methodological Rigor
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-on-surface-variant">
            End-to-end breakdown of GeoTerra AI: from Sentinel-1/2 ingestion on Planetary Computer to U-Net segmentation,
            impact modeling, and protective civic dispatch.
          </p>
        </div>
      </div>

      {/* Interactive 5-Stage Pipeline */}
      <Panel eyebrow="01 · Pipeline Architecture" title="Interactive End-to-End Flow">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          {PIPELINE_STAGES.map((st, idx) => (
            <button
              key={st.step}
              type="button"
              onClick={() => setActiveStage(idx)}
              className={`flex flex-col justify-between rounded-xl p-4 text-left transition ${
                activeStage === idx
                  ? "bg-primary-container text-on-primary-container shadow-md"
                  : "bg-surface-container-high text-on-surface hover:bg-surface-bright"
              }`}
            >
              <div>
                <span className="font-mono text-[11px] font-bold opacity-80">{st.step}</span>
                <h3 className="mt-1 font-semibold leading-snug">{st.title}</h3>
                <p className="mt-1 text-xs opacity-85">{st.sub}</p>
              </div>
              <div className="mt-3 flex items-center gap-1 font-mono text-[11px] font-semibold">
                <span>Inspect</span>
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-xl bg-surface-container-low p-4">
          <Satellite className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <div className="font-mono text-xs font-bold uppercase text-primary">
              {PIPELINE_STAGES[activeStage].step} — {PIPELINE_STAGES[activeStage].title}
            </div>
            <p className="mt-1 text-sm text-on-surface">{PIPELINE_STAGES[activeStage].detail}</p>
          </div>
        </div>
      </Panel>

      {/* Data Citations + NISAR Roadmap */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Panel
          eyebrow="02 · Citations"
          title="Data Sources & Scientific Grounding"
          right={<BookMarked className="h-5 w-5 text-primary" aria-hidden="true" />}
          className="lg:col-span-7"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-surface-container-high p-4">
              <Badge tone="gold">TRAINING DATASET</Badge>
              <h3 className="mt-2 font-semibold text-on-surface">Sen1Floods11 (v1.1)</h3>
              <p className="mt-1 text-xs text-on-surface-variant">
                Bonafilia et al. (2020), IEEE/CVF CVPR Workshops, pp. 210–211. Hand-labeled Sentinel-1 &amp; water chips.
              </p>
            </div>
            <div className="rounded-xl bg-surface-container-high p-4">
              <Badge tone="mint">COPERNICUS EO</Badge>
              <h3 className="mt-2 font-semibold text-on-surface">Sentinel-1 RTC &amp; Sentinel-2 L2A</h3>
              <p className="mt-1 text-xs text-on-surface-variant">
                Accessed via Microsoft Planetary Computer STAC API with dynamic SAS signing.
              </p>
            </div>
            <div className="rounded-xl bg-surface-container-high p-4">
              <Badge tone="fuchsia">WATER &amp; LAND COVER</Badge>
              <h3 className="mt-2 font-semibold text-on-surface">JRC GSW &amp; ESA WorldCover</h3>
              <p className="mt-1 text-xs text-on-surface-variant">
                Masks permanent rivers/reservoirs and isolates cropland &amp; built-up exposure.
              </p>
            </div>
            <div className="rounded-xl bg-surface-container-high p-4">
              <Badge tone="sage">INFRASTRUCTURE</Badge>
              <h3 className="mt-2 font-semibold text-on-surface">OpenStreetMap Contributors</h3>
              <p className="mt-1 text-xs text-on-surface-variant">
                Driveway road networks, bridges, hospitals, and electrical substations via OSMnx.
              </p>
            </div>
          </div>
        </Panel>

        <Panel
          eyebrow="03 · Future Roadmap"
          title="NISAR Mission Integration"
          right={<Orbit className="h-5 w-5 text-secondary" aria-hidden="true" />}
          className="lg:col-span-5"
        >
          <p className="text-sm leading-relaxed text-on-surface-variant">
            The joint NASA-ISRO Synthetic Aperture Radar (<strong className="text-on-surface">NISAR</strong>) mission
            provides L-band and S-band observations suited to sub-canopy flood mapping during dense monsoon cover.
          </p>
          <div className="mt-4 rounded-xl border border-primary-container/40 bg-surface-container-low p-4 text-xs text-on-surface">
            <div className="font-mono font-bold text-primary">CRITICAL TELEMETRY NOTE</div>
            <p className="mt-1 text-on-surface-variant">
              Raw NISAR L0 RRSD (radar signal data) is <strong>not used</strong> in this pipeline. Once processed
              geocoded Level-2 NISAR backscatter products become available, they can plug directly into GeoTerra AI&apos;s
              inference stage.
            </p>
          </div>
        </Panel>
      </div>

      {/* Ethics + Team */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Panel
          eyebrow="04 · Guardrails"
          title="Ethics & Responsible Use Principles"
          right={<ShieldCheck className="h-5 w-5 text-verified-mint" aria-hidden="true" />}
          className="lg:col-span-7"
        >
          <div className="space-y-3 text-xs">
            <div className="flex items-start gap-3 rounded-xl bg-surface-container-high p-3.5">
              <Gavel className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <div className="font-semibold text-on-surface">Non-Accusatory Framing</div>
                <p className="mt-0.5 text-on-surface-variant">
                  Land-change detections are strictly labeled{" "}
                  <strong className="text-primary">&ldquo;Potential suspicious activity: requires official verification&rdquo;</strong>.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-surface-container-high p-3.5">
              <Database className="mt-0.5 h-5 w-5 shrink-0 text-secondary" aria-hidden="true" />
              <div>
                <div className="font-semibold text-on-surface">Area-Level Analytics Only (No Individual Tracking)</div>
                <p className="mt-0.5 text-on-surface-variant">
                  Protective civic monitoring only — zero weapons, zero targeting, and zero tracking of individual people or vehicles.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-surface-container-high p-3.5">
              <Cpu className="mt-0.5 h-5 w-5 shrink-0 text-tertiary-lilac" aria-hidden="true" />
              <div>
                <div className="font-semibold text-on-surface">Grounded AI &amp; Honest Metrics</div>
                <p className="mt-0.5 text-on-surface-variant">
                  NVIDIA NIM runs at temperature 0.2 over verified JSON numbers only; Karnataka flood predictions are
                  explicitly labeled <strong className="text-primary">&ldquo;Model prediction (unvalidated)&rdquo;</strong>.
                </p>
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          eyebrow="05 · Credits"
          title="Aeromania '26 Mach-A-Thon"
          right={<Users className="h-5 w-5 text-primary" aria-hidden="true" />}
          className="lg:col-span-5"
        >
          <div className="rounded-xl bg-surface-container-high p-4">
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="font-bold text-primary">ORBIT TO ECONOMY: AI IN SPACE</span>
              <Badge tone="gold">BOEING TRACK</Badge>
            </div>
            <p className="mt-2 text-sm text-on-surface">
              GeoTerra AI — Protective Earth Observation &amp; Civic Disaster Intelligence.
            </p>
          </div>
          <div className="mt-3 space-y-2 text-xs text-on-surface-variant">
            <p><strong className="text-on-surface">Team Placeholder:</strong> [Add Team Member Names &amp; Roles]</p>
            <p><strong className="text-on-surface">Stack:</strong> PyTorch + SMP ResNet-34 U-Net · Planetary Computer STAC · FastAPI · NVIDIA NIM · React + Vite + Tailwind + Leaflet</p>
          </div>
        </Panel>
      </div>
    </div>
  );
};
