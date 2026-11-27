import React, { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCircle, BookOpen, Cpu, Satellite } from "lucide-react";
import { api } from "../api/client";
import { Badge, ErrorBox, LoadingSkeleton, Panel, UnvalidatedBadge } from "../components/ui";
import type { ModelResponse, SceneItem } from "../types";

export const ModelDataPage: React.FC = () => {
  const [modelData, setModelData] = useState<ModelResponse | null>(null);
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getModel(), api.getScenes()])
      .then(([m, s]) => {
        setModelData(m);
        setScenes(s);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load model metadata."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton rows={4} />;
  if (error || !modelData) return <ErrorBox message={error ?? "Missing model metadata."} />;

  const { model_card: card, training_log: log } = modelData;

  const comparisonData = [
    {
      split: "Test (Sen1Floods11)",
      "VH Baseline IoU": card.baseline_metrics.test.iou,
      "U-Net IoU": card.metrics.test.iou,
      "VH Baseline F1": card.baseline_metrics.test.f1,
      "U-Net F1": card.metrics.test.f1,
    },
    {
      split: "Bolivia (Held-out)",
      "VH Baseline IoU": card.baseline_metrics.bolivia.iou,
      "U-Net IoU": card.metrics.bolivia.iou,
      "VH Baseline F1": card.baseline_metrics.bolivia.f1,
      "U-Net F1": card.metrics.bolivia.f1,
    },
  ];

  const totalChips =
    card.split_sizes.train + card.split_sizes.val + card.split_sizes.test + card.split_sizes.bolivia;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Model Card, Benchmarks &amp; Scene Catalog</h1>
          <p className="text-sm text-on-surface-variant">
            IoU and F1 metrics are reported strictly on labeled Sen1Floods11 splits. Karnataka outputs remain unvalidated.
          </p>
        </div>
        <UnvalidatedBadge />
      </div>

      {/* Model Architecture Banner */}
      <Panel
        eyebrow="Model Architecture & Sensor Input"
        title={card.model_name}
        subtitle={`Trained on ${card.dataset} | Channels: ${card.in_channels.join(", ")}`}
        right={<Badge tone="gold"><Cpu className="h-3.5 w-3.5" /> Backbone: {card.encoder}</Badge>}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl bg-surface-container-high p-3.5">
            <div className="font-mono text-[11px] text-on-surface-variant">TEST IoU</div>
            <div className="mt-1 font-mono text-2xl font-bold text-primary tabular-nums">
              {card.metrics.test.iou.toFixed(3)}
            </div>
          </div>
          <div className="rounded-xl bg-surface-container-high p-3.5">
            <div className="font-mono text-[11px] text-on-surface-variant">TEST F1</div>
            <div className="mt-1 font-mono text-2xl font-bold text-secondary tabular-nums">
              {card.metrics.test.f1.toFixed(3)}
            </div>
          </div>
          <div className="rounded-xl bg-surface-container-high p-3.5">
            <div className="font-mono text-[11px] text-on-surface-variant">BOLIVIA IoU</div>
            <div className="mt-1 font-mono text-2xl font-bold text-tertiary tabular-nums">
              {card.metrics.bolivia.iou.toFixed(3)}
            </div>
          </div>
          <div className="rounded-xl bg-surface-container-high p-3.5">
            <div className="font-mono text-[11px] text-on-surface-variant">BOLIVIA F1</div>
            <div className="mt-1 font-mono text-2xl font-bold text-secondary tabular-nums">
              {card.metrics.bolivia.f1.toFixed(3)}
            </div>
          </div>
          <div className="col-span-2 rounded-xl bg-surface-container-high p-3.5 sm:col-span-1">
            <div className="font-mono text-[11px] text-on-surface-variant">VH BASELINE TEST</div>
            <div className="mt-1 font-mono text-2xl font-bold text-on-surface-variant tabular-nums">
              {card.baseline_metrics.test.iou.toFixed(3)}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-surface-container-low p-3.5 text-xs text-on-surface-variant">
          <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p>
            <strong className="text-on-surface">Dataset Citation:</strong> {card.citation}
          </p>
        </div>
      </Panel>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel eyebrow="Telemetry Convergence" title="Training & Validation Curves">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={log}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c3a30" />
                <XAxis dataKey="epoch" stroke="#b9c9bc" fontSize={12} />
                <YAxis stroke="#b9c9bc" fontSize={12} domain={[0, 1]} />
                <Tooltip contentStyle={{ backgroundColor: "#04251b", borderColor: "#4f4633", color: "#f5f1e6" }} />
                <Legend />
                <Line type="monotone" dataKey="train_loss" name="Train Loss" stroke="#fbbf24" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="val_loss" name="Val Loss" stroke="#f43f5e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="val_iou" name="Val IoU" stroke="#d946ef" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="val_f1" name="Val F1" stroke="#4ade80" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          eyebrow="Ablation Comparison"
          title="VH Threshold Baseline vs U-Net (Labeled Splits)"
          subtitle={`${card.baseline_metrics.method} (${card.baseline_metrics.best_vh_threshold_db} dB)`}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c3a30" />
                <XAxis dataKey="split" stroke="#b9c9bc" fontSize={12} />
                <YAxis stroke="#b9c9bc" fontSize={12} domain={[0, 1]} />
                <Tooltip contentStyle={{ backgroundColor: "#04251b", borderColor: "#4f4633", color: "#f5f1e6" }} />
                <Legend />
                <Bar dataKey="VH Baseline IoU" fill="#4f4633" radius={[4, 4, 0, 0]} />
                <Bar dataKey="U-Net IoU" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                <Bar dataKey="VH Baseline F1" fill="#205240" radius={[4, 4, 0, 0]} />
                <Bar dataKey="U-Net F1" fill="#4ade80" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Confusion Matrices + Splits + Limitations */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel eyebrow="Pixel Classification" title="Confusion Matrices (Valid Pixels Only)">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(["test", "bolivia"] as const).map((split) => {
              const m = card.metrics[split];
              const cm = m.confusion_matrix ?? [
                [0, 0],
                [0, 0],
              ];
              return (
                <div key={split} className="rounded-xl bg-surface-container-high p-4 text-xs">
                  <div className="mb-2 flex items-center justify-between font-mono">
                    <span className="font-bold uppercase text-primary">{split} split</span>
                    <span className="text-secondary">
                      P {m.precision.toFixed(2)} · R {m.recall.toFixed(2)}
                    </span>
                  </div>
                  <table className="w-full border-collapse text-center font-mono">
                    <thead>
                      <tr className="text-on-surface-variant">
                        <th className="p-1" />
                        <th className="p-1">Pred Dry</th>
                        <th className="p-1">Pred Water</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th className="p-1 text-left text-on-surface-variant">True Dry</th>
                        <td className="border border-outline-variant/40 bg-surface-container-low p-2">
                          {cm[0][0].toLocaleString()}
                        </td>
                        <td className="border border-outline-variant/40 bg-surface-container-low p-2 text-primary">
                          {cm[0][1].toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <th className="p-1 text-left text-on-surface-variant">True Water</th>
                        <td className="border border-outline-variant/40 bg-surface-container-low p-2 text-error">
                          {cm[1][0].toLocaleString()}
                        </td>
                        <td className="border border-outline-variant/40 bg-surface-container-low p-2 text-verified-mint">
                          {cm[1][1].toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <div className="mb-2 flex justify-between font-mono text-xs text-on-surface-variant">
              <span>Sen1Floods11 Official Hand-Labeled Splits</span>
              <span>{totalChips} chips total</span>
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-container-low">
              <div className="bg-primary-container" style={{ width: `${(card.split_sizes.train / totalChips) * 100}%` }} />
              <div className="bg-secondary" style={{ width: `${(card.split_sizes.val / totalChips) * 100}%` }} />
              <div className="bg-tertiary" style={{ width: `${(card.split_sizes.test / totalChips) * 100}%` }} />
              <div className="bg-warning-orange" style={{ width: `${(card.split_sizes.bolivia / totalChips) * 100}%` }} />
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2 text-center font-mono text-[11px]">
              <div><span className="text-primary">Train:</span> {card.split_sizes.train}</div>
              <div><span className="text-secondary">Val:</span> {card.split_sizes.val}</div>
              <div><span className="text-tertiary">Test:</span> {card.split_sizes.test}</div>
              <div><span className="text-warning-orange">Bolivia:</span> {card.split_sizes.bolivia}</div>
            </div>
          </div>
        </Panel>

        <Panel
          eyebrow="Operational Guardrails"
          title="Known Limitations & Domain Shift"
          right={<AlertCircle className="h-5 w-5 text-primary-container" aria-hidden="true" />}
        >
          <ul className="space-y-2">
            {card.limitations.map((lim) => (
              <li key={lim} className="flex items-start gap-2.5 rounded-xl bg-surface-container-high p-3 text-xs text-on-surface">
                <span className="mt-0.5 font-mono text-primary-container">•</span>
                <span>{lim}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 rounded-xl border border-primary-container/40 bg-primary-container/15 p-3 font-mono text-xs text-primary">
            {card.karnataka_validation_note}
          </div>
        </Panel>
      </div>

      {/* Scene Catalog */}
      <Panel
        eyebrow="Raster Ingestion Catalog"
        title="Planetary Computer Sentinel-1 RTC Scenes"
        subtitle="Grouped by orbit direction and relative orbit for consistent incidence geometry"
        right={<Badge tone="mint"><Satellite className="h-3.5 w-3.5" /> {scenes.length} scenes</Badge>}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="bg-surface-container-low text-on-surface-variant">
                <th className="p-2.5">Scene ID</th>
                <th className="p-2.5">Acquisition (UTC)</th>
                <th className="p-2.5">Orbit</th>
                <th className="p-2.5">Polarizations</th>
                <th className="p-2.5">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {scenes.map((s) => (
                <tr key={s.id} className="hover:bg-surface-container-high/60">
                  <td className="p-2.5 text-primary">{s.id}</td>
                  <td className="p-2.5 text-on-surface-variant">{s.datetime}</td>
                  <td className="p-2.5 text-on-surface">
                    {s.orbit_direction} (rel {s.relative_orbit})
                  </td>
                  <td className="p-2.5">{s.polarizations.join(", ")}</td>
                  <td className="p-2.5">
                    {s.selected_role ? (
                      <Badge tone={s.selected_role === "after" ? "fuchsia" : "mint"}>
                        {s.selected_role.toUpperCase()}
                      </Badge>
                    ) : (
                      <span className="text-on-surface-variant">Catalog</span>
                    )}
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
