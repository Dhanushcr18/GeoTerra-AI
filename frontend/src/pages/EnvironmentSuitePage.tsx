import React, { useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { Flame, Layers, ShieldAlert } from "lucide-react";
import { InfrastructurePage } from "./InfrastructurePage";
import { LandChangePage } from "./LandChangePage";
import { UrbanHeatPage } from "./UrbanHeatPage";

export type SuiteTab = "heat" | "infrastructure" | "change";

const TABS: Array<{
  id: SuiteTab;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: "heat",
    label: "Urban Heat",
    subtitle: "Landsat LST & Tree Cooling",
    icon: Flame,
  },
  {
    id: "infrastructure",
    label: "Critical Infrastructure",
    subtitle: "Roads, Metro, Power & Water",
    icon: ShieldAlert,
  },
  {
    id: "change",
    label: "Land Change",
    subtitle: "Sentinel-2 Anomalous Clearing",
    icon: Layers,
  },
];

export const EnvironmentSuitePage: React.FC<{ initialTab?: SuiteTab }> = ({ initialTab = "heat" }) => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<SuiteTab>(initialTab);

  useEffect(() => {
    const q = searchParams.get("tab");
    if (q === "heat" || q === "infrastructure" || q === "change") {
      setActiveTab(q);
      return;
    }
    if (location.pathname === "/infrastructure") setActiveTab("infrastructure");
    else if (location.pathname === "/change") setActiveTab("change");
    else if (location.pathname === "/heat") setActiveTab("heat");
  }, [location.pathname, searchParams]);

  const handleSelect = (tab: SuiteTab) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <div className="space-y-5">
      {/* Sub-Navbar Module Switcher */}
      <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/35 bg-surface-container-low/95 p-3 shadow-md sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary">
            ENVIRONMENTAL &amp; INFRASTRUCTURE OBSERVATORY
          </p>
          <p className="text-xs text-on-surface-variant">
            Select a module below to display its full interactive map, satellite comparison, charts, and AI advisor.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TABS.map(({ id, label, subtitle, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelect(id)}
                className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2 text-left transition ${
                  active
                    ? "border-primary bg-primary-container text-on-primary-container shadow-[0_0_16px_rgba(251,191,36,0.28)]"
                    : "border-outline-variant/35 bg-surface-container text-on-surface hover:border-primary/50 hover:bg-surface-container-high"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? "text-on-primary-container" : "text-primary"}`} />
                <div className="min-w-0">
                  <div className="font-mono text-xs font-bold leading-tight">{label}</div>
                  <div className={`truncate text-[10px] ${active ? "text-on-primary-container/80" : "text-secondary"}`}>
                    {subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Full Active Module View */}
      {activeTab === "heat" && <UrbanHeatPage />}
      {activeTab === "infrastructure" && <InfrastructurePage />}
      {activeTab === "change" && <LandChangePage />}
    </div>
  );
};
