import React, { useRef, useState } from "react";
import { ArrowLeftRight } from "lucide-react";

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeAlt: string;
  afterAlt: string;
  beforeLabel: string;
  afterLabel: string;
  heightClass?: string;
}

export const BeforeAfterSlider: React.FC<BeforeAfterSliderProps> = ({
  beforeSrc,
  afterSrc,
  beforeAlt,
  afterAlt,
  beforeLabel,
  afterLabel,
  heightClass: _heightClass,
}) => {
  const [split, setSplit] = useState(50);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const updateFromClientX = (clientX: number) => {
    const el = boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100));
    setSplit(Math.round(pct));
  };

  return (
    <div className="space-y-3">
      <div
        ref={boxRef}
        onMouseMove={(e) => {
          if (dragging.current) updateFromClientX(e.clientX);
        }}
        onMouseUp={() => {
          dragging.current = false;
        }}
        onMouseLeave={() => {
          dragging.current = false;
        }}
        onTouchMove={(e) => {
          if (dragging.current && e.touches[0]) updateFromClientX(e.touches[0].clientX);
        }}
        onTouchEnd={() => {
          dragging.current = false;
        }}
        className={`relative aspect-[16/10] max-h-[360px] w-full overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-lowest select-none`}
      >
        <img src={afterSrc} alt={afterAlt} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
          <img src={beforeSrc} alt={beforeAlt} className="h-full w-full object-cover" />
        </div>
        <button
          type="button"
          aria-label="Drag comparison divider"
          onMouseDown={() => {
            dragging.current = true;
          }}
          onTouchStart={() => {
            dragging.current = true;
          }}
          className="absolute top-0 bottom-0 z-20 w-1 -ml-0.5 cursor-ew-resize bg-primary-container shadow-lg"
          style={{ left: `${split}%` }}
        >
          <span className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary-container text-on-primary-container shadow-xl">
            <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </button>
        <span className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-white/20 bg-[#001710]/90 px-2.5 py-1 font-mono text-xs font-semibold text-[#f5f1e6] shadow-md backdrop-blur-md">
          {beforeLabel}
        </span>
        <span className="pointer-events-none absolute bottom-3 right-3 rounded-lg border border-primary/40 bg-[#001710]/90 px-2.5 py-1 font-mono text-xs font-semibold text-primary shadow-md backdrop-blur-md">
          {afterLabel}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <label htmlFor="swipe-slider" className="font-mono text-xs text-on-surface-variant">
          Swipe Compare ({split}%)
        </label>
        <input
          id="swipe-slider"
          type="range"
          min={2}
          max={98}
          value={split}
          onChange={(e) => setSplit(Number(e.target.value))}
          aria-label="Before and after image comparison slider"
          className="h-2 flex-1 cursor-pointer accent-primary-container"
        />
      </div>
    </div>
  );
};
