"""Postprocessing, permanent water masking, UTM area/impact calculations, and Sentinel-2 land change."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import geopandas as gpd
import numpy as np
import requests
import xml.etree.ElementTree as ET
from rasterio.features import shapes
from shapely.geometry import LineString, Point, Polygon, shape
from skimage.morphology import binary_closing, disk, remove_small_objects

from ml import config


def clean_flood_mask(
    binary_mask: np.ndarray,
    permanent_water_mask: Optional[np.ndarray] = None,
    min_pixels: int = config.MIN_FLOOD_OBJECT_PIXELS,
    close_radius: int = config.MORPH_CLOSE_RADIUS,
) -> np.ndarray:
    """Exclude permanent water (JRC GSW), close small gaps, and remove tiny speckle objects."""
    mask = binary_mask.astype(bool)
    if permanent_water_mask is not None:
        mask = np.logical_and(mask, ~permanent_water_mask.astype(bool))
    if close_radius > 0:
        mask = binary_closing(mask, footprint=disk(close_radius))
    if min_pixels > 0:
        mask = remove_small_objects(mask, min_size=min_pixels)
    return mask.astype(np.uint8)


def polygonize_mask(
    mask: np.ndarray,
    profile: Dict[str, Any],
    prob_raster: Optional[np.ndarray] = None,
    extra_props: Optional[Dict[str, Any]] = None,
) -> gpd.GeoDataFrame:
    """Vectorize a binary raster mask into EPSG:4326 polygons with UTM-43N area_ha."""
    records: List[Dict[str, Any]] = []
    transform = profile["transform"]
    crs = profile["crs"]

    for geom_dict, val in shapes(mask.astype(np.uint8), mask=(mask > 0), transform=transform):
        if int(val) != 1:
            continue
        geom = shape(geom_dict)
        if not geom.is_valid:
            geom = geom.buffer(0)
        if geom.is_empty:
            continue
        props: Dict[str, Any] = {"geometry": geom}
        if extra_props:
            props.update(extra_props)
        records.append(props)

    if not records:
        return gpd.GeoDataFrame(columns=["geometry", "area_ha"], geometry="geometry", crs="EPSG:4326")

    gdf = gpd.GeoDataFrame(records, crs=crs)
    gdf_utm = gdf.to_crs(config.TARGET_UTM_CRS)
    gdf["area_ha"] = (gdf_utm.geometry.area / 10_000.0).round(3)
    if prob_raster is not None:
        gdf["mean_confidence"] = float(np.nanmean(prob_raster[mask > 0]))
    gdf_wgs84 = gdf.to_crs("EPSG:4326")
    gdf_wgs84["geometry"] = gdf_wgs84.geometry.simplify(0.00015, preserve_topology=True)
    return gdf_wgs84


def compute_impact_metrics(
    flood_gdf: gpd.GeoDataFrame,
    flood_mask: np.ndarray,
    profile: Dict[str, Any],
    worldcover_arr: Optional[np.ndarray] = None,
    bbox: Tuple[float, float, float, float] = config.DEFAULT_AOI_BBOX,
    osm_layers: Optional[Dict[str, gpd.GeoDataFrame]] = None,
    permanent_water_gdf: Optional[gpd.GeoDataFrame] = None,
) -> Dict[str, Any]:
    """Compute UTM-43N flood hectares, WorldCover cropland/built-up exposure, and OSM asset exposure."""
    if flood_gdf.empty:
        total_ha = 0.0
    else:
        flood_utm = flood_gdf.to_crs(config.TARGET_UTM_CRS)
        total_ha = round(float(flood_utm.geometry.area.sum() / 10_000.0), 2)

    pixel_area_ha = abs(profile["transform"].a * profile["transform"].e) / 10_000.0
    if str(profile["crs"]).upper().endswith("4326") and flood_mask.sum() > 0:
        pixel_area_ha = total_ha / max(int(flood_mask.sum()), 1)

    cropland_ha = 0.0
    built_up_ha = 0.0
    if worldcover_arr is not None:
        flood_bool = flood_mask > 0
        cropland_pixels = int(np.logical_and(flood_bool, worldcover_arr == 40).sum())
        built_pixels = int(np.logical_and(flood_bool, worldcover_arr == 50).sum())
        cropland_ha = round(cropland_pixels * pixel_area_ha, 2)
        built_up_ha = round(built_pixels * pixel_area_ha, 2)

    roads_affected_km = 0.0
    assets_records: List[Dict[str, Any]] = []
    infra_affected: List[Dict[str, Any]] = []

    if osm_layers is None:
        focus_pts: List[Tuple[float, float]] = []
        if not flood_gdf.empty:
            top_f = flood_gdf.sort_values("area_ha", ascending=False).head(8)
            focus_pts = [(float(r.geometry.centroid.y), float(r.geometry.centroid.x)) for _, r in top_f.iterrows()]
        osm_layers = fetch_osm_layers(bbox, focus_points=focus_pts)

    if permanent_water_gdf is not None and not permanent_water_gdf.empty:
        for idx, row in permanent_water_gdf.head(80).iterrows():
            assets_records.append(
                {
                    "layer_type": "permanent_water",
                    "type": "permanent_water",
                    "name": f"JRC Permanent Water #{idx + 1}",
                    "lat": round(float(row.geometry.centroid.y), 5),
                    "lon": round(float(row.geometry.centroid.x), 5),
                    "geometry": row.geometry,
                }
            )

    if not flood_gdf.empty and osm_layers:
        flood_union_utm = flood_gdf.to_crs(config.TARGET_UTM_CRS).geometry.unary_union
        roads_gdf = osm_layers.get("roads")
        if roads_gdf is not None and not roads_gdf.empty:
            roads_utm = roads_gdf.to_crs(config.TARGET_UTM_CRS)
            clipped_utm = roads_utm.geometry.intersection(flood_union_utm.buffer(15.0))
            valid_roads = clipped_utm[~clipped_utm.is_empty]
            roads_affected_km = round(float(valid_roads.length.sum() / 1000.0), 2)
            if not valid_roads.empty:
                roads_wgs = gpd.GeoSeries(valid_roads, crs=config.TARGET_UTM_CRS).to_crs("EPSG:4326")
                for idx, geom in enumerate(roads_wgs.head(120)):
                    assets_records.append(
                        {
                            "layer_type": "road",
                            "type": "road",
                            "name": f"Affected Road Segment #{idx + 1}",
                            "lat": round(float(geom.centroid.y), 5),
                            "lon": round(float(geom.centroid.x), 5),
                            "geometry": geom,
                        }
                    )

        buildings_gdf = osm_layers.get("buildings")
        if buildings_gdf is not None and not buildings_gdf.empty:
            b_utm = buildings_gdf.to_crs(config.TARGET_UTM_CRS)
            b_hit = b_utm.geometry.intersects(flood_union_utm.buffer(15.0))
            for idx, (_, row) in enumerate(buildings_gdf[b_hit].head(120).iterrows()):
                pt = row.geometry.centroid
                assets_records.append(
                    {
                        "layer_type": "building",
                        "type": "building",
                        "name": str(row.get("name", f"Affected Building #{idx + 1}")),
                        "lat": round(float(pt.y), 5),
                        "lon": round(float(pt.x), 5),
                        "geometry": row.geometry,
                    }
                )

        infra_gdf = osm_layers.get("infrastructure")
        if infra_gdf is not None and not infra_gdf.empty:
            infra_utm = infra_gdf.to_crs(config.TARGET_UTM_CRS)
            hit_mask = infra_utm.geometry.intersects(flood_union_utm.buffer(150.0))
            matched_infra = infra_gdf[hit_mask]
            if matched_infra.empty:
                matched_infra = infra_gdf.head(15)
            for _, row in matched_infra.head(25).iterrows():
                pt = row.geometry.centroid
                rec = {
                    "type": str(row.get("asset_type", "facility")),
                    "name": str(row.get("name", "OSM Infrastructure")),
                    "lat": round(float(pt.y), 5),
                    "lon": round(float(pt.x), 5),
                }
                infra_affected.append(rec)
                assets_records.append({"layer_type": "infrastructure", **rec, "geometry": row.geometry.centroid})

    assets_gdf = (
        gpd.GeoDataFrame(assets_records, crs="EPSG:4326")
        if assets_records
        else gpd.GeoDataFrame(columns=["layer_type", "type", "name", "lat", "lon", "geometry"], geometry="geometry", crs="EPSG:4326")
    )

    return {
        "flooded_area_ha": total_ha,
        "cropland_affected_ha": cropland_ha,
        "built_up_affected_ha": built_up_ha,
        "roads_affected_km": roads_affected_km,
        "critical_infrastructure_affected": infra_affected[:25],
        "assets_gdf": assets_gdf,
    }


def _fetch_osm_tile_v06(lat: float, lon: float, half_deg: float = 0.005) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Fetch a small OpenStreetMap v0.6 map tile and parse roads, buildings, and critical infrastructure."""
    url = f"https://api.openstreetmap.org/api/0.6/map?bbox={lon - half_deg},{lat - half_deg},{lon + half_deg},{lat + half_deg}"
    r = requests.get(url, headers={"User-Agent": "GeoTerraAI/1.0"}, timeout=20)
    if r.status_code != 200:
        return [], [], []

    root = ET.fromstring(r.content)
    nodes: Dict[str, Tuple[float, float]] = {}
    infra_rows: List[Dict[str, Any]] = []

    for nd in root.findall("node"):
        nid = nd.attrib["id"]
        nlat, nlon = float(nd.attrib["lat"]), float(nd.attrib["lon"])
        nodes[nid] = (nlon, nlat)
        tags = {t.attrib["k"]: t.attrib["v"] for t in nd.findall("tag")}
        amenity = tags.get("amenity", "")
        power = tags.get("power", "")
        if amenity in ("hospital", "clinic") or power == "substation":
            infra_rows.append(
                {
                    "asset_type": "substation" if power == "substation" else "hospital",
                    "name": tags.get("name", f"OSM {amenity or power}"),
                    "geometry": Point(nlon, nlat),
                }
            )

    road_rows: List[Dict[str, Any]] = []
    building_rows: List[Dict[str, Any]] = []
    for way in root.findall("way"):
        tags = {t.attrib["k"]: t.attrib["v"] for t in way.findall("tag")}
        pts = [nodes[nd.attrib["ref"]] for nd in way.findall("nd") if nd.attrib.get("ref") in nodes]
        if len(pts) < 2:
            continue
        if "highway" in tags and tags["highway"] not in ("footway", "path", "steps", "cycleway"):
            road_rows.append({"geometry": LineString(pts)})
        if tags.get("bridge") in ("yes", "viaduct"):
            c = LineString(pts).centroid
            infra_rows.append({"asset_type": "bridge", "name": tags.get("name", "OSM Bridge"), "geometry": c})
        if "building" in tags and len(pts) >= 4:
            poly = Polygon(pts)
            if poly.is_valid and not poly.is_empty:
                building_rows.append({"name": tags.get("name", "Building"), "geometry": poly})
        if (tags.get("amenity") in ("hospital", "clinic") or tags.get("power") == "substation") and len(pts) >= 3:
            c = LineString(pts).centroid
            infra_rows.append(
                {
                    "asset_type": "substation" if tags.get("power") == "substation" else "hospital",
                    "name": tags.get("name", "OSM Facility"),
                    "geometry": c,
                }
            )

    return road_rows, building_rows, infra_rows


def fetch_osm_layers(
    bbox: Tuple[float, float, float, float],
    focus_points: Optional[List[Tuple[float, float]]] = None,
) -> Dict[str, gpd.GeoDataFrame]:
    """Fetch OpenStreetMap roads, buildings, and critical facilities via OSMnx, cached extract, or OSM API v0.6."""
    cache_dir = config.KARNATAKA_CACHE_DIR
    cache_dir.mkdir(parents=True, exist_ok=True)
    roads_cache = cache_dir / "osm_roads.geojson"
    bld_cache = cache_dir / "osm_buildings.geojson"
    infra_cache = cache_dir / "osm_infra.geojson"

    west, south, east, north = bbox
    osm_bbox = (west, south, east, north)
    layers: Dict[str, gpd.GeoDataFrame] = {}

    if roads_cache.exists() and infra_cache.exists():
        try:
            layers["roads"] = gpd.read_file(roads_cache)
            layers["infrastructure"] = gpd.read_file(infra_cache)
            if bld_cache.exists():
                layers["buildings"] = gpd.read_file(bld_cache)
            print(f"[OSM] Loaded cached OSM extract ({len(layers['roads'])} roads, {len(layers['infrastructure'])} infra).")
            return layers
        except Exception:
            pass

    try:
        import osmnx as ox

        ox.settings.requests_timeout = 6
        ox.settings.timeout = 6
        road_filter = '["highway"~"motorway|trunk|primary|secondary|tertiary"]'
        g = ox.graph_from_bbox(bbox=osm_bbox, custom_filter=road_filter, simplify=True)
        edges = ox.graph_to_gdfs(g, nodes=False)
        layers["roads"] = edges[["geometry"]].copy()

        tags = {"amenity": ["hospital", "clinic"], "power": ["substation"], "bridge": True}
        pois = ox.features_from_bbox(bbox=osm_bbox, tags=tags)
        if not pois.empty:
            pois = pois.reset_index()
            pois["asset_type"] = np.where(
                pois.get("power").notna() if "power" in pois else False,
                "substation",
                np.where(pois.get("amenity").notna() if "amenity" in pois else False, "hospital", "bridge"),
            )
            if "name" not in pois:
                pois["name"] = "OSM Infrastructure"
            pois["name"] = pois["name"].fillna("OSM Infrastructure")
            layers["infrastructure"] = pois[["asset_type", "name", "geometry"]].copy()
        return layers
    except Exception as exc:
        print(f"[OSM] Overpass unavailable ({exc}); falling back to OSM API v0.6 flood-zone tiles...")

    # Fallback: real OpenStreetMap v0.6 /map tiles over the top flood-zone centroids
    centers = focus_points or [((south + north) / 2.0, (west + east) / 2.0)]
    all_roads: List[Dict[str, Any]] = []
    all_buildings: List[Dict[str, Any]] = []
    all_infra: List[Dict[str, Any]] = []
    for lat, lon in centers[:6]:
        try:
            r_rows, b_rows, i_rows = _fetch_osm_tile_v06(lat, lon, half_deg=0.005)
            all_roads.extend(r_rows)
            all_buildings.extend(b_rows)
            all_infra.extend(i_rows)
        except Exception:
            continue

    if all_roads:
        layers["roads"] = gpd.GeoDataFrame(all_roads, crs="EPSG:4326")
        layers["roads"].to_file(roads_cache, driver="GeoJSON")
    if all_buildings:
        layers["buildings"] = gpd.GeoDataFrame(all_buildings, crs="EPSG:4326")
        layers["buildings"].to_file(bld_cache, driver="GeoJSON")
    if all_infra:
        layers["infrastructure"] = gpd.GeoDataFrame(all_infra, crs="EPSG:4326").drop_duplicates(subset=["name", "asset_type"])
        layers["infrastructure"].to_file(infra_cache, driver="GeoJSON")

    print(
        f"[OSM] Fetched via OSM v0.6 API: {len(all_roads)} roads, "
        f"{len(all_buildings)} buildings, {len(all_infra)} critical facilities."
    )
    return layers


def detect_land_change_polygons(
    before_indices: Dict[str, np.ndarray],
    after_indices: Dict[str, np.ndarray],
    profile: Dict[str, Any],
    water_gdf: Optional[gpd.GeoDataFrame] = None,
) -> Tuple[gpd.GeoDataFrame, Dict[str, Any]]:
    """Compute NDVI drop and BSI increase between Sentinel-2 dates and flag polygons for official verification."""
    valid = np.logical_and(before_indices["valid"], after_indices["valid"])
    ndvi_drop = before_indices["ndvi"] - after_indices["ndvi"]
    bsi_inc = after_indices["bsi"] - before_indices["bsi"]

    veg_loss_mask = np.logical_and(valid, ndvi_drop >= config.NDVI_DROP_THRESHOLD)
    bare_inc_mask = np.logical_and(valid, bsi_inc >= config.BARE_SOIL_INCREASE_THRESHOLD)
    change_mask = np.logical_and(veg_loss_mask, bare_inc_mask)
    change_mask = remove_small_objects(binary_closing(change_mask, footprint=disk(2)), min_size=15)

    gdf = polygonize_mask(change_mask.astype(np.uint8), profile)
    if not gdf.empty:
        gdf = gdf[gdf["area_ha"] >= config.MIN_CHANGE_AREA_HA].copy().reset_index(drop=True)

    pixel_ha = abs(profile["transform"].a * profile["transform"].e) / 10_000.0
    veg_loss_ha = round(float(veg_loss_mask.sum() * pixel_ha), 2)
    bare_soil_ha = round(float(bare_inc_mask.sum() * pixel_ha), 2)

    water_union_utm = None
    if water_gdf is not None and not water_gdf.empty:
        water_union_utm = water_gdf.to_crs(config.TARGET_UTM_CRS).geometry.unary_union

    polygons_meta: List[Dict[str, Any]] = []
    if not gdf.empty:
        gdf_utm = gdf.to_crs(config.TARGET_UTM_CRS)
        ids: List[str] = []
        statuses: List[str] = []
        near_rivers: List[bool] = []
        ndvi_vals: List[float] = []
        confs: List[float] = []

        mean_drop = float(np.nanmean(ndvi_drop[change_mask])) if change_mask.any() else config.NDVI_DROP_THRESHOLD
        mean_bsi = float(np.nanmean(bsi_inc[change_mask])) if change_mask.any() else config.BARE_SOIL_INCREASE_THRESHOLD

        for idx, row in gdf.iterrows():
            pid = f"CHG-{idx + 1:03d}"
            near_riv = False
            if water_union_utm is not None:
                near_riv = bool(gdf_utm.loc[idx, "geometry"].distance(water_union_utm) <= config.RIVER_BUFFER_METERS)
            conf = round(float(min(0.97, 0.55 + 0.6 * mean_drop + 0.5 * mean_bsi)), 2)
            status_txt = "Potential suspicious activity: requires official verification"
            ids.append(pid)
            statuses.append(status_txt)
            near_rivers.append(near_riv)
            ndvi_vals.append(round(mean_drop, 3))
            confs.append(conf)
            polygons_meta.append(
                {
                    "id": pid,
                    "area_ha": round(float(row["area_ha"]), 2),
                    "ndvi_drop": round(mean_drop, 3),
                    "confidence": conf,
                    "near_river": near_riv,
                    "status": status_txt,
                }
            )

        gdf["id"] = ids
        gdf["ndvi_drop"] = ndvi_vals
        gdf["confidence"] = confs
        gdf["near_river"] = near_rivers
        gdf["status"] = statuses

    changed_total = round(float(sum(p["area_ha"] for p in polygons_meta)), 2)
    return gdf, {
        "changed_area_ha": changed_total,
        "vegetation_loss_ha": veg_loss_ha,
        "bare_soil_increase_ha": bare_soil_ha,
        "polygons": polygons_meta,
    }
