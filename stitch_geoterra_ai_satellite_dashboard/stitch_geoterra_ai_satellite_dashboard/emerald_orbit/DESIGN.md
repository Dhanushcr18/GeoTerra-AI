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
  secondary: '#a6d0bd'
  on-secondary: '#0e372a'
  secondary-container: '#274e40'
  on-secondary-container: '#95beac'
  tertiary: '#72ff9e'
  on-tertiary: '#003919'
  tertiary-container: '#4fe284'
  on-tertiary-container: '#00612f'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdf9f'
  primary-fixed-dim: '#f9bd22'
  on-primary-fixed: '#261a00'
  on-primary-fixed-variant: '#5c4300'
  secondary-fixed: '#c1ecd9'
  secondary-fixed-dim: '#a6d0bd'
  on-secondary-fixed: '#002117'
  on-secondary-fixed-variant: '#274e40'
  tertiary-fixed: '#6dfe9c'
  tertiary-fixed-dim: '#4de082'
  on-tertiary-fixed: '#00210c'
  on-tertiary-fixed-variant: '#005227'
  background: '#001710'
  on-background: '#c8eada'
  surface-variant: '#1c3a30'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-xl:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  mono-metric-lg:
    fontFamily: JetBrains Mono
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.03em
  mono-metric-md:
    fontFamily: JetBrains Mono
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.02em
  mono-data-sm:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.08em
  label-micro:
    fontFamily: JetBrains Mono
    fontSize: 9px
    fontWeight: '500'
    lineHeight: 12px
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
  gutter-mobile: 0.5rem
  margin: 1.5rem
  margin-mobile: 0.75rem
  space-xs: 0.5rem
  space-sm: 1rem
  space-md: 1.5rem
  space-lg: 2rem
  space-xl: 3rem
---

## Brand & Style

This design system drives a mission-critical orbital analytics platform engineered for civil protection authorities, disaster response agencies, and geospatial intelligence teams. The interface operates as an authoritative tactical observatory—calm under operational strain, optically balanced for extended command-room shifts, and capable of passing the 5-second cognitive comprehension test under severe crisis events.

### Visual Style: Emerald Orbit
The design language combines precision aerospace telemetry with an organic deep-canopy aesthetic. It strictly avoids generic tactical cyber-clichés (no blues, no cyans, no stark jet blacks) in favor of deep atmospheric forest emeralds, warm off-white data typography, and hyper-targeted semantic indicators. The UI achieves depth through:
- **Atmospheric Green-Glass Planes:** Translucent multi-depth emerald surfaces that separate telemetry feeds from live geospatial projections.
- **Micro-Luminescent Accents:** Intense semantic signals (fuchsia floods, lime simulations, coral blockades) suspended over dark, absorbent botanical surfaces.
- **Instrument-Grade Hierarchy:** Ultra-crisp data layouts where mission-critical key metrics cut through secondary operational telemetry without visual noise.

## Colors

The palette operates under an absolute prohibition against pure black (`#000000`), cyan, navy, and cold spectrum blues. Synthetic satellite synthetic-aperture radar (SAR) and land imagery emerge naturally over a grounding botanical spectrum.

### Surface Architecture & Canvas
- **Canvas Base:** `#0B2B21` (deep, dense forest green; absorbs glare, serves as map base and global viewport frame).
- **Surface / Card Layer 1:** `#11392C` at 85% opacity with 16px background blur (dark emerald green glass for spatial sidebars, floating trays, and metric cards).
- **Surface Layer 2 (Raised / Hover):** `#174A39` (used for elevated popovers, contextual inspection cards, and hovered list rows).
- **Surface Layer 3 (Active / Overlay):** `#1F5C47` (selected items, active telemetry triggers, modal surfaces).
- **Border / Structural Divider:** `rgba(245, 241, 230, 0.14)` (subtle warm cream hairline rule that keeps boundaries sharp without drawing the eye).

### Typography & Readability
- **Text Primary:** `#F5F1E6` (warm architectural cream; zero eye strain, extreme contrast against deep emerald).
- **Text Muted:** `#B9C9BC` (sage grey-green; structural labels, telemetry metadata, spatial coordinates, disabled state indicators).

### Operational Accents & Fixed Semantic Tokens
- **Primary Operational Focus (Gold / Amber):** `#FBBF24` (reserved strictly for single primary global CTAs, definitive crisis alert counts, focused state rings, and urgent dispatch buttons).
- **Flood Vector (SAR Detection):** `#D946EF` (vibrant optical fuchsia; cuts immediately through terrain data).
- **Permanent Water Body:** `#9D5CB5` (deep muted orchid; differentiates baseline hydrology from anomalous flood lines).
- **Critical Infrastructure / Severed Roads:** `#F43F5E` (coral crimson; blocked transportation routes, breached levees).
- **Land Change / Rapid Erosion / Warning:** `#FB923C` (luminous orange; soil saturation alerts, perimeter warnings).
- **Verified / Safe / Structural Integrity:** `#4ADE80` (radiant mint green; confirmed rescue vectors, validated defenses).
- **AI Synthetic Core / Predictive Modeling:** `#C4B5FD` (soft lilac; synthetic neural predictions, confidence cones).
- **Live Simulation Mode:** `#BEF264` (electric lime; active sandbox runs, projected temporal flood sequences).
- **Sample / Synthetic Test Data Badge:** `#FBBF24` paired with an alternating `#11392C` 45° angled micro-stripe texture.

## Typography

Typography balances rapid executive triage with high-density technical analysis.

### Structural Typographic Principles
1. **Separation of Prose & Metric Streams:** Standard UI controls, analytical summaries, status descriptions, and narrative alerts use **Inter** for organic, clear readability. All quantitative measurements, timestamps (UTC), GPS/MGRS coordinates, sensor confidence scores, and delta values render in **JetBrains Mono** to enforce strict vertical tabular alignment across dynamically updating cards.
2. **Tabular Numerals Everywhere:** All telemetry figures must employ `font-variant-numeric: tabular-nums` to prevent visual jitter during live sensor data streams.
3. **Monospaced Micro-Caps:** Eyebrow labels, sensor metadata tiers, and technical units (e.g., `km²`, `m³/s`, `dB`) are set in uppercase using `label-caps` or `label-micro` to ground complex control panels with military precision.

## Layout & Spacing

The layout is anchored to a strict **8px base grid** (increments of 8px, 16px, 24px, 32px, 48px).

### Layout Geometry
- **Primary Model:** Fixed operational toolbars and HUD panels layered over an edge-to-edge fluid viewport canvas.
- **Desktop (Mission Control View, >1280px):** Dynamic multi-pane docking system:
  - Left tactical drawer: 360px fixed width.
  - Central geospatial stage: fluid flex expansion.
  - Right sensor telemetry / analytics drawer: 420px fixed width.
  - Bottom chronological simulation scrubber: floating docked bar spanning 80% screen width.
- **Tablet (Field Command, 768px - 1279px):** Left drawer collapses to an icon bar (64px) expanding to a floating drawer on demand; right panel snaps into a swipeable bottom overlay sheet.
- **Mobile (Emergency Field Node, <768px):** Viewport prioritizes the incident map with stacked floating cards, safe area padding at top/bottom, and modal sheet telemetry readouts.

## Elevation & Depth

Visual hierarchy uses **tonal depth layering** augmented by emerald-tinted specular glass diffusion, eliminating synthetic black drop-shadows.

### Layer Hierarchy
1. **Base Layer (Ground Zero - z:0):** Raw planetary raster/vector canvas on `#0B2B21`.
2. **Level 1 (Docked Consoles & Floating Cards - z:10):** Background `#11392C` at 85% opacity, backdrop filter blur of `16px`, bordered by `1px solid rgba(245, 241, 230, 0.14)`. Shadow is an ambient diffusion: `0 8px 32px -4px rgba(7, 24, 18, 0.65)`.
3. **Level 2 (Hovered Cards & Interactive Trays - z:20):** Background `#174A39` at 92% opacity, backdrop blur `20px`, border `1px solid rgba(245, 241, 230, 0.22)`. Ambient glow: `0 12px 40px -6px rgba(5, 18, 14, 0.8)`.
4. **Level 3 (Emergency Drawers & Overlays - z:30):** Background `#1F5C47`, border `1px solid rgba(245, 241, 230, 0.35)`, outer spread: `0 20px 48px rgba(0, 0, 0, 0.3)`.
5. **Critical Alert Glow:** When elements carry active threat telemetry (e.g., Flood `#D946EF` or Critical `#F43F5E`), surfaces do not change background entirely; instead, they project a focused inner border glow (`box-shadow: inset 0 0 12px rgba(217, 70, 239, 0.25)`) and a `1px` high-luminance boundary.

## Shapes

The interface balances tactical modernism with refined ergonomics. Shapes use a calibrated rounded language between 12px and 16px for containers, avoiding both harsh brutalist points and over-softened consumer bubble aesthetics.

- **Standard Containers & Cards:** `12px` (equivalent to `rounded-lg`).
- **Major Modal Panes & Slide-over Drawers:** `16px` (equivalent to `rounded-xl`).
- **Interactive Micro-Controls (Inputs, Buttons, Tabs):** `8px` or `12px` depending on hierarchy.
- **Badges & Simulation Indicators:** Full pill (`9999px`) for quick categorization without conflicting with structural analytical grids.
- **Edge Architecture:** Every panel and card must feature an uninterrupted `1px` hairline stroke of `rgba(245, 241, 230, 0.14)`.

## Components

### Buttons
- **Primary Command CTA:** Background `#FBBF24`, text `#0B2B21` (weight 700), border none, radius 12px, hover `#F59E0B`. Reserved strictly for primary irreversible acts (e.g., "DEPLOY EVACUATION PROTOCOL", "EXPORT SITREP").
- **Secondary Action:** Background `#174A39`, text `#F5F1E6`, border `1px solid rgba(245, 241, 230, 0.14)`, radius 12px. On hover: background `#1F5C47`, border color `rgba(245, 241, 230, 0.25)`.
- **Tertiary / Utility Action:** Transparent background, text `#B9C9BC`, radius 8px, hover background `rgba(23, 74, 57, 0.5)` with text `#F5F1E6`.
- **Destructive / Hazard CTA:** Background `#F43F5E`, text `#F5F1E6`, radius 12px, hover background `#E11D48`.

### Status Badges & Chips
- **Structural Base:** JetBrains Mono, uppercase `label-micro`, padding 4px 10px, radius 9999px.
- **Flood Warning Chip:** Background `rgba(217, 70, 239, 0.15)`, text `#D946EF`, border `1px solid rgba(217, 70, 239, 0.4)`.
- **Simulation Badge:** Background `rgba(190, 242, 100, 0.15)`, text `#BEF264`, border `1px solid rgba(190, 242, 100, 0.4)`. Includes a pulsating 6px dot before text.
- **Sample Data Badge:** Background `#FBBF24` with alternating 4px diagonal stripes of `#11392C`, text `#0B2B21`, font-weight 700.
- **AI Neural Prediction Chip:** Background `rgba(196, 181, 253, 0.15)`, text `#C4B5FD`, border `1px solid rgba(196, 181, 253, 0.35)`.

### Cards & Metric HUD Tiles
- Glass surface: `#11392C` at 85% opacity, backdrop blur 16px, border `1px solid rgba(245, 241, 230, 0.14)`, radius 12px, padding `1.5rem`.
- **Metric Header:** Sage muted uppercase label (`label-caps`) in `#B9C9BC` at top.
- **Metric Value:** JetBrains Mono tabular numeric in `#F5F1E6` (`mono-metric-lg`), right-aligned or left-aligned depending on grid axis.
- **Delta Indicator:** Compact sub-row containing trend arrow and percentage colored in `#4ADE80` (safe/receding) or `#FB923C` / `#F43F5E` (expanding crisis).

### Input Fields & Search Bars
- Background `#0B2B21` at 80% opacity, border `1px solid rgba(245, 241, 230, 0.18)`, radius 8px, text `#F5F1E6`, placeholder `#B9C9BC` (50% opacity).
- **Focus State:** Border `#FBBF24` with an outer ring glow `0 0 0 2px rgba(251, 191, 36, 0.2)`.

### Checkboxes & Toggle Switches
- **Base Track / Box:** Background `#0B2B21`, border `1px solid rgba(245, 241, 230, 0.25)`, radius 4px (checkboxes) or 9999px (switches).
- **Selected State:** Background `#FBBF24`, checkmark/thumb color `#0B2B21`.
- **Layer Toggle Variation:** Specific satellite overlay toggles adopt their respective semantic accent color when checked (e.g., Flood Layer toggle switches to `#D946EF`).

### Telemetry Lists & Tables
- Borderless table styling with alternating zebra rows: default `#11392C` at 40% opacity, alternate `#174A39` at 30% opacity.
- Row heights locked to 40px (compact) or 52px (standard).
- Table headers set to `label-caps` in `#B9C9BC`, border bottom `1px solid rgba(245, 241, 230, 0.14)`.
- Numeric data columns strictly aligned right; status badges centered; entity names aligned left.