"""Configuration for the GeoTerra AI offline ML pipeline."""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Tuple

# Directory layout
ML_DIR = Path(__file__).resolve().parent
REPO_ROOT = ML_DIR.parent
DATA_DIR = ML_DIR / "data"
SEN1FLOODS11_DIR = DATA_DIR / "sen1floods11"
SPLITS_DIR = SEN1FLOODS11_DIR / "splits"
S1_HAND_DIR = SEN1FLOODS11_DIR / "S1Hand"
LABEL_HAND_DIR = SEN1FLOODS11_DIR / "LabelHand"
CHECKPOINTS_DIR = ML_DIR / "checkpoints"
KARNATAKA_CACHE_DIR = DATA_DIR / "karnataka"
BACKEND_DATA_DIR = REPO_ROOT / "backend" / "data"
BACKEND_IMAGES_DIR = BACKEND_DATA_DIR / "images"

# Sen1Floods11 v1.1 GCS paths (verified against cloudtostreet/Sen1Floods11 README & bucket)
GCS_BUCKET = "gs://sen1floods11/v1.1"
GCS_SPLITS = {
    "train": f"{GCS_BUCKET}/splits/flood_handlabeled/flood_train_data.csv",
    "val": f"{GCS_BUCKET}/splits/flood_handlabeled/flood_valid_data.csv",
    "test": f"{GCS_BUCKET}/splits/flood_handlabeled/flood_test_data.csv",
    "bolivia": f"{GCS_BUCKET}/splits/flood_handlabeled/flood_bolivia_data.csv",
}
GCS_S1_HAND = f"{GCS_BUCKET}/data/flood_events/HandLabeled/S1Hand"
GCS_LABEL_HAND = f"{GCS_BUCKET}/data/flood_events/HandLabeled/LabelHand"

# Preprocessing & training hyperparameters
SEED = 42
DB_CLIP_MIN = -30.0
DB_CLIP_MAX = 5.0
CROP_SIZE = 256
BATCH_SIZE = 8
NUM_WORKERS = 0
EPOCHS = 25
LEARNING_RATE = 3e-4
WEIGHT_DECAY = 1e-4
EARLY_STOP_PATIENCE = 8
ENCODER_NAME = "resnet34"
ENCODER_WEIGHTS = "imagenet"
IN_CHANNELS = 2
OUT_CHANNELS = 1
IGNORE_INDEX = -1
PROB_THRESHOLD = 0.5

# Baseline VH threshold search grid (tuned on validation split only)
VH_THRESHOLD_GRID = (-20.0, -19.0, -18.0, -17.5, -17.0, -16.5, -16.0, -15.5, -15.0, -14.0)

# Karnataka / Bengaluru AOI & STAC search defaults (configurable)
DEFAULT_AOI_NAME = "Bengaluru Urban & Peri-Urban Catchment"
DEFAULT_AOI_BBOX: Tuple[float, float, float, float] = (77.35, 12.75, 77.85, 13.20)
DEFAULT_DATE_RANGE = "2026-07-01/2026-11-25"
DRY_REFERENCE_RANGE = "2026-01-01/2026-04-30"
TARGET_UTM_CRS = "EPSG:32643"  # UTM Zone 43N for Bengaluru/Karnataka area calculations
MAX_STAC_SCENES = 20

# Inference & postprocessing
SPECKLE_FILTER_SIZE = 5
TILE_SIZE = 256
TILE_OVERLAP = 64
MIN_FLOOD_OBJECT_PIXELS = 25
MORPH_CLOSE_RADIUS = 2

# Sentinel-2 Land Change (second detection module)
CHANGE_SITE_NAME = "Yelahanka–Hebbal Peri-Urban Corridor"
CHANGE_AOI_BBOX: Tuple[float, float, float, float] = (77.52, 13.04, 77.66, 13.15)
CHANGE_BEFORE_RANGE = "2025-11-01/2026-01-31"
CHANGE_AFTER_RANGE = "2026-10-01/2026-11-25"
NDVI_DROP_THRESHOLD = 0.22
BARE_SOIL_INCREASE_THRESHOLD = 0.12
MIN_CHANGE_AREA_HA = 0.5
RIVER_BUFFER_METERS = 300.0
MAX_S2_CLOUD_COVER = 25.0

# Model card metadata
MODEL_NAME = "U-Net (ResNet-34, SMP)"
DATASET_NAME = "Sen1Floods11 hand-labeled"
DATASET_CITATION = (
    "Bonafilia, D., Tellman, B., Anderson, T., & Issenberg, E. (2020). "
    "Sen1Floods11: A Georeferenced Dataset to Train and Test Deep Learning Flood Algorithms "
    "for Sentinel-1. IEEE/CVF CVPR Workshops, pp. 210-211."
)
MODEL_LIMITATIONS: Tuple[str, ...] = (
    "Domain shift: trained on global Sen1Floods11 flood events and applied unvalidated to Bengaluru/Karnataka terrain.",
    "SAR speckle noise in single-date GRD/RTC imagery can cause isolated false positives without multi-temporal filtering.",
    "Urban radar layover, foreshortening, and building shadow in dense Bengaluru wards can mimic open-water backscatter.",
    "Flooded vegetation and paddy fields produce double-bounce backscatter rather than specular dark returns.",
)

# Planetary Computer STAC endpoint & collections
STAC_API_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
S1_COLLECTION = "sentinel-1-rtc"
S2_COLLECTION = "sentinel-2-l2a"
JRC_GSW_COLLECTION = "jrc-gsw"
WORLDCOVER_COLLECTION = "esa-worldcover"

# Default fallback normalization stats (overwritten by train-split stats during training)
DEFAULT_CHANNEL_STATS: Dict[str, Tuple[float, float]] = {
    "mean": (-11.8, -18.5),
    "std": (4.6, 5.2),
}
