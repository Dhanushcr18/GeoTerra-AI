"""End-to-end training (Sen1Floods11) + Planetary Computer STAC Bengaluru inference & export."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ml import config
from ml.src.dataset import read_split_csv
from ml.src.evaluate import tune_and_evaluate_baseline
from ml.src.export_results import export_pipeline_outputs, save_rgb_preview_png, save_sar_preview_png
from ml.src.infer import load_trained_unet, predict_flood_probability
from ml.src.postprocess import (
    clean_flood_mask,
    compute_impact_metrics,
    detect_land_change_polygons,
    polygonize_mask,
)
from ml.src.preprocess import read_s1_rtc_db, read_s2_l2a_indices, reproject_asset_to_grid
from ml.src.stac_fetch import search_auxiliary_item, search_sentinel1_scenes, select_before_after_pair
from ml.src.train import train_unet


def _discover_s1_windows():
    """Search configured S1 date ranges, falling back to recent archive monsoon/dry windows if empty."""
    flood_candidates = [config.DEFAULT_DATE_RANGE, "2024-09-01/2024-11-30", "2023-09-01/2023-11-30"]
    dry_candidates = [config.DRY_REFERENCE_RANGE, "2024-02-01/2024-04-30", "2023-02-01/2023-04-30"]

    flood_scenes = []
    for dr in flood_candidates:
        flood_scenes = search_sentinel1_scenes(
            bbox=config.DEFAULT_AOI_BBOX,
            datetime_range=dr,
            output_json_path=config.BACKEND_DATA_DIR / "scenes.json",
        )
        if flood_scenes:
            print(f"[STAC] Using S1 flood window: {dr}")
            break

    dry_scenes = []
    for dr in dry_candidates:
        dry_scenes = search_sentinel1_scenes(bbox=config.DEFAULT_AOI_BBOX, datetime_range=dr)
        if dry_scenes:
            print(f"[STAC] Using S1 dry reference window: {dr}")
            break

    return flood_scenes, dry_scenes


def _discover_s2_pair():
    """Search cloud-filtered Sentinel-2 L2A before/after items via Planetary Computer."""
    pairs = [
        (config.CHANGE_BEFORE_RANGE, config.CHANGE_AFTER_RANGE),
        ("2024-01-01/2024-03-31", "2024-10-01/2024-12-31"),
        ("2023-01-01/2023-03-31", "2023-10-01/2023-12-31"),
    ]
    for before_rng, after_rng in pairs:
        b_items = search_auxiliary_item(
            config.S2_COLLECTION,
            config.CHANGE_AOI_BBOX,
            before_rng,
            query={"eo:cloud_cover": {"lt": config.MAX_S2_CLOUD_COVER}},
            max_items=5,
        )
        a_items = search_auxiliary_item(
            config.S2_COLLECTION,
            config.CHANGE_AOI_BBOX,
            after_rng,
            query={"eo:cloud_cover": {"lt": config.MAX_S2_CLOUD_COVER}},
            max_items=5,
        )
        if b_items and a_items:
            b_best = min(b_items, key=lambda it: it.properties.get("eo:cloud_cover", 100.0))
            a_best = min(a_items, key=lambda it: it.properties.get("eo:cloud_cover", 100.0))
            print(f"[STAC] Selected S2 L2A before={b_best.id}, after={a_best.id}")
            return b_best, a_best
    return None, None


def main() -> None:
    parser = argparse.ArgumentParser(description="Run GeoTerra AI training and Planetary Computer inference.")
    parser.add_argument("--epochs", type=int, default=config.EPOCHS)
    parser.add_argument("--batch-size", type=int, default=config.BATCH_SIZE)
    parser.add_argument("--skip-train", action="store_true", help="Reuse existing checkpoints/best_model.pt")
    args = parser.parse_args()

    model_card_path = config.CHECKPOINTS_DIR / "model_card.json"
    ckpt_path = config.CHECKPOINTS_DIR / "best_model.pt"

    if args.skip_train and ckpt_path.exists() and model_card_path.exists():
        print("Reusing existing checkpoint and model_card.json...")
        model_card = json.loads(model_card_path.read_text(encoding="utf-8"))
    else:
        print("=== Step 1: Tuning VH Threshold Baseline on Validation Split ===")
        val_pairs = read_split_csv(config.SPLITS_DIR / "flood_valid_data.csv")
        test_pairs = read_split_csv(config.SPLITS_DIR / "flood_test_data.csv")
        bolivia_pairs = read_split_csv(config.SPLITS_DIR / "flood_bolivia_data.csv")
        baseline = tune_and_evaluate_baseline(val_pairs, test_pairs, bolivia_pairs)
        print(
            f"Baseline tuned VH={baseline['best_vh_threshold_db']} dB | "
            f"Test IoU={baseline['test']['iou']:.4f} F1={baseline['test']['f1']:.4f} | "
            f"Bolivia IoU={baseline['bolivia']['iou']:.4f} F1={baseline['bolivia']['f1']:.4f}"
        )
        config.CHECKPOINTS_DIR.mkdir(parents=True, exist_ok=True)
        (config.CHECKPOINTS_DIR / "baseline_metrics.json").write_text(json.dumps(baseline, indent=2), encoding="utf-8")

        print(f"=== Step 2: Training ResNet-34 U-Net (epochs={args.epochs}, batch_size={args.batch_size}) ===")
        model_card = train_unet(
            epochs=args.epochs,
            batch_size=args.batch_size,
            baseline_results=baseline,
        )
        print("Training complete. Model card metrics:", json.dumps(model_card["metrics"], indent=2))

    print("=== Step 3: Planetary Computer STAC Search & Bengaluru Inference ===")
    flood_scenes, dry_scenes = _discover_s1_windows()
    if not flood_scenes:
        raise RuntimeError("No Sentinel-1 RTC scenes found on Planetary Computer for Bengaluru AOI.")

    before_scene, after_scene = select_before_after_pair(flood_scenes, dry_scenes)
    assert after_scene is not None
    print(f"Selected S1 BEFORE: {before_scene['id'] if before_scene else 'None'}")
    print(f"Selected S1 AFTER : {after_scene['id']}")

    # Use a focused Bengaluru South/East sub-bbox for crisp 10m inference & preview speed
    infer_bbox = (77.55, 12.85, 77.78, 13.06)
    s1_after_db, profile = read_s1_rtc_db(after_scene["_item"], bbox=infer_bbox)
    s1_before_db, _ = (
        read_s1_rtc_db(before_scene["_item"], bbox=infer_bbox) if before_scene else (s1_after_db, profile)
    )
    print(f"S1 array shape: {s1_after_db.shape}, dB range: [{s1_after_db.min():.2f}, {s1_after_db.max():.2f}]")

    model, mean, std, device = load_trained_unet(ckpt_path)
    prob_after, raw_mask_after = predict_flood_probability(s1_after_db, model, mean, std, device)
    prob_before, raw_mask_before = predict_flood_probability(s1_before_db, model, mean, std, device)

    jrc_items = search_auxiliary_item(config.JRC_GSW_COLLECTION, infer_bbox, max_items=1)
    perm_water = None
    if jrc_items:
        occ = reproject_asset_to_grid(jrc_items[0].assets["occurrence"].href, profile)
        perm_water = occ >= 80

    # Compare before (dry) vs after (monsoon) while subtracting JRC permanent water
    net_new_water = np.logical_and(raw_mask_after > 0, raw_mask_before == 0)
    candidate_mask = net_new_water if net_new_water.sum() > 200 else raw_mask_after
    flood_mask = clean_flood_mask(candidate_mask, permanent_water_mask=perm_water)
    flood_gdf = polygonize_mask(flood_mask, profile, prob_raster=prob_after)
    perm_water_gdf = (
        polygonize_mask(clean_flood_mask(perm_water.astype(np.uint8), min_pixels=40), profile)
        if perm_water is not None
        else None
    )

    wc_items = search_auxiliary_item(config.WORLDCOVER_COLLECTION, infer_bbox, max_items=1)
    wc_arr = reproject_asset_to_grid(wc_items[0].assets["map"].href, profile) if wc_items else None

    impact = compute_impact_metrics(
        flood_gdf,
        flood_mask,
        profile,
        worldcover_arr=wc_arr,
        bbox=infer_bbox,
        permanent_water_gdf=perm_water_gdf,
    )
    print("Karnataka Flood Prediction (UNVALIDATED):", {k: v for k, v in impact.items() if k != "assets_gdf"})

    # Sentinel-2 L2A land-change module
    s2_before_item, s2_after_item = _discover_s2_pair()
    if s2_before_item is None or s2_after_item is None:
        raise RuntimeError("No cloud-filtered Sentinel-2 L2A pair found on Planetary Computer.")

    s2_b_idx, s2_profile = read_s2_l2a_indices(s2_before_item, bbox=config.CHANGE_AOI_BBOX)
    s2_a_idx, _ = read_s2_l2a_indices(s2_after_item, bbox=config.CHANGE_AOI_BBOX)
    water_gdf = polygonize_mask(perm_water.astype(np.uint8), profile) if perm_water is not None else None
    change_gdf, change_summary = detect_land_change_polygons(s2_b_idx, s2_a_idx, s2_profile, water_gdf=water_gdf)
    print("Land-change summary:", change_summary)

    # Save real preview PNGs
    img_dir = config.BACKEND_IMAGES_DIR
    save_sar_preview_png(s1_before_db, img_dir / "s1_before.png", f"S1 RTC Before ({before_scene['datetime'][:10] if before_scene else 'ref'})")
    save_sar_preview_png(s1_after_db, img_dir / "s1_after.png", f"S1 RTC After ({after_scene['datetime'][:10]})")
    save_sar_preview_png(s1_after_db, img_dir / "flood_overlay.png", "U-Net Flood Prediction (Unvalidated)", overlay_mask=flood_mask)
    save_rgb_preview_png(s2_b_idx["rgb"], img_dir / "s2_before.png", f"Sentinel-2 Before ({s2_before_item.datetime.strftime('%Y-%m-%d')})")
    save_rgb_preview_png(s2_a_idx["rgb"], img_dir / "s2_after.png", f"Sentinel-2 After ({s2_after_item.datetime.strftime('%Y-%m-%d')})")
    save_rgb_preview_png(s2_a_idx["rgb"], img_dir / "change_overlay.png", "NDVI Drop + BSI Change Overlay")

    # Derive settlement proximity records from flood polygons if OSM didn't populate settlements
    settlements = []
    if not flood_gdf.empty:
        top_zones = flood_gdf.sort_values("area_ha", ascending=False).head(5)
        for idx, (_, row) in enumerate(top_zones.iterrows()):
            pt = row.geometry.centroid
            area_v = float(row["area_ha"])
            prio = "high" if area_v >= 25.0 else ("medium" if area_v >= 8.0 else "low")
            settlements.append(
                {
                    "name": f"Bengaluru Catchment Zone {idx + 1}",
                    "lat": round(float(pt.y), 5),
                    "lon": round(float(pt.x), 5),
                    "population_estimate": None,
                    "priority": prio,
                }
            )

    results_path = export_pipeline_outputs(
        model_card=model_card,
        scenes=flood_scenes,
        flood_gdf=flood_gdf,
        assets_gdf=impact["assets_gdf"],
        change_gdf=change_gdf,
        flood_summary=impact,
        change_summary=change_summary,
        scene_before_id=before_scene["id"] if before_scene else "N/A",
        scene_after_id=after_scene["id"],
        date_before=before_scene["datetime"][:10] if before_scene else "",
        date_after=after_scene["datetime"][:10],
        change_dates={
            "before": s2_before_item.datetime.strftime("%Y-%m-%d"),
            "after": s2_after_item.datetime.strftime("%Y-%m-%d"),
        },
        aoi_bbox=infer_bbox,
        settlements_affected=settlements,
    )
    print(f"SUCCESS: Exported real pipeline outputs (sample=False) to {results_path}")


if __name__ == "__main__":
    main()
