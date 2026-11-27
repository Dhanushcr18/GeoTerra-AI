---
name: Emerald Orbit
colors:
  surface: '#001710'
  surface-dim: '#001710'
  surface-bright: '#203f34'
  surface-container-lowest: '#00120b'
  surface-container-low: '#012017'
  surface-container: '#04251b'
  surface-container-high: '#102f25'
  surface-container-highest: '#1c3a30'
  on-surface: '#c8eada'
  on-surface-variant: '#d3c5ac'
  inverse-surface: '#c8eada'
  inverse-on-surface: '#17362b'
  outline: '#9c8f79'
  outline-variant: '#4f4633'
  surface-tint: '#f9bd22'
  primary: '#ffe1a7'
  on-primary: '#402d00'
  primary-container: '#fbbf24'
  on-primary-container: '#6c4f00'
  inverse-primary: '#795900'
  secondary: '#9ed2bb'
  on-secondary: '#003828'
  secondary-container: '#205240'
  on-secondary-container: '#90c3ad'
  tertiary: '#ffd9fd'
  on-tertiary: '#580065'
  tertiary-container: '#fbaeff'
  on-tertiary-container: '#9100a6'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdf9f'
  primary-fixed-dim: '#f9bd22'
  on-primary-fixed: '#261a00'
  on-primary-fixed-variant: '#5c4300'
  secondary-fixed: '#b9eed6'
  secondary-fixed-dim: '#9ed2bb'
  on-secondary-fixed: '#002116'
  on-secondary-fixed-variant: '#1d4f3e'
  tertiary-fixed: '#ffd6fd'
  tertiary-fixed-dim: '#fbabff'
  on-tertiary-fixed: '#36003e'
  on-tertiary-fixed-variant: '#7c008e'
  background: '#001710'
  on-background: '#c8eada'
  surface-variant: '#1c3a30'
typography:
  kpi-lg:
    fontFamily: JetBrains Mono
    fontSize: 64px
    fontWeight: '600'
    lineHeight: 72px
    letterSpacing: -0.02em
  kpi-lg-mobile:
    fontFamily: JetBrains Mono
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.02em
  kpi-md:
    fontFamily: JetBrains Mono
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.02em
  kpi-md-mobile:
    fontFamily: JetBrains Mono
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.06em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system powers GeoTerra AI, a space mission-control dashboard built for the "Orbit to Economy: AI in Space" hackathon. It is tailored for geospatial analysts, emergency response coordinators, and orbital data engineers who monitor real-time satellite telemetry, flood extent, and land-change anomalies under time-critical conditions.

The UI evokes calm authority, precision, and high-altitude clarity. Rather than relying on cold, conventional aerospace blues, the visual language pairs deep forest-green atmospheric surfaces with warm cream typography and luminous gold accents.

The design style blends **Glassmorphism** with **Tactile Telemetry**:
- **Translucent Glass Panels:** Frosted emerald surfaces with subtle cream borders and soft gold inner glows create layered depth without visual clutter.
- **High-Contrast Telemetry:** Tabular monospaced figures and distinct semantic hues ensure critical alerts, AI-generated insights, and geospatial overlays remain immediately legible.

## Colors

The palette is strictly dark-mode by default and **never uses blue, cyan, navy, indigo, or pure black (`#000000`)**. All depth, contrast, and semantic signaling are achieved through deep forest greens, warm cream, gold, and high-visibility botanical and mineral accents.

### Core Surfaces & Typography
- **Background:** `#0B2B21` (deep forest green)
- **Surface / Cards:** `#11392C` (translucent glass panels)
- **Surface-2 / Raised:** `#174A39` (elevated controls, hover states, and nested panels)
- **Text Primary:** `#F5F1E6` (warm cream; never pure white)
- **Text Muted:** `#B9C9BC` (sage)

### Interactive & Semantic Tokens
- **Primary / KPIs / Buttons:** `#FBBF24` (gold) paired with `#0B2B21` (deep forest green) ink
- **Flood Extent:** `#D946EF` (fuchsia)
- **Permanent Water:** `#9D5CB5` (muted orchid)
- **Affected Roads / Critical:** `#F43F5E` (coral red)
- **Suspicious Land-Change / Warnings:** `#FB923C` (orange)
- **Verified / Success:** `#4ADE80` (mint green)
- **AI-Generated Content:** `#C4B5FD` (soft lilac)
- **Simulation Badge:** `#BEF264` (lime)
- **Sample Data Banner:** `#FACC15` (yellow with diagonal `#0B2B21` dark-green stripes)

## Typography

The typographic hierarchy pairs **Inter** for clean, legible interface copy with **JetBrains Mono** for telemetry, coordinates, timestamps, and large KPI readouts.

- **Tabular Figures:** All `JetBrains Mono` styles—especially `kpi-lg` (64px) and `kpi-md` (48px)—must enforce `font-variant-numeric: tabular-nums` so live-updating metrics never cause horizontal layout shift.
- **Minimum Body Size:** Standard body copy (`body-md`) is set at `16px` to maintain effortless readability in low-light mission-control environments.
- **Responsive Scaling:** Display KPIs and large headlines step down to their `-mobile` variants below `768px` to preserve spatial balance on smaller viewports.

## Layout & Spacing

The dashboard uses a **12-column fluid grid** engineered to maximize geospatial map visibility while keeping telemetry panels anchored and scannable.

- **Desktop (`>= 1280px`):** 12 columns with `1rem` (`16px`) gutters and `1.5rem` (`24px`) outer canvas margins. Side telemetry rails span 3–4 columns, leaving 8–9 columns for the primary orbital map canvas.
- **Tablet (`768px – 1279px`):** 8-column fluid grid with `1rem` gutters. Secondary KPI cards reflow into a 2-column row above or below the map.
- **Mobile (`< 768px`):** 4-column fluid grid with `1rem` outer margins. Panels stack vertically, prioritizing the sample data banner, active map viewport, and critical alert feed.

## Elevation & Depth

Visual hierarchy is achieved through **Glassmorphism** and **Tonal Layering** rather than heavy drop shadows:

- **Glass Panels (`#11392C`):** Apply `backdrop-filter: blur(16px)` over the `#0B2B21` canvas or map layers. Frame each card with a `1px` translucent cream border (`rgba(245, 241, 230, 0.14)`) and a subtle inner glow in gold (`inset 0 1px 0 0 rgba(251, 191, 36, 0.08)`).
- **Raised Surfaces (`#174A39`):** Used for interactive controls, active tabs, and nested popovers to sit cleanly above base glass cards.
- **Deep-Green Shadows:** Whenever elevation requires an outer shadow, use deep forest green with alpha (`0 12px 32px -8px rgba(11, 43, 33, 0.65)`). Never use black (`#000000`) in any shadow definition.

## Shapes

The shape language is **Rounded** (`roundedness: 2`), balancing technical precision with approachable, modern ergonomics:

- **Cards & Glass Panels:** `12px` to `16px` border radius (`0.75rem` – `1rem`).
- **Buttons & Inputs:** `8px` (`0.5rem`) border radius for crisp, tactile targets.
- **Badges & Status Chips:** Full pill radius (`9999px`) to distinguish live telemetry tags, simulation indicators, and AI-generated labels from structural containers.

## Components

- **Buttons:** Primary actions use `#FBBF24` (gold) fill with `#0B2B21` (deep forest green) ink and `600` weight. Secondary actions use `#174A39` fill with `#F5F1E6` text and a `1px` `rgba(245, 241, 230, 0.14)` border.
- **Cards (KPI & Telemetry):** `#11392C` glass surface, `12px–16px` radius, `1px` translucent cream border, and `8%` gold inner glow. KPI values render in `JetBrains Mono` (`48px–64px`) with `#FBBF24` or semantic status colors, paired with `#B9C9BC` muted labels.
- **Chips & Badges:** Pill-shaped (`9999px`) with `label-sm` (`12px` `JetBrains Mono`). Use `#BEF264` for simulation badges, `#C4B5FD` for AI-generated content tags, and `#4ADE80` / `#FB923C` / `#F43F5E` for verification and alert states.
- **Input Fields:** `#0B2B21` recessed fill with `1px` `rgba(245, 241, 230, 0.14)` border, `#F5F1E6` input text, and `#B9C9BC` placeholders. Focus rings use `#FBBF24`.
- **Checkboxes & Radio Buttons:** `1px` cream-tinted borders on `#0B2B21` fill; checked states fill with `#FBBF24` and `#0B2B21` checkmarks.
- **Lists & Alert Feeds:** Stacked rows separated by `1px` `rgba(245, 241, 230, 0.08)` dividers, with hover states transitioning to `#174A39`.
- **Sample Data Banner:** Full-width top strip using `#FACC15` with diagonal `#0B2B21` stripes and `#0B2B21` bold monospaced text to clearly indicate simulated or hackathon sample feeds.
- **Map Layer Toggles:** Compact `#174A39` switches with color-coded indicator dots (`#D946EF` for flood extent, `#9D5CB5` for permanent water, `#F43F5E` for affected roads, `#FB923C` for suspicious land-change).