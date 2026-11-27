import React from "react";
import { AlertTriangle, Cpu, FlaskConical, Info, ShieldAlert } from "lucide-react";

export type BadgeTone = "gold" | "mint" | "fuchsia" | "lilac" | "coral" | "orange" | "lime" | "sage";

export const Badge: React.FC<{
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}> = ({ children, tone = "sage", className = "" }) => {
  const tones: Record<BadgeTone, string> = {
    gold: "bg-primary-container/20 text-primary border-primary-container/40",
    mint: "bg-tertiary-container/20 text-tertiary border-tertiary/40",
    fuchsia: "bg-flood-magenta/15 text-flood-magenta border-flood-magenta/40",
    lilac: "bg-tertiary-lilac/15 text-tertiary-lilac border-tertiary-lilac/40",
    coral: "bg-error-container/70 text-on-error-container border-error-vivid/50",
    orange: "bg-warning-orange/20 text-warning-orange border-warning-orange/50",
    lime: "bg-sim-lime text-sim-ink border-sim-lime/80",
    sage: "bg-surface-container-high text-secondary border-outline-variant/40",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wide ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
};

export const UnvalidatedBadge: React.FC = () => (
  <Badge tone="gold">
    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
    Model prediction (unvalidated)
  </Badge>
);

export const SimulationBadge: React.FC = () => (
  <Badge tone="lime" className="font-bold tracking-widest uppercase">
    <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
    SIMULATION
  </Badge>
);

export const AssumptionTag: React.FC<{ label?: string }> = ({ label = "Assumption" }) => (
  <Badge tone="sage">
    <Info className="h-3 w-3" aria-hidden="true" />
    {label}
  </Badge>
);

export const AITagBadge: React.FC<{ label?: string }> = ({
  label = "AI-assisted, requires official verification",
}) => (
  <Badge tone="lilac">
    <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
    {label}
  </Badge>
);

export const Panel: React.FC<{
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, eyebrow, right, children, className = "" }) => (
  <section className={`eo-glass rounded-xl p-5 transition-colors ${className}`}>
    {(title || right || eyebrow) && (
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          {eyebrow && (
            <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary">
              {eyebrow}
            </p>
          )}
          {title && <h2 className="text-lg font-semibold text-on-surface">{title}</h2>}
          {subtitle && <p className="mt-0.5 text-xs text-secondary">{subtitle}</p>}
        </div>
        {right}
      </div>
    )}
    {children}
  </section>
);

export const LoadingSkeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div className="space-y-4 animate-pulse" aria-label="Loading mission telemetry">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-32 rounded-xl bg-surface-container border border-outline-variant/20" />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-28 rounded-xl bg-surface-container border border-outline-variant/20" />
    ))}
  </div>
);

export const ErrorBox: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div
    role="alert"
    className="flex flex-col items-start gap-3 rounded-xl border border-error-vivid/50 bg-error-container/40 p-5 text-on-error-container"
  >
    <div className="flex items-center gap-2 font-semibold">
      <ShieldAlert className="h-5 w-5 text-error-vivid" aria-hidden="true" />
      <span>Telemetry or API Error</span>
    </div>
    <p className="text-sm">{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg bg-primary-container px-3.5 py-1.5 font-mono text-xs font-semibold text-on-primary-container hover:bg-primary-fixed-dim"
      >
        Retry Connection
      </button>
    )}
  </div>
);
