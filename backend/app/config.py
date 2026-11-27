"""Centralized backend configuration, NIM model settings, and single-source-of-truth assumptions."""

from __future__ import annotations

import os
from dataclasses import asdict, dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent
DATA_DIR = BACKEND_DIR / "data"
IMAGES_DIR = DATA_DIR / "images"
CACHE_DIR = BACKEND_DIR / "cache"

def get_nvidia_api_key() -> str:
    """Read NVIDIA_API_KEY dynamically from backend/.env or environment."""
    load_dotenv(BACKEND_DIR / ".env", override=True)
    return os.getenv("NVIDIA_API_KEY", "").strip()


def is_offline_only() -> bool:
    load_dotenv(BACKEND_DIR / ".env", override=True)
    return os.getenv("GEOTERRA_OFFLINE_ONLY", "false").lower() in {"1", "true", "yes"}


def get_llm_model() -> str:
    load_dotenv(BACKEND_DIR / ".env", override=True)
    return os.getenv("NIM_LLM_MODEL", "nvidia/nemotron-3.5-bolt-e4b").strip()


def get_vlm_model() -> str:
    load_dotenv(BACKEND_DIR / ".env", override=True)
    return os.getenv("NIM_VLM_MODEL", "nvidia/nemotron-3.5-super-vl-120b-a12b").strip()


NVIDIA_API_KEY: str = get_nvidia_api_key()
NIM_BASE_URL: str = os.getenv("NIM_BASE_URL", "https://integrate.api.nvidia.com/v1").strip()
LLM_MODEL: str = get_llm_model()
VLM_MODEL: str = get_vlm_model()
NIM_TIMEOUT_SECONDS: float = float(os.getenv("NIM_TIMEOUT_SECONDS", "8.0"))
OFFLINE_ONLY: bool = is_offline_only()


@dataclass(frozen=True)
class AssumptionsConfig:
    """Single config source for all economic, UAV, HAPS, and onboard-AI simulation assumptions."""

    loss_per_ha_inr: float = 65000.0
    assessment_time_manual_days: float = 14.0
    assessment_time_geoterra_hours: float = 2.5
    raw_scene_size_mb: float = 1200.0
    insight_packet_size_kb: float = 48.0
    downlink_rate_mbps: float = 12.0
    haps_altitude_km: float = 20.0
    haps_endurance_days: float = 30.0
    drone_endurance_min: float = 42.0
    drone_speed_kmh: float = 54.0
    onboard_processing_latency_sec: float = 45.0
    ground_queue_and_tasking_latency_min: float = 195.0

    def to_dict(self) -> dict:
        return asdict(self)


ASSUMPTIONS = AssumptionsConfig()
