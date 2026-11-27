# GeoTerra AI — Bengaluru Geospatial Intelligence & Emergency Response Platform

> **Satellites see it. AI measures it. Authorities act on it.**  
> Built for **Aeromania '26 Mach-A-Thon** (*Orbit to Economy: AI in Space*), combining multi-sensor Earth Observation (Sentinel-1 SAR, Sentinel-2 Optical, Landsat 8/9 Thermal, Copernicus DEM GLO-30) with an interactive FastAPI + React mission-control platform and optional NVIDIA NIM AI reasoning.

---

## Key Capabilities

### 1. Unified Bengaluru Monitoring Map & AI Prediction Engine (`/engine`)
- **6 Flagship Monitoring Sites:** Interactive clickable markers for **Hebbal Valley**, **Koramangala–Chellaghatta Valley**, **Vrishabhavathi Valley**, **Whitefield**, **Bellandur Lake**, and **Varthur Lake** with multi-date satellite previews, environmental telemetry, and risk badges.
- **4 Connected AI Prediction Modules:**
  - **Flood Risk Prediction (`/predict`, `/flood`):** Sentinel-1 RTC SAR backscatter, Copernicus DEM GLO-30 elevation/slope, drainage basins, and Open-Meteo rainfall.
  - **Urban Growth Prediction (`/urban`):** Multi-year dry-season Sentinel-2 (`2019 → 2022 → 2024 → 2026`) built-up expansion, active construction (`BSI`), vegetation loss (`NDVI`), and `+3y / +5y / +7y` capacity-damped forecasts.
  - **Heat Risk Prediction (`/hazards`, `/heat`):** Landsat 8/9 Collection 2 Level-2 thermal (`lwir11` calibrated to Land Surface Temperature `LST °C`) fused with 10 m Sentinel-2 imagery, Open-Meteo 2 m air-temperature benchmarking, tree-cooling targets, and `+3y / +5y / +7y` estimates.
  - **Lake Health Prediction (`/lakes`):** Multi-date Sentinel-2 (`2024 → 2025 → 2026`) water spread, shrinkage tracking, and 250 m buffer `NDBI`/`NDVI` shifts across 8 Bengaluru lakes with interactive Before/After swipe comparisons.

### 2. Consolidated Environmental & Critical Infrastructure Observatory (`/hazards`)
- Unified sub-navbar workspace housing **Urban Heat**, **Critical Infrastructure Protection (`/infrastructure`)**, and **Land Change (`/change`)** on one page, with deep-link routes preserved.
- Screens 14 critical Bengaluru assets & 4 lifeline corridors (*Roads & Bridges*, *Metro*, *Power Grid*, *Water / STP*) against DEM flood susceptibility, Sentinel-1 flood extent, Sentinel-2 buffer disturbance, and Landsat heat hotspots.

### 3. Satellite → HAPS → Drone Emergency Response Simulation (`/simulation`)
- Digital-twin mission-control workflow across 4 Bengaluru emergency scenarios.
- Demonstrates automated alert detection, **Satellite** observation, **HAPS** (~20 km stratospheric relay), animated **UAV/Drone** dispatch on an interactive Leaflet map (OSM + Esri World Imagery), simulated aerial inspection previews, and Stage 5 report generation.

### 4. NVIDIA NIM AI Assistant & Evidence PDF Reports (`/alerts`)
- Grounded AI explainers (`temperature=0.2`) across flood risk, lake health, urban growth, urban heat, infrastructure screening, emergency triage, and Q&A.
- Deterministic cache (`backend/cache/`) + template fallback so the platform runs smoothly even without an API key or internet access.
- One-click downloadable **`GeoTerra_Evidence_Report.pdf`** (`POST /api/report/pdf`) bundling satellite observations, 6-site & 4-module predictions, and simulated Satellite → HAPS → Drone inspection evidence.

---

## Responsible Use, Guardrails & Disclaimers

- **Protective Civil Use Only:** Designed strictly for disaster monitoring, early warning, infrastructure resilience, and urban environmental planning. No tracking of individual people or vehicles; all analytics are area-level.
- **Simulation Notice:** Satellite tasking, HAPS relays, and Drone dispatches in `/simulation` are **digital-twin simulations** (`SIMULATION` badge). No real satellites, HAPS platforms, or drones are controlled.
- **AI & Remote-Sensing Verification:**
  - All AI outputs carry **`AI-assisted, requires official verification`**.
  - Infrastructure alerts are **`AI Risk Screens != Verified Incidents`** and require ground engineering inspection.
  - Lake/land boundary changes require **official cadastral/ground survey verification** before any administrative conclusion.
- **LST vs. Air Temperature:** Satellite Land Surface Temperature (`LST °C`) measures ground/rooftop skin temperature and is typically higher than shaded 2 m weather-station air temperature; both are explicitly separated in the UI.
- **Forecasts as Estimates:** `+3y / +5y / +7y` urban growth and heat projections are statistical trend estimates, not guaranteed outcomes.
- **Unvalidated Field Predictions:** Where ground-truth flood labels do not exist (e.g., Karnataka inference), predictions are tagged **`Model prediction (unvalidated)`**; quantitative IoU/F1 metrics are reported strictly on labeled `Sen1Floods11` splits (`/model`).

---

## Architecture & Repository Layout

```text
GeoTerra-AI/
├── backend/
│   ├── .env.example                 # Template for optional NVIDIA NIM config (no keys committed)
│   ├── requirements.txt             # FastAPI, Uvicorn, Pydantic, OpenAI SDK, ReportLab, Pillow, httpx
│   ├── app/
│   │   ├── main.py                  # FastAPI routes & static/image endpoints
│   │   ├── config.py                # Environment & NIM configuration loader
│   │   ├── schemas.py               # Pydantic request/response models
│   │   ├── nim_client.py            # NVIDIA NIM LLM/VLM client + SHA-256 cache + deterministic fallback
│   │   ├── prediction_engine.py     # Unified 6-site + 4-module Bengaluru prediction engine
│   │   ├── flood_prediction.py      # DEM, drainage, rainfall & Sentinel-1 flood risk module
│   │   ├── lake_monitoring.py       # 8-lake Sentinel-2 water & buffer shift engine
│   │   ├── urban_expansion.py       # 10-corridor multi-year Sentinel-2 growth & +3y/+5y/+7y engine
│   │   ├── urban_heat.py            # Landsat 8/9 LST + Sentinel-2 10m fusion & cooling targets
│   │   ├── infrastructure_protection.py # 14-asset & 4-corridor multi-hazard screening
│   │   ├── emergency_sim.py         # Satellite -> HAPS -> Drone Bengaluru mission scenarios
│   │   ├── image_utils.py           # Percentile stretch, Lanczos & thermal fusion PNG renderers
│   │   └── report.py                # ReportLab multi-section PDF evidence generator
│   ├── data/                        # Precomputed GeoJSONs, JSON metrics & HD satellite/overlay PNGs
│   └── cache/                       # Local SHA-256 NIM response cache (ignored in git)
├── frontend/
│   ├── package.json                 # React 18, Vite, TypeScript, Tailwind, Leaflet, Recharts, Lucide
│   └── src/
│       ├── App.tsx                  # Router configuration
│       ├── api/client.ts            # Typed API client
│       ├── types/index.ts           # Shared TypeScript interfaces
│       ├── components/              # Layout, Map overlays, BeforeAfterSlider, UI primitives
│       └── pages/                   # Overview, PredictionEngine, Flood, Lakes, Urban,
│                                    # EnvironmentSuite (Heat/Infra/Change), Simulation, Model, Impact, Alerts, About
├── ml/
│   ├── config.py
│   ├── requirements.txt
│   ├── notebooks/                   # Sen1Floods11 ingestion, baseline, U-Net training & Karnataka inference
│   ├── src/                         # Dataset, U-Net model, training, evaluation, STAC fetch & postprocessing
│   └── checkpoints/                 # Local model weights (*.pt ignored in git)
├── scripts/
│   ├── generate_sample_data.py
│   └── prewarm_cache.py
├── .gitignore                       # Excludes .env, *.h5, *.pt, caches, node_modules, dist
└── README.md
```

---

## Frontend Routes

| Route | View |
|---|---|
| `/` | Executive Overview & Bengaluru Mission Summary |
| `/engine` | Unified 6-Site Monitoring Map & 4-Module AI Prediction Engine |
| `/flood` | Sentinel-1 SAR Flood Monitor & Before/After Swipe |
| `/predict` | Multi-Factor Flood Risk Prediction |
| `/lakes` | Bengaluru Lake Spread & Health Monitoring |
| `/urban` | Multi-Year Urban Expansion & `+3y / +5y / +7y` Forecast |
| `/hazards` | Consolidated Observatory (Urban Heat, Critical Infrastructure, Land Change) |
| `/heat`, `/infrastructure`, `/change` | Deep-links into the Consolidated Observatory tabs |
| `/simulation` | Satellite → HAPS → Drone Emergency Response Digital Twin |
| `/model` | Sen1Floods11 Validation Metrics, Confusion Matrix & STAC Catalog |
| `/impact` | Economic Exposure & Days-vs-Hours Impact Analysis |
| `/alerts` | Alert Triage, Grounded AI Q&A & PDF Evidence Report Export |
| `/about` | Methodology, Data Sources & Guardrails |

---

## Backend API Endpoints

- **System & Core Data:** `GET /api/status`, `GET /api/results`, `GET /api/geo/{layer}`, `GET /api/scenes`, `GET /api/model`
- **Imagery:** `GET /api/images/crop`, `GET /api/images/{name}`, `GET /api/images/lakes/{name}`, `GET /api/images/urban/{name}`, `GET /api/images/heat/{name}`, `GET /api/images/infra/{name}`
- **Domain Modules:**
  - `GET /api/prediction-engine` & `POST /api/prediction-engine/explain`
  - `GET /api/flood-prediction` & `POST /api/flood-prediction/explain`
  - `GET /api/lake-monitoring` & `POST /api/lake-monitoring/explain`
  - `GET /api/urban-expansion` & `POST /api/urban-expansion/explain`
  - `GET /api/urban-heat` & `POST /api/urban-heat/explain`
  - `GET /api/infrastructure` & `POST /api/infrastructure/explain`
  - `GET /api/simulation/missions` & `POST /api/simulation/explain`
- **AI & Reporting:** `POST /api/ai/alert`, `POST /api/ai/describe-site`, `POST /api/ai/triage`, `POST /api/ai/ask`, `POST /api/report/pdf`

---

## Quickstart (Local Development)

No `NVIDIA_API_KEY` or GPU is required to run the full platform—precomputed Bengaluru datasets and deterministic AI fallbacks work out of the box.

### 1. Install Dependencies

```bash
pip install -r backend/requirements.txt
cd frontend && npm install && cd ..
```

### 2. *(Optional)* Configure NVIDIA NIM

Copy `backend/.env.example` to `backend/.env` and set your own key locally (never commit `backend/.env`):

```env
NVIDIA_API_KEY=your_nvidia_nim_key_here
NIM_LLM_MODEL=nvidia/nemotron-3.5-bolt-e4b
NIM_VLM_MODEL=nvidia/nemotron-3.5-super-vl-120b-a12b
NIM_BASE_URL=https://integrate.api.nvidia.com/v1
NIM_TIMEOUT_SECONDS=8.0
GEOTERRA_OFFLINE_ONLY=false
```

### 3. Run Backend & Frontend

**Terminal 1 — FastAPI Backend:**
```bash
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8010
```

**Terminal 2 — Vite React Frontend:**
```bash
# PowerShell:
$env:VITE_API_TARGET="http://127.0.0.1:8010"
cd frontend && npx vite --port 5175
```

```bash
# macOS / Linux:
VITE_API_TARGET=http://127.0.0.1:8010 npm --prefix frontend run dev -- --port 5175
```

Open `http://localhost:5175` in your browser.
