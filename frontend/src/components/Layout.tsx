import React, { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Bell,
  Building2,
  CloudRain,
  Contrast,
  Droplets,
  Cpu,
  Globe2,
  HelpCircle,
  Home,
  Layers,
  Maximize2,
  Minimize2,
  Orbit,
  PlayCircle,
  Satellite,
  ShieldCheck,
  TrendingUp,
  Waves,
} from "lucide-react";
import { useGeoTerra } from "../context/GeoTerraContext";

const NAV_ITEMS = [
  { to: "/", label: "Overview", icon: Home },
  { to: "/engine", label: "AI Engine", icon: Cpu },
  { to: "/flood", label: "Flood Monitor", icon: Waves },
  { to: "/predict", label: "Flood Prediction", icon: CloudRain },
  { to: "/lakes", label: "Lake Monitor", icon: Droplets },
  { to: "/urban", label: "Urban Growth", icon: Building2 },
  { to: "/hazards", label: "Heat, Infra & Land", icon: Layers },
  { to: "/impact", label: "Impact & Value", icon: TrendingUp },
  { to: "/simulation", label: "Space Sim", icon: Orbit },
  { to: "/alerts", label: "Alerts & Reports", icon: Bell },
  { to: "/model", label: "Model & Data", icon: Activity },
];

const DEMO_FLOW = [
  { label: "1. Flood", to: "/flood" },
  { label: "2. Impact", to: "/impact" },
  { label: "3. Model", to: "/model" },
  { label: "4. Change", to: "/change" },
  { label: "5. Simulation", to: "/simulation" },
  { label: "6. Report", to: "/alerts" },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data, aiMode, demoMode, setDemoMode } = useGeoTerra();
  const [daylight, setDaylight] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isSample = data?.results.sample ?? false;
  const aoiName = data?.results.flood.aoi_name ?? "Bengaluru Urban & Peri-Urban Catchment";

  const toggleDaylight = () => {
    const next = !daylight;
    setDaylight(next);
    document.documentElement.classList.toggle("daylight", next);
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Ignore fullscreen denial in restricted iframes
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface selection:bg-primary-container selection:text-on-primary-container">
      {/* Left Fixed 72px Icon Rail (Emerald Orbit Stitch v2) */}
      <aside
        aria-label="Mission control icon navigation"
        className="fixed left-0 top-0 z-50 hidden h-full w-[72px] flex-col items-center bg-surface-container-low py-4 shadow-[0_1px_12px_rgba(0,0,0,0.35)] sm:flex"
      >
        <Link
          to="/"
          className="group relative mb-6 flex items-center justify-center"
          aria-label="GeoTerra AI Overview"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container-high text-primary-container shadow-[0_0_14px_rgba(251,191,36,0.22)]">
            <Satellite className="h-5 w-5" aria-hidden="true" />
          </div>
          <span className="pointer-events-none absolute left-16 z-50 whitespace-nowrap rounded bg-surface-container-highest px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-on-surface opacity-0 shadow-emerald transition-opacity group-hover:opacity-100">
            GeoTerra AI
          </span>
        </Link>

        <nav className="flex w-full flex-1 flex-col items-center gap-1.5 px-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              aria-label={label}
              className={({ isActive }) =>
                `group relative flex h-11 w-11 items-center justify-center rounded-xl transition-all ${
                  isActive
                    ? "bg-primary-container text-on-primary-container shadow-[0_0_14px_rgba(251,191,36,0.35)]"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                }`
              }
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="pointer-events-none absolute left-14 z-50 whitespace-nowrap rounded bg-surface-container-highest px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-on-surface opacity-0 shadow-emerald transition-opacity group-hover:opacity-100">
                {label}
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="flex w-full flex-col items-center gap-1.5 pt-2">
          <button
            type="button"
            onClick={toggleDaylight}
            title={daylight ? "Switch to Emerald Orbit Dark" : "Switch to Daylight Optics"}
            aria-label="Toggle Daylight Optics"
            className={`group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
              daylight
                ? "bg-primary-container/20 text-primary"
                : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            }`}
          >
            <Contrast className="h-5 w-5" aria-hidden="true" />
            <span className="pointer-events-none absolute left-14 z-50 whitespace-nowrap rounded bg-surface-container-highest px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-on-surface opacity-0 shadow-emerald transition-opacity group-hover:opacity-100">
              {daylight ? "Dark Mode" : "Daylight Optics"}
            </span>
          </button>
          <NavLink
            to="/about"
            aria-label="About & Method"
            className={({ isActive }) =>
              `group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                isActive
                  ? "bg-primary-container text-on-primary-container"
                  : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              }`
            }
          >
            <HelpCircle className="h-5 w-5" aria-hidden="true" />
            <span className="pointer-events-none absolute left-14 z-50 whitespace-nowrap rounded bg-surface-container-highest px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-on-surface opacity-0 shadow-emerald transition-opacity group-hover:opacity-100">
              About &amp; Method
            </span>
          </NavLink>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex min-h-screen flex-col sm:pl-[72px]">
        {/* Top Observatory Header */}
        <header className="sticky top-0 z-40 h-16 bg-surface-container-low/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.2)]">
          <div className="mx-auto flex h-16 max-w-[1720px] items-center justify-between gap-4 px-4 lg:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                to="/"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container sm:hidden"
              >
                <Satellite className="h-5 w-5" aria-hidden="true" />
              </Link>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-base font-semibold tracking-tight text-primary sm:text-lg">
                  Disaster Authority Observatory
                </span>
                <span className="truncate font-mono text-[11px] text-secondary">
                  Satellites see it. AI measures it. Authorities act on it.
                </span>
              </div>
            </div>

            <div className="hidden items-center gap-2 font-mono text-xs text-secondary xl:flex">
              <Globe2 className="h-4 w-4" aria-hidden="true" />
              <span>GLOBAL-GRID</span>
              <span className="text-outline">/</span>
              <span className="max-w-[260px] truncate text-primary">{aoiName}</span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-full bg-surface-container-high px-2.5 py-1">
                <span
                  className={`h-2 w-2 rounded-full ${
                    aiMode === "live" ? "bg-tertiary-container animate-pulse" : "bg-primary-container"
                  }`}
                />
                <Cpu className="h-3.5 w-3.5 text-tertiary" aria-hidden="true" />
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-tertiary">
                  AI: {aiMode}
                </span>
              </div>

              {isSample && (
                <div className="hidden items-center gap-1 rounded-full bg-primary-container px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-on-primary-container sm:flex">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  SAMPLE DATA
                </div>
              )}

              <button
                type="button"
                onClick={() => setDemoMode(!demoMode)}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-xs transition-colors ${
                  demoMode
                    ? "bg-primary-container font-bold text-on-primary-container"
                    : "bg-surface-variant text-on-surface hover:bg-surface-bright"
                }`}
              >
                <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{demoMode ? "Demo ON" : "Demo Mode"}</span>
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                className="hidden items-center gap-1.5 rounded-lg bg-surface-container-high px-3 py-1.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-variant md:flex"
                title="Pitch / Fullscreen View"
              >
                {isFullscreen ? (
                  <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span className="hidden lg:inline">{isFullscreen ? "Exit Pitch" : "Pitch View"}</span>
              </button>
            </div>
          </div>
        </header>

        {/* Mobile Bottom-Compact Nav Bar */}
        <nav
          aria-label="Mobile navigation"
          className="flex items-center gap-1 overflow-x-auto bg-surface-container-low px-3 py-2 sm:hidden"
        >
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `shrink-0 rounded-lg px-2.5 py-1 font-mono text-[11px] ${
                  isActive
                    ? "bg-primary-container font-bold text-on-primary-container"
                    : "bg-surface-container-high text-secondary"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* SAMPLE DATA Banner */}
        {isSample && (
          <div className="eo-sample-stripes px-4 py-1.5 text-center font-mono text-xs font-bold tracking-wide">
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              SAMPLE DATA — Placeholder demo outputs active. Run the real satellite pipeline to replace with live Bengaluru detections.
            </span>
          </div>
        )}

        {/* Demo Mode Guided Tour Bar */}
        {demoMode && (
          <div className="border-b border-primary-container/25 bg-surface-container-high/70 px-4 py-2 lg:px-6">
            <div className="mx-auto flex max-w-[1720px] flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-mono font-semibold text-primary">
                DEMO TOUR (60s): Follow the 6-step judge walkthrough →
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {DEMO_FLOW.map((step) => (
                  <NavLink
                    key={step.to}
                    to={step.to}
                    className={({ isActive }) =>
                      `rounded-full px-2.5 py-0.5 font-mono text-[11px] transition-colors ${
                        isActive
                          ? "bg-primary-container font-bold text-on-primary-container"
                          : "bg-surface-container text-on-surface-variant hover:text-primary"
                      }`
                    }
                  >
                    {step.label}
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Main Workspace Canvas */}
        <main className="mx-auto w-full max-w-[1720px] flex-1 p-4 pb-12 lg:p-6 lg:pb-12">{children}</main>

        {/* Fixed Slim Responsible Use Footer */}
        <footer className="sticky bottom-0 z-30 flex h-8 items-center justify-between border-t border-outline-variant/20 bg-surface-container-lowest/95 px-4 font-mono text-[11px] text-on-surface-variant backdrop-blur-md lg:px-6">
          <div className="flex min-w-0 items-center gap-2 truncate">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-tertiary" aria-hidden="true" />
            <span className="truncate">
              <strong className="text-primary">Responsible Use:</strong> Area-level disaster &amp; environmental
              monitoring only. All outputs require official ground verification.{" "}
              <Link to="/about" className="underline text-on-surface hover:text-primary">
                Ethics &amp; Limitations
              </Link>
            </span>
          </div>
          <span className="hidden shrink-0 pl-3 font-mono text-[10px] text-secondary md:inline">
            UTC+05:30 IST • {isSample ? "SAMPLE DATA" : "REAL PIPELINE"}
          </span>
        </footer>
      </div>
    </div>
  );
};
