import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import {
  AlertTriangle,
  Bell,
  Bot,
  Camera,
  CheckCircle2,
  Cpu,
  Download,
  FileText,
  Navigation,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Satellite,
  Sparkles,
} from "lucide-react";
import { api } from "../api/client";
import { AITagBadge, AssumptionTag, Badge, ErrorBox, LoadingSkeleton, Panel, SimulationBadge } from "../components/ui";
import { useGeoTerra } from "../context/GeoTerraContext";
import type { AIResponse, SimulationMissionItem, SimulationMissionsResponse } from "../types";

const MISSION_STAGES = [
  { id: 1, label: "Sat Detection", role: "LEO Sentinel AI Auto-Alert", time: "T+00:45" },
  { id: 2, label: "HAPS Relay", role: "Stratospheric Link (20 km)", time: "T+02:15" },
  { id: 3, label: "Drone Dispatch", role: "Autonomous UAV En-Route", time: "T+06:40" },
  { id: 4, label: "Aerial Capture", role: "Simulated Site Inspection", time: "T+10:50" },
  { id: 5, label: "Final Report", role: "Verified Action Brief", time: "T+12:30" },
];

const SEVERITY_TONE: Record<string, "coral" | "gold" | "mint"> = {
  CRITICAL: "coral",
  HIGH: "gold",
  MEDIUM: "mint",
};

function interpolatePolyline(points: Array<[number, number]>, t: number): [number, number] {
  if (points.length === 0) return [12.9716, 77.5946];
  if (points.length === 1 || t <= 0) return points[0];
  if (t >= 1) return points[points.length - 1];
  const segCount = points.length - 1;
  const scaled = t * segCount;
  const idx = Math.min(segCount - 1, Math.floor(scaled));
  const localT = scaled - idx;
  const [lat1, lon1] = points[idx];
  const [lat2, lon2] = points[idx + 1];
  return [lat1 + (lat2 - lat1) * localT, lon1 + (lon2 - lon1) * localT];
}

function makeDivIcon(html: string, size: number) {
  return L.divIcon({
    html,
    className: "geoterra-sim-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const satIcon = makeDivIcon(
  `<div style="width:34px;height:34px;border-radius:10px;background:#04251b;border:2px solid #38bdf8;display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px rgba(56,189,248,0.65);color:#38bdf8;font-family:monospace;font-size:10px;font-weight:bold;">SAT</div>`,
  34,
);

const hapsIcon = makeDivIcon(
  `<div style="width:42px;height:28px;border-radius:999px;background:#102f25;border:2px solid #fbbf24;display:flex;align-items:center;justify-content:center;box-shadow:0 0 14px rgba(251,191,36,0.6);color:#fbbf24;font-family:monospace;font-size:10px;font-weight:bold;">HAPS</div>`,
  42,
);

const droneIcon = makeDivIcon(
  `<div style="width:32px;height:32px;border-radius:999px;background:#04251b;border:2px solid #72ff9e;display:flex;align-items:center;justify-content:center;box-shadow:0 0 14px rgba(114,255,158,0.85);color:#72ff9e;font-family:monospace;font-size:9px;font-weight:bold;">UAV</div>`,
  32,
);

const alertIcon = makeDivIcon(
  `<div style="width:28px;height:28px;border-radius:999px;background:rgba(239,68,68,0.28);border:2px solid #ef4444;display:flex;align-items:center;justify-content:center;color:#fca5a5;font-family:monospace;font-size:12px;font-weight:bold;">!</div>`,
  28,
);

const FocusMission: React.FC<{ lat: number; lon: number }> = ({ lat, lon }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], 12, { duration: 0.7 });
  }, [lat, lon, map]);
  return null;
};

export const SimulationPage: React.FC = () => {
  const { data, loading, error, demoMode, updateAiMode, refresh } = useGeoTerra();
  const [searchParams] = useSearchParams();

  const [missionsData, setMissionsData] = useState<SimulationMissionsResponse | null>(null);
  const [selectedMissionId, setSelectedMissionId] = useState<string>("bellandur_flood_response");
  const [viewMode, setViewMode] = useState<"map" | "orbital">("map");
  const [baseLayer, setBaseLayer] = useState<"osm" | "sat">("osm");
  const [processingMode, setProcessingMode] = useState<"onboard" | "ground">("onboard");
  const [pdfDownloading, setPdfDownloading] = useState<boolean>(false);

  // Simulation timeline progress 0..100
  const [progress, setProgress] = useState<number>(100);
  const [simRunning, setSimRunning] = useState<boolean>(false);

  const [aiQuestion, setAiQuestion] = useState<string>("");
  const [aiResult, setAiResult] = useState<AIResponse | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);

  useEffect(() => {
    void api
      .getSimulationMissions()
      .then((res) => {
        setMissionsData(res);
        const paramMission = searchParams.get("mission");
        const autoStart = searchParams.get("autostart") === "1";
        if (paramMission && res.missions.some((m) => m.id === paramMission)) {
          setSelectedMissionId(paramMission);
        } else if (res.missions.length > 0) {
          setSelectedMissionId(res.missions[0].id);
        }
        if (autoStart) {
          setProgress(5);
          setSimRunning(true);
        }
      })
      .catch(() => null);
  }, [searchParams]);

  // Animate progress 0 -> 100 smoothly (~10 seconds full mission playback)
  useEffect(() => {
    if (!simRunning) return;
    if (progress >= 100) {
      setSimRunning(false);
      return;
    }
    const timer = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setSimRunning(false);
          return 100;
        }
        return Math.min(100, prev + 1.5);
      });
    }, 130);
    return () => window.clearInterval(timer);
  }, [simRunning, progress]);

  const activeMission: SimulationMissionItem | null = useMemo(() => {
    if (!missionsData?.missions?.length) return null;
    return missionsData.missions.find((m) => m.id === selectedMissionId) ?? missionsData.missions[0];
  }, [missionsData, selectedMissionId]);

  const currentStage = useMemo(() => {
    if (progress < 20) return 1;
    if (progress < 40) return 2;
    if (progress < 75) return 3;
    if (progress < 95) return 4;
    return 5;
  }, [progress]);

  // Drone moves during Stage 3 (progress 35 -> 78)
  const droneT = useMemo(() => {
    if (progress <= 35) return 0;
    if (progress >= 78) return 1;
    return (progress - 35) / (78 - 35);
  }, [progress]);

  const satT = useMemo(() => Math.min(1, progress / 55), [progress]);

  const dronePos = useMemo<[number, number]>(() => {
    if (!activeMission) return [12.9716, 77.5946];
    return interpolatePolyline(activeMission.drone_waypoints, droneT);
  }, [activeMission, droneT]);

  const satPos = useMemo<[number, number]>(() => {
    if (!activeMission) return [13.05, 77.58];
    return interpolatePolyline(activeMission.satellite_track, satT);
  }, [activeMission, satT]);

  const flownPath = useMemo<Array<[number, number]>>(() => {
    if (!activeMission) return [];
    if (droneT <= 0) return [activeMission.drone_waypoints[0]];
    const total = activeMission.drone_waypoints.length - 1;
    const idx = Math.floor(droneT * total);
    return [...activeMission.drone_waypoints.slice(0, idx + 1), dronePos];
  }, [activeMission, droneT, dronePos]);

  const askEmergencyAI = async (missionId?: string, overrideQ?: string) => {
    const mId = missionId ?? activeMission?.id;
    if (!mId) return;
    setAiLoading(true);
    try {
      const q = (overrideQ ?? aiQuestion).trim();
      const resp = await api.explainSimulationMission({
        mission_id: mId,
        stage: currentStage,
        question: q || undefined,
        demo_mode: demoMode,
      });
      setAiResult(resp);
      updateAiMode(resp.ai_mode);
    } catch (e) {
      setAiResult({
        text: e instanceof Error ? e.message : "Unable to reach NIM Emergency Advisor.",
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
    if (activeMission && !aiResult && !aiLoading) {
      void askEmergencyAI(activeMission.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMission?.id]);

  const triggerSimulation = (missionId?: string) => {
    if (missionId) {
      setSelectedMissionId(missionId);
      setAiResult(null);
    }
    setProgress(5);
    setSimRunning(true);
    setShowReportModal(false);
  };

  const downloadSimulatedReport = () => {
    if (!activeMission) return;
    const reportObj = {
      simulation_disclaimer:
        missionsData?.simulation_notice ??
        "DIGITAL SIMULATION ONLY — No real satellites, HAPS or drones controlled.",
      generated_at: new Date().toISOString(),
      mission_id: activeMission.id,
      title: activeMission.title,
      hazard_type: activeMission.hazard_type,
      severity: activeMission.severity,
      trigger_source: activeMission.trigger_source,
      auto_alert: activeMission.auto_alert,
      haps_relay: activeMission.haps_station,
      drone_dispatch: {
        hub: activeMission.drone_hub,
        target: activeMission.target,
        findings: activeMission.drone_findings,
      },
      ai_analysis: aiResult?.text ?? "See AI Emergency Advisor panel.",
    };
    const blob = new Blob([JSON.stringify(reportObj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GeoTerra_SIM_Emergency_Report_${activeMission.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !missionsData || !activeMission) return <LoadingSkeleton rows={4} />;
  if (error || !data) return <ErrorBox message={error ?? "No simulation telemetry."} onRetry={refresh} />;

  const { derived, assumptions } = data;
  const droneBattery = Math.max(42, Math.round(98 - droneT * 24));
  const droneAlt = currentStage === 3 ? 120 : currentStage >= 4 ? 85 : 0;
  const droneSpeed = currentStage === 3 && simRunning ? 54 : 0;

  return (
    <div className="space-y-6">
      {/* Guardrail Simulation Header + Scenario Trigger Cards */}
      <Panel
        eyebrow="DIGITAL TWIN MISSION CONTROL // SATELLITE → HAPS → DRONE"
        title="Bengaluru Automated Emergency Response Simulation"
        subtitle={missionsData.simulation_notice}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <SimulationBadge />
            <AssumptionTag label="No Real Hardware Controlled" />
            <button
              type="button"
              onClick={() => triggerSimulation()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-container px-3.5 py-1.5 font-mono text-xs font-bold text-on-primary-container shadow-lg hover:opacity-90"
            >
              <Play className="h-3.5 w-3.5" />
              {simRunning ? "Restart Sim" : "Simulate Auto-Response"}
            </button>
            <button
              type="button"
              onClick={() => setSimRunning((r) => !r)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container px-3 py-1.5 font-mono text-xs text-on-surface hover:bg-surface-bright"
            >
              {simRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {simRunning ? "Pause" : "Resume"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSimRunning(false);
                setProgress(100);
              }}
              className="inline-flex items-center gap-1 rounded-xl border border-outline-variant/40 bg-surface-container px-2.5 py-1.5 font-mono text-xs text-secondary hover:text-on-surface"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Complete
            </button>
          </div>
        }
      >
        {/* Auto-Generated Emergency Alert Notification */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error-vivid/50 bg-error-container/35 px-4 py-3">
          <div className="flex items-start gap-3">
            <Bell className="mt-0.5 h-5 w-5 shrink-0 animate-pulse text-error-vivid" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={SEVERITY_TONE[activeMission.severity] ?? "gold"}>
                  AUTO-ALERT: {activeMission.severity}
                </Badge>
                <span className="font-mono text-xs font-semibold text-on-surface">
                  {activeMission.auto_alert.alert_id} · {activeMission.auto_alert.headline}
                </span>
              </div>
              <p className="mt-1 text-xs text-secondary">
                {activeMission.auto_alert.metrics_summary} · Trigger: {activeMission.trigger_source}
              </p>
            </div>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-wider text-tertiary">
            Stage {currentStage}/5 · {Math.round(progress)}%
          </span>
        </div>

        {/* Selectable Bengaluru Emergency Scenarios */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {missionsData.missions.map((m) => {
            const active = m.id === activeMission.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => triggerSimulation(m.id)}
                className={`rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-primary bg-primary-container/15 shadow-[0_0_16px_rgba(251,191,36,0.16)]"
                    : "border-outline-variant/30 bg-surface-container hover:border-outline-variant"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={SEVERITY_TONE[m.severity] ?? "sage"}>{m.hazard_type}</Badge>
                  <span className="font-mono text-[10px] text-secondary">{m.drone_findings.distance_km} km UAV</span>
                </div>
                <p className="mt-2 font-semibold text-xs text-on-surface">{m.title}</p>
                <p className="mt-1 text-[11px] text-secondary line-clamp-2">{m.auto_alert.metrics_summary}</p>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* Main Viewport: Animated Bengaluru Map / Orbital Diagram + Live Telemetry */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          className="xl:col-span-8"
          eyebrow={`BENGALURU MISSION MAP // ${activeMission.target.name}`}
          title="Live Animated Satellite -> HAPS -> Drone Dispatch"
          subtitle="Click a timeline step below or click 'Simulate Auto-Response' to watch the full relay & UAV flight."
          right={
            <div className="flex flex-wrap gap-1.5 font-mono text-xs">
              <button
                type="button"
                onClick={() => setViewMode("map")}
                className={`rounded-lg px-2.5 py-1 ${
                  viewMode === "map" ? "bg-primary-container font-semibold text-on-primary-container" : "bg-surface-container text-secondary"
                }`}
              >
                Bengaluru Map
              </button>
              <button
                type="button"
                onClick={() => setViewMode("orbital")}
                className={`rounded-lg px-2.5 py-1 ${
                  viewMode === "orbital" ? "bg-primary-container font-semibold text-on-primary-container" : "bg-surface-container text-secondary"
                }`}
              >
                Altitude Diagram
              </button>
              {viewMode === "map" && (
                <button
                  type="button"
                  onClick={() => setBaseLayer((b) => (b === "osm" ? "sat" : "osm"))}
                  className="rounded-lg border border-outline-variant/40 bg-surface-container px-2.5 py-1 text-on-surface hover:border-primary/60"
                >
                  {baseLayer === "osm" ? "Satellite Map" : "Street Map"}
                </button>
              )}
            </div>
          }
        >
          {viewMode === "map" ? (
            <div className="relative h-[430px] w-full overflow-hidden rounded-xl border border-outline-variant/40">
              <MapContainer
                center={[activeMission.target.lat, activeMission.target.lon]}
                zoom={12}
                className="h-full w-full"
                scrollWheelZoom
              >
                <FocusMission lat={activeMission.haps_station.lat} lon={activeMission.haps_station.lon} />
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

                {/* Satellite ground track */}
                <Polyline
                  positions={activeMission.satellite_track}
                  pathOptions={{ color: "#38bdf8", dashArray: "6 5", weight: 2, opacity: 0.7 }}
                />

                {/* Relay link: Satellite -> HAPS */}
                {currentStage >= 2 && (
                  <Polyline
                    positions={[satPos, [activeMission.haps_station.lat, activeMission.haps_station.lon]]}
                    pathOptions={{ color: "#fbbf24", dashArray: "4 4", weight: 2.5 }}
                  />
                )}

                {/* Relay link: HAPS -> Drone */}
                {currentStage >= 2 && (
                  <Polyline
                    positions={[[activeMission.haps_station.lat, activeMission.haps_station.lon], dronePos]}
                    pathOptions={{ color: "#72ff9e", dashArray: "4 4", weight: 2.2 }}
                  />
                )}

                {/* Planned UAV route vs flown trail */}
                <Polyline
                  positions={activeMission.drone_waypoints}
                  pathOptions={{ color: "#94a3b8", dashArray: "5 5", weight: 2, opacity: 0.6 }}
                />
                <Polyline positions={flownPath} pathOptions={{ color: "#72ff9e", weight: 3.5 }} />

                {/* HAPS Stratospheric Coverage Halo */}
                <CircleMarker
                  center={[activeMission.haps_station.lat, activeMission.haps_station.lon]}
                  radius={36}
                  pathOptions={{ color: "#fbbf24", weight: 1, dashArray: "4 4", fillColor: "#fbbf24", fillOpacity: 0.08 }}
                />

                {/* Animated Markers */}
                <Marker position={satPos} icon={satIcon}>
                  <Popup>
                    <strong>LEO Satellite (Simulated Pass)</strong>
                    <br />
                    Trigger: {activeMission.trigger_source}
                  </Popup>
                </Marker>

                <Marker position={[activeMission.haps_station.lat, activeMission.haps_station.lon]} icon={hapsIcon}>
                  <Popup>
                    <strong>{activeMission.haps_station.name} (Simulated Relay)</strong>
                    <br />
                    Altitude: {activeMission.haps_station.altitude_km} km stratosphere
                  </Popup>
                </Marker>

                <Marker position={dronePos} icon={droneIcon}>
                  <Popup>
                    <strong>Simulated Inspection UAV</strong>
                    <br />
                    Progress: {Math.round(droneT * 100)}% · Alt {droneAlt} m · Bat {droneBattery}%
                  </Popup>
                </Marker>

                <Marker position={[activeMission.target.lat, activeMission.target.lon]} icon={alertIcon}>
                  <Popup>
                    <strong>Emergency Alert Target: {activeMission.target.name}</strong>
                    <br />
                    {activeMission.auto_alert.headline}
                  </Popup>
                </Marker>
              </MapContainer>

              {/* Floating Live Simulated Telemetry Overlay */}
              <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-xl border border-outline-variant/40 bg-surface-container-lowest/90 px-3 py-2 font-mono text-[11px] backdrop-blur-md">
                <div className="flex items-center gap-2 text-tertiary font-semibold">
                  <Navigation className="h-3.5 w-3.5" />
                  SIMULATED UAV LIVE POS: {dronePos[0].toFixed(4)}°N, {dronePos[1].toFixed(4)}°E
                </div>
                <div className="mt-1 flex gap-3 text-secondary">
                  <span>Alt: {droneAlt} m</span>
                  <span>Speed: {droneSpeed} km/h</span>
                  <span>Bat: {droneBattery}%</span>
                  <span>HAPS Link: {currentStage >= 2 ? "18 ms OK" : "Standby"}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative min-h-[430px] overflow-hidden rounded-xl border border-outline-variant/40 bg-gradient-to-b from-surface-container-lowest via-surface-container to-surface-container-high">
              <svg className="h-[430px] w-full" preserveAspectRatio="none" viewBox="0 0 840 430">
                <line x1="170" y1="60" x2="800" y2="60" stroke="#38bdf8" strokeDasharray="6 4" strokeWidth="1.5" />
                <line x1="170" y1="175" x2="800" y2="175" stroke="#fbbf24" strokeDasharray="4 4" strokeWidth="1.5" />
                <line x1="170" y1="295" x2="800" y2="295" stroke="#72ff9e" strokeDasharray="3 4" strokeWidth="1.5" />
                <g transform={`translate(${240 + satT * 360}, 60)`}>
                  <rect x="-22" y="-10" width="44" height="20" rx="4" fill="#04251b" stroke="#38bdf8" strokeWidth="2" />
                  <text x="0" y="4" textAnchor="middle" fill="#38bdf8" fontSize="10" fontFamily="monospace">LEO SAT</text>
                </g>
                <g transform="translate(450, 175)">
                  <ellipse cx="0" cy="0" rx="34" ry="12" fill="#102f25" stroke="#fbbf24" strokeWidth="2" />
                  <text x="0" y="4" textAnchor="middle" fill="#fbbf24" fontSize="10" fontFamily="monospace">HAPS 20km</text>
                </g>
                <g transform={`translate(${250 + droneT * 350}, 295)`}>
                  <circle cx="0" cy="0" r="14" fill="#04251b" stroke="#72ff9e" strokeWidth="2" />
                  <text x="0" y="4" textAnchor="middle" fill="#72ff9e" fontSize="9" fontFamily="monospace">UAV</text>
                </g>
                <line x1={240 + satT * 360} y1="70" x2="450" y2="163" stroke="#fbbf24" strokeDasharray="4 3" strokeWidth="1.5" />
                <line x1="450" y1="187" x2={250 + droneT * 350} y2="281" stroke="#72ff9e" strokeDasharray="4 3" strokeWidth="1.5" />
                <path d="M 160 390 Q 460 378 820 390 L 820 430 L 160 430 Z" fill="#04251b" />
                <circle cx="600" cy="384" r="8" fill="#ef4444" />
                <text x="600" y="410" textAnchor="middle" fill="#fca5a5" fontSize="11" fontFamily="monospace">{activeMission.target.name}</text>
              </svg>
            </div>
          )}

          {/* 5-Stage Mission Workflow Bar */}
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between font-mono text-[11px] text-secondary">
              <span>END-TO-END MISSION WORKFLOW (CLICK ANY STAGE TO INSPECT)</span>
              <span className="text-tertiary font-semibold">{Math.round(progress)}% COMPLETE</span>
            </div>
            <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-surface-container">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-400 via-primary-container to-tertiary transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
              {MISSION_STAGES.map((st) => {
                const done = currentStage > st.id || progress >= 100;
                const active = currentStage === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      setSimRunning(false);
                      setProgress(st.id === 1 ? 15 : st.id === 2 ? 32 : st.id === 3 ? 62 : st.id === 4 ? 86 : 100);
                    }}
                    className={`rounded-xl border p-2.5 text-left transition ${
                      active
                        ? "border-primary bg-primary-container/15"
                        : done
                          ? "border-tertiary/40 bg-surface-container"
                          : "border-outline-variant/25 bg-surface-container-low opacity-65"
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <span className={done ? "text-tertiary font-bold" : "text-primary"}>0{st.id}</span>
                      <span className="text-secondary">{st.time}</span>
                    </div>
                    <p className="mt-1 font-semibold text-xs text-on-surface">{st.label}</p>
                    <p className="text-[10px] text-secondary">{st.role}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </Panel>

        {/* Right Col: Simulated Aerial Captures + HAPS Telemetry */}
        <div className="space-y-5 xl:col-span-4">
          <Panel
            eyebrow="SIMULATED UAV PAYLOAD & TELEMETRY"
            title="Drone Inspection Captures"
            subtitle="Unlocked once UAV enters target corridor (Stage 4+)."
            right={<AssumptionTag label="Simulated Preview" />}
          >
            {currentStage >= 4 ? (
              <div className="space-y-3">
                {activeMission.simulated_captures.map((cap) => (
                  <div key={cap.label} className="overflow-hidden rounded-xl border border-outline-variant/35 bg-surface-container">
                    <img src={cap.image_url} alt={cap.label} className="h-36 w-full object-cover" />
                    <div className="p-2.5">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
                        <Camera className="h-3.5 w-3.5 text-tertiary" />
                        {cap.label}
                      </p>
                      <p className="mt-0.5 text-[11px] text-secondary">{cap.caption}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant/40 bg-surface-container p-4 text-center">
                <Satellite className="h-7 w-7 animate-pulse text-primary" />
                <p className="mt-2 font-mono text-xs text-on-surface">UAV En-Route ({Math.round(droneT * 100)}%)</p>
                <p className="mt-1 text-[11px] text-secondary">
                  Simulated aerial captures appear when Stage 4 (Aerial Capture) completes.
                </p>
              </div>
            )}

            <div className="mt-4 space-y-2">
              <div className="flex rounded-lg bg-surface-container p-1 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => setProcessingMode("onboard")}
                  className={`flex-1 rounded-md py-1 ${
                    processingMode === "onboard" ? "bg-primary-container font-bold text-on-primary-container" : "text-secondary"
                  }`}
                >
                  Onboard Edge AI
                </button>
                <button
                  type="button"
                  onClick={() => setProcessingMode("ground")}
                  className={`flex-1 rounded-md py-1 ${
                    processingMode === "ground" ? "bg-primary-container font-bold text-on-primary-container" : "text-secondary"
                  }`}
                >
                  Raw Downlink
                </button>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-surface-container px-3 py-2 text-xs">
                <span className="text-secondary">Relay Bandwidth Mode</span>
                <span className="font-mono font-bold text-tertiary">
                  {processingMode === "onboard"
                    ? `${derived.compression_ratio.toFixed(0)}x smaller (48 KB)`
                    : `${assumptions.raw_scene_size_mb} MB (${derived.raw_downlink_seconds.toFixed(1)}s)`}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-surface-container px-3 py-2 text-xs">
                <span className="text-secondary">HAPS Persistent Altitude</span>
                <span className="font-mono font-bold text-primary">{activeMission.haps_station.altitude_km} km</span>
              </div>
            </div>
          </Panel>

          <Panel
            eyebrow="IMMEDIATE ATTENTION AREAS"
            title="Priority Checkpoints"
          >
            <ul className="space-y-1.5 text-xs">
              {activeMission.drone_findings.immediate_attention_areas.map((pt) => (
                <li key={pt} className="flex items-center gap-2 rounded-lg bg-surface-container px-3 py-2 text-on-surface">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning-orange" />
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      {/* Bottom Split: AI Emergency Operations Assistant + Final Simulated Report */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          className="xl:col-span-6"
          eyebrow="NVIDIA NIM EMERGENCY OPERATIONS ADVISOR"
          title="AI Situation & Response Analyst"
          subtitle="Synthesizes satellite trigger, HAPS relay & simulated drone findings."
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
              `Analyze ${activeMission.title} and list immediate civil response priorities.`,
              "How does the HAPS 20 km relay cut response delay versus ground-only tasking?",
              "Which roads, drains, or substations in this zone need urgent field crew dispatch?",
            ].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  setAiQuestion(q);
                  void askEmergencyAI(activeMission.id, q);
                }}
                className="rounded-lg border border-outline-variant/40 bg-surface-container px-2.5 py-1 text-left text-[11px] text-secondary hover:border-primary/50 hover:text-primary"
              >
                {q}
              </button>
            ))}
          </div>

          <div className="mb-4 flex gap-2">
            <input
              type="text"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void askEmergencyAI();
              }}
              placeholder="Ask AI about this emergency simulation or dispatch plan…"
              className="flex-1 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-secondary/60 focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void askEmergencyAI()}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-container px-4 py-2 text-xs font-semibold text-on-primary-container hover:opacity-90 disabled:opacity-60"
            >
              <Bot className="h-4 w-4" />
              {aiLoading ? "Analyzing…" : "Ask AI"}
            </button>
          </div>

          <div className="min-h-[220px] whitespace-pre-wrap rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 text-sm leading-relaxed text-on-surface">
            {aiLoading ? (
              <p className="animate-pulse font-mono text-xs text-secondary">
                Evaluating Satellite → HAPS → Drone emergency telemetry with NIM…
              </p>
            ) : aiResult ? (
              aiResult.text
            ) : (
              "Click Ask AI or run a simulation to analyze the emergency response workflow."
            )}
          </div>
        </Panel>

        {/* Stage 5 Final Emergency Response Report */}
        <Panel
          className="xl:col-span-6"
          eyebrow="STAGE 05 // END-TO-END WORKFLOW OUTPUT"
          title="Simulated Final Emergency Response Report"
          subtitle="Structured summary combining orbital trigger, drone path, checkpoints & response plan."
          right={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowReportModal((s) => !s)}
                className="inline-flex items-center gap-1 rounded-xl border border-outline-variant/40 bg-surface-container px-3 py-1.5 font-mono text-xs text-on-surface hover:bg-surface-bright"
              >
                <FileText className="h-3.5 w-3.5" />
                {showReportModal ? "Compact View" : "Full Report"}
              </button>
              <button
                type="button"
                disabled={pdfDownloading}
                onClick={async () => {
                  setPdfDownloading(true);
                  try {
                    await api.downloadPdfReport(demoMode, activeMission.id);
                  } finally {
                    setPdfDownloading(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary-container px-3 py-1.5 font-mono text-xs font-bold text-on-primary-container hover:opacity-90 disabled:opacity-60"
              >
                <Download className="h-3.5 w-3.5" />
                {pdfDownloading ? "Generating PDF…" : "Download PDF Report"}
              </button>
              <button
                type="button"
                onClick={downloadSimulatedReport}
                className="inline-flex items-center gap-1.5 rounded-xl bg-tertiary-container px-3 py-1.5 font-mono text-xs font-bold text-on-tertiary-container hover:opacity-90"
              >
                <Download className="h-3.5 w-3.5" />
                JSON
              </button>
            </div>
          }
        >
          <div className="space-y-3 rounded-xl border border-outline-variant/35 bg-surface-container p-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/25 pb-2.5">
              <div>
                <p className="font-mono text-[10px] uppercase text-secondary">MISSION ID: {activeMission.auto_alert.alert_id}</p>
                <p className="text-sm font-bold text-on-surface">{activeMission.title}</p>
              </div>
              <Badge tone={currentStage === 5 ? "mint" : "gold"}>
                {currentStage === 5 ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" /> WORKFLOW COMPLETE (SIMULATED)
                  </>
                ) : (
                  <>
                    <Radio className="h-3.5 w-3.5" /> IN PROGRESS (STAGE {currentStage}/5)
                  </>
                )}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 font-mono">
              <div>
                <span className="text-[10px] uppercase text-secondary">Flight Distance</span>
                <p className="text-sm font-bold text-primary">{activeMission.drone_findings.distance_km} km</p>
              </div>
              <div>
                <span className="text-[10px] uppercase text-secondary">Est. Flight Time</span>
                <p className="text-sm font-bold text-tertiary">{activeMission.drone_findings.flight_duration_min} min</p>
              </div>
              <div>
                <span className="text-[10px] uppercase text-secondary">Water Depth (Sim)</span>
                <p className="text-sm font-bold text-sky-300">
                  {activeMission.drone_findings.water_depth_est_m > 0
                    ? `${activeMission.drone_findings.water_depth_est_m} m`
                    : "Dry / Heat Mode"}
                </p>
              </div>
            </div>

            <div>
              <p className="font-mono text-[10px] uppercase text-secondary mb-1">Recommended Response Actions</p>
              <ul className="space-y-1 text-on-surface">
                {activeMission.drone_findings.recommended_actions.map((act) => (
                  <li key={act} className="flex items-start gap-1.5">
                    <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tertiary" />
                    <span>{act}</span>
                  </li>
                ))}
              </ul>
            </div>

            {showReportModal && activeMission.drone_findings.road_corridors_blocked.length > 0 && (
              <div className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-3">
                <p className="font-mono text-[10px] uppercase text-warning-orange">Affected Roads Checked (Simulated)</p>
                <p className="mt-1 text-on-surface">{activeMission.drone_findings.road_corridors_blocked.join(" · ")}</p>
              </div>
            )}

            <p className="rounded-lg bg-surface-container-lowest px-2.5 py-1.5 font-mono text-[10px] text-secondary">
              NOTICE: Digital simulation only — no physical satellite tasking, stratospheric aircraft, or autonomous UAV flights are operated.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
};
