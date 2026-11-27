import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Cpu, FileDown, Grid, MapPin, MessageSquare, Send, ShieldCheck, Table2 } from "lucide-react";
import { api } from "../api/client";
import { AITagBadge, Badge, ErrorBox, LoadingSkeleton, Panel, UnvalidatedBadge } from "../components/ui";
import { useGeoTerra } from "../context/GeoTerraContext";
import type { AIResponse } from "../types";

type AlertWorkflowStatus = "New" | "Under verification" | "Verified";

const EXAMPLE_QUESTIONS = [
  "What is the predicted flooded area and cropland loss in INR?",
  "What are the Sen1Floods11 test and Bolivia IoU/F1 metrics?",
  "How many land-change polygons are near rivers and what is their verification status?",
];

export const AlertsReportsPage: React.FC = () => {
  const { data, loading, error, demoMode, updateAiMode, refresh } = useGeoTerra();
  const [statuses, setStatuses] = useState<Record<string, AlertWorkflowStatus>>({});
  const [severityFilter, setSeverityFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [viewType, setViewType] = useState<"cards" | "table">("cards");
  const [nimAdvisory, setNimAdvisory] = useState<AIResponse | null>(null);
  const [advisoryLoading, setAdvisoryLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [qaAnswer, setQaAnswer] = useState<AIResponse | null>(null);
  const [qaLoading, setQaLoading] = useState(false);

  const alertCards = useMemo(() => {
    if (!data) return [];
    const { results } = data;
    return [
      ...results.flood.settlements_affected.map((s) => ({
        id: `FL-${s.name}`,
        title: s.name,
        type: "Flood Proximity (Model prediction — unvalidated)",
        severity: s.priority,
        areaText: `${results.flood.flooded_area_ha} ha AOI`,
        detail: `Est. pop ${s.population_estimate?.toLocaleString("en-IN") ?? "N/A"}`,
        link: "/flood",
      })),
      ...results.change.polygons.map((p) => ({
        id: p.id,
        title: `${p.id} — ${results.change.site_name}`,
        type: "Potential suspicious activity: requires official verification",
        severity: p.near_river || p.confidence >= 0.85 ? ("high" as const) : ("medium" as const),
        areaText: `${p.area_ha} ha`,
        detail: `NDVI drop -${p.ndvi_drop} · Conf ${(p.confidence * 100).toFixed(0)}%`,
        link: "/change",
      })),
    ];
  }, [data]);

  const filteredCards = alertCards.filter((c) => severityFilter === "all" || c.severity === severityFilter);

  if (loading) return <LoadingSkeleton rows={4} />;
  if (error || !data) return <ErrorBox message={error ?? "No alerts data."} onRetry={refresh} />;

  const { results } = data;

  const cycleStatus = (id: string) => {
    const cur = statuses[id] ?? "New";
    const next: AlertWorkflowStatus =
      cur === "New" ? "Under verification" : cur === "Under verification" ? "Verified" : "New";
    setStatuses((prev) => ({ ...prev, [id]: next }));
  };

  const handleGenerateAdvisory = async () => {
    setAdvisoryLoading(true);
    try {
      const resp = await api.postAlert("KSDMA / BBMP", demoMode);
      setNimAdvisory(resp);
      updateAiMode(resp.ai_mode);
    } finally {
      setAdvisoryLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      await api.downloadPdfReport(demoMode);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleAsk = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setQuestion(trimmed);
    setQaLoading(true);
    try {
      const resp = await api.postAsk(trimmed, demoMode);
      setQaAnswer(resp);
      updateAiMode(resp.ai_mode);
    } finally {
      setQaLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header Bar with Category Filters */}
      <div className="flex flex-col justify-between gap-4 rounded-xl bg-surface-container-low p-4 shadow-md md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-tertiary">
            <span className="h-2 w-2 animate-pulse rounded-full bg-tertiary-container" />
            <span>TACTICAL FEED • {alertCards.length} PRIORITY ITEMS</span>
          </div>
          <h1 className="mt-1 text-xl font-semibold text-on-surface">
            Disaster Situational Reports &amp; Emergency Alerts
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["all", "high", "medium", "low"] as const).map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => setSeverityFilter(sev)}
              className={`rounded-full px-3 py-1.5 font-mono text-[11px] font-semibold uppercase transition ${
                severityFilter === sev
                  ? "bg-primary-container text-on-primary-container"
                  : "bg-surface-container-high text-secondary hover:text-on-surface"
              }`}
            >
              {sev === "all" ? `All (${alertCards.length})` : sev}
            </button>
          ))}
          <div className="flex rounded-lg bg-surface-container-high p-1">
            <button
              type="button"
              onClick={() => setViewType("cards")}
              aria-label="Card view"
              className={`rounded p-1.5 ${viewType === "cards" ? "bg-primary-container text-on-primary-container" : "text-secondary"}`}
            >
              <Grid className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setViewType("table")}
              aria-label="Table view"
              className={`rounded p-1.5 ${viewType === "table" ? "bg-primary-container text-on-primary-container" : "text-secondary"}`}
            >
              <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Main 12-Col Grid: Priority Queue (8 cols) | PDF Report + AI Assistant (4 cols) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-8">
          {viewType === "cards" ? (
            filteredCards.map((c) => {
              const st = statuses[c.id] ?? "New";
              return (
                <div
                  key={c.id}
                  className="relative flex flex-col justify-between gap-3 rounded-xl bg-surface-container p-4 shadow-md transition hover:bg-surface-container-high md:flex-row md:items-center"
                >
                  <div
                    className={`absolute bottom-3 left-0 top-3 w-1.5 rounded-r ${
                      c.severity === "high" ? "bg-error-vivid" : "bg-primary-container"
                    }`}
                  />
                  <div className="min-w-0 flex-1 pl-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={c.severity === "high" ? "coral" : c.severity === "medium" ? "gold" : "mint"}>
                        {c.severity.toUpperCase()}
                      </Badge>
                      <span className="font-mono text-xs text-secondary">{c.areaText}</span>
                      <button
                        type="button"
                        onClick={() => cycleStatus(c.id)}
                        className="rounded-full bg-surface-container-highest px-2.5 py-0.5 font-mono text-[10px] font-semibold text-primary hover:bg-surface-bright"
                      >
                        Status: {st}
                      </button>
                    </div>
                    <h3 className="mt-1.5 text-base font-semibold text-on-surface">{c.title}</h3>
                    <p className="text-xs text-secondary">{c.type} · {c.detail}</p>
                  </div>
                  <Link
                    to={c.link}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-surface-variant px-3.5 py-2 font-mono text-xs font-medium text-on-surface hover:bg-surface-bright"
                  >
                    <MapPin className="h-3.5 w-3.5 text-tertiary" aria-hidden="true" />
                    <span>View on Map</span>
                  </Link>
                </div>
              );
            })
          ) : (
            <div className="overflow-x-auto rounded-xl bg-surface-container p-4 shadow-md">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-outline-variant/30 font-mono text-[11px] uppercase text-secondary">
                  <tr>
                    <th className="py-2 pr-3">ID / Site</th>
                    <th className="py-2 pr-3">Severity</th>
                    <th className="py-2 pr-3">Extent</th>
                    <th className="py-2 pr-3">Verification</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {filteredCards.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2.5 pr-3 font-medium text-on-surface">{c.title}</td>
                      <td className="py-2.5 pr-3">
                        <Badge tone={c.severity === "high" ? "coral" : "gold"}>{c.severity}</Badge>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-primary">{c.areaText}</td>
                      <td className="py-2.5 pr-3">
                        <button
                          type="button"
                          onClick={() => cycleStatus(c.id)}
                          className="font-mono text-xs text-tertiary underline"
                        >
                          {statuses[c.id] ?? "New"}
                        </button>
                      </td>
                      <td className="py-2.5">
                        <Link to={c.link} className="font-mono text-xs text-primary hover:underline">
                          Inspect →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right 4 Cols: Evidence PDF + AI Advisory + Grounded Q&A */}
        <div className="flex flex-col gap-5 xl:col-span-4">
          <Panel
            eyebrow="Statutory Clearance"
            title="Generate Evidence Report (PDF)"
            subtitle="One-page situation brief with flood/change metrics, INR estimate, and Responsible Use notice."
            right={!results.flood.validated && <UnvalidatedBadge />}
          >
            <div className="space-y-3">
              <div className="rounded-xl bg-surface-container-low p-3 font-mono text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-secondary">AOI:</span>
                  <span className="text-on-surface">{results.flood.aoi_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">Flood Extent:</span>
                  <span className="text-flood-magenta">{results.flood.flooded_area_ha} ha</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">Land Change:</span>
                  <span className="text-primary">{results.change.polygons.length} polygons</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-container px-4 py-3 font-mono text-xs font-bold text-on-primary-container shadow-lg hover:bg-primary-fixed-dim disabled:opacity-60"
              >
                <FileDown className="h-4 w-4" aria-hidden="true" />
                <span>{pdfLoading ? "Generating PDF..." : "Download Full Evidence PDF"}</span>
              </button>

              <Link
                to="/simulation?mission=bellandur_flood_response&autostart=1"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-tertiary/50 bg-tertiary-container/15 px-4 py-2.5 font-mono text-xs font-bold text-tertiary hover:bg-tertiary-container/25"
              >
                <span>Start Simulated Sat→HAPS→Drone Response</span>
              </Link>

              <button
                type="button"
                onClick={handleGenerateAdvisory}
                disabled={advisoryLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-surface-container-high px-4 py-2.5 font-mono text-xs font-semibold text-on-surface hover:bg-surface-variant"
              >
                <Cpu className="h-4 w-4 text-tertiary" aria-hidden="true" />
                <span>{advisoryLoading ? "Generating NIM Advisory..." : "Generate AI Authority Advisory"}</span>
              </button>

              {nimAdvisory && (
                <div className="rounded-xl bg-surface-container-low p-3 text-xs">
                  <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-tertiary">
                    <span>SOURCE: {nimAdvisory.detail_source.toUpperCase()}</span>
                    <span>{nimAdvisory.ai_tag}</span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed text-on-surface">{nimAdvisory.text}</p>
                </div>
              )}
            </div>
          </Panel>

          <Panel
            eyebrow="Grounded Intelligence"
            title="GeoTerra AI Assistant"
            subtitle="Ask questions grounded strictly in real results.json telemetry via NVIDIA NIM."
            right={<AITagBadge />}
          >
            <div className="space-y-3">
              <div className="flex flex-col gap-1.5">
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleAsk(q)}
                    className="flex items-center justify-between rounded-lg bg-surface-container-low px-3 py-2 text-left text-xs text-secondary hover:bg-surface-container-high hover:text-on-surface"
                  >
                    <span className="truncate">{q}</span>
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  </button>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAsk(question);
                }}
                className="flex items-center gap-2 rounded-xl bg-surface-container-lowest p-1.5"
              >
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask about flood ha, ₹ loss, IoU/F1..."
                  className="w-full bg-transparent px-2.5 py-1.5 text-xs text-on-surface placeholder:text-outline focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={qaLoading}
                  aria-label="Send query"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-container text-on-primary-container hover:bg-primary-fixed-dim"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </form>

              {qaAnswer && (
                <div className="rounded-xl bg-surface-container-low p-3 text-xs">
                  <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-tertiary">
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                      {qaAnswer.detail_source.toUpperCase()}
                    </span>
                    <span>{qaAnswer.ai_tag}</span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed text-on-surface">{qaAnswer.text}</p>
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
};
