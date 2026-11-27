"""Planetary Computer STAC discovery and asset signing for GeoTerra AI."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import planetary_computer
import pystac_client

from ml import config


def get_stac_client() -> pystac_client.Client:
    """Open Planetary Computer STAC API with automatic SAS token signing."""
    return pystac_client.Client.open(
        config.STAC_API_URL,
        modifier=planetary_computer.sign_inplace,
    )


def search_sentinel1_scenes(
    bbox: Tuple[float, float, float, float] = config.DEFAULT_AOI_BBOX,
    datetime_range: str = config.DEFAULT_DATE_RANGE,
    max_items: int = config.MAX_STAC_SCENES,
    output_json_path: Optional[Path] = None,
) -> List[Dict[str, Any]]:
    """Search sentinel-1-rtc scenes on Planetary Computer, print summary, and group orbit metadata."""
    client = get_stac_client()
    search = client.search(
        collections=[config.S1_COLLECTION],
        bbox=list(bbox),
        datetime=datetime_range,
        max_items=max_items,
    )
    item_collection = search.item_collection()
    items = list(item_collection)

    if not items:
        print(
            f"[STAC] No '{config.S1_COLLECTION}' scenes found for bbox={bbox}, datetime='{datetime_range}'.\n"
            "Try expanding the date range or AOI bounding box and verify collection coverage on "
            "https://planetarycomputer.microsoft.com/dataset/sentinel-1-rtc."
        )
        if output_json_path is not None:
            output_json_path.parent.mkdir(parents=True, exist_ok=True)
            output_json_path.write_text("[]", encoding="utf-8")
        return []

    scenes: List[Dict[str, Any]] = []
    for item in items:
        props = item.properties
        orbit_dir = props.get("sat:orbit_state", "unknown")
        rel_orbit = props.get("sat:relative_orbit", -1)
        pols = props.get("sar:polarizations", [])
        if "vv" not in [p.lower() for p in pols] or "vh" not in [p.lower() for p in pols]:
            # Check asset keys as fallback
            asset_keys = {k.lower() for k in item.assets.keys()}
            if not ({"vv", "vh"} <= asset_keys):
                continue

        scenes.append(
            {
                "id": item.id,
                "datetime": item.datetime.isoformat() if item.datetime else props.get("datetime", ""),
                "orbit_direction": str(orbit_dir),
                "relative_orbit": int(rel_orbit) if rel_orbit is not None else -1,
                "polarizations": [str(p).upper() for p in (pols or ["VV", "VH"])],
                "bbox": list(item.bbox) if item.bbox else list(bbox),
                "collection": config.S1_COLLECTION,
                "selected_role": None,
                "_item": item,
            }
        )

    scenes.sort(key=lambda s: s["datetime"])
    print(f"[STAC] Found {len(scenes)} dual-pol (VV+VH) Sentinel-1 RTC scenes:")
    for s in scenes:
        print(
            f"  - {s['id']} | {s['datetime']} | orbit={s['orbit_direction']} "
            f"(rel {s['relative_orbit']}) | pols={s['polarizations']}"
        )

    if output_json_path is not None:
        serializable = [{k: v for k, v in s.items() if k != "_item"} for s in scenes]
        output_json_path.parent.mkdir(parents=True, exist_ok=True)
        output_json_path.write_text(json.dumps(serializable, indent=2), encoding="utf-8")

    return scenes


def group_by_matching_orbit(scenes: List[Dict[str, Any]]) -> Dict[Tuple[str, int], List[Dict[str, Any]]]:
    """Group Sentinel-1 scenes by (orbit_direction, relative_orbit) for consistent geometry."""
    groups: Dict[Tuple[str, int], List[Dict[str, Any]]] = defaultdict(list)
    for s in scenes:
        groups[(s["orbit_direction"], int(s["relative_orbit"]))].append(s)
    return dict(groups)


def select_before_after_pair(
    flood_scenes: List[Dict[str, Any]],
    dry_scenes: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Select matching-orbit (before_dry, after_flood) pair."""
    if not flood_scenes:
        return None, None

    if dry_scenes:
        dry_groups = group_by_matching_orbit(dry_scenes)
        flood_groups = group_by_matching_orbit(flood_scenes)
        common_keys = set(dry_groups.keys()) & set(flood_groups.keys())
        if common_keys:
            best_key = max(common_keys, key=lambda k: len(flood_groups[k]) + len(dry_groups[k]))
            before = dry_groups[best_key][0]
            after = flood_groups[best_key][-1]
            before["selected_role"] = "before"
            after["selected_role"] = "after"
            return before, after

    groups = group_by_matching_orbit(flood_scenes)
    best_key = max(groups.keys(), key=lambda k: len(groups[k]))
    group = groups[best_key]
    if len(group) >= 2:
        before, after = group[0], group[-1]
        before["selected_role"] = "before"
        after["selected_role"] = "after"
        return before, after
    after = group[-1]
    after["selected_role"] = "after"
    return None, after


def search_auxiliary_item(
    collection: str,
    bbox: Tuple[float, float, float, float],
    datetime_range: Optional[str] = None,
    query: Optional[Dict[str, Any]] = None,
    max_items: int = 10,
) -> List[Any]:
    """Search auxiliary Planetary Computer collections (jrc-gsw, esa-worldcover, sentinel-2-l2a)."""
    client = get_stac_client()
    kwargs: Dict[str, Any] = {
        "collections": [collection],
        "bbox": list(bbox),
        "max_items": max_items,
    }
    if datetime_range:
        kwargs["datetime"] = datetime_range
    if query:
        kwargs["query"] = query
    items = list(client.search(**kwargs).item_collection())
    if not items:
        print(f"[STAC] Warning: no items found in '{collection}' for bbox={bbox}, datetime={datetime_range}.")
    return items
