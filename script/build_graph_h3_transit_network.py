#!/usr/bin/env python3
"""
KMZ → H3 Graph Builder for Syrian Public Transit (Interactive Edition)

Nodes carry:
  - h3_cell, node_type (endpoint/transfer/single), route_count, is_transfer

Edges carry:
  - edge_type (bus/walking), speed_kmh, bearing_deg, congestion_factor,
    travel_time, distance_km, full geometry

All fields are designed to feed an A* / Dijkstra routing algorithm directly.

Interactive flags can be passed via CLI or the script will prompt for them.
"""

import os
import sys
import zipfile
import math
import argparse
from collections import defaultdict
from xml.etree import ElementTree as ET

import h3
import psycopg2
import psycopg2.extras
from shapely.geometry import LineString, Point, MultiPoint
from shapely.ops import nearest_points, substring
import numpy as np

# ----------------------------------------------------------------------
# Hard defaults (overridden interactively)
# ----------------------------------------------------------------------
DEFAULT_AVG_BUS_SPEED_KMH    = 25.0
DEFAULT_WALKING_SPEED_MS     = 1.4          # m/s  (~5 km/h)
DEFAULT_TRANSFER_THRESHOLD_M = 200.0        # meters between routes → transfer node
DEFAULT_H3_RESOLUTION        = 11           # ~43 m cell width
DEFAULT_WALK_MAX_DIST_M      = 500.0        # max walking edge length
DEFAULT_MAX_WALK_NEIGHBORS   = 5            # keep only N closest walking neighbors per node
DEFAULT_CONGESTION_FACTOR    = 1.0          # neutral; >1 = slower (can be updated live)

# H3 resolution 11 edge length ≈ 25 m, used to convert walk distance → ring k
H3_EDGE_LEN_M = 25.0


# ----------------------------------------------------------------------
# Helper: prompt with a default, return typed value
# ----------------------------------------------------------------------
def prompt(label: str, default, cast=float) -> float:
    raw = input(f"  {label} [{default}]: ").strip()
    return cast(raw) if raw else cast(default)


# ----------------------------------------------------------------------
# Helper: parse KML coordinates
# ----------------------------------------------------------------------


# ----------------------------------------------------------------------
# Helper: parse KML coordinates
# ----------------------------------------------------------------------
def parse_coordinates(coord_string):
    points = []
    for triplet in coord_string.strip().split():
        parts = triplet.split(",")
        if len(parts) >= 2:
            lon, lat = float(parts[0]), float(parts[1])
            points.append((lon, lat))
    return points


# ----------------------------------------------------------------------
# Helper: great‑circle distance (meters)
# ----------------------------------------------------------------------
def haversine(lon1, lat1, lon2, lat2):
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


# ----------------------------------------------------------------------
# Helper: compass bearing (degrees) between two lon/lat points
# ----------------------------------------------------------------------
def bearing(lon1, lat1, lon2, lat2) -> float:
    """Returns initial bearing in degrees [0, 360)."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dl   = math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


# ----------------------------------------------------------------------
# Main script
# ----------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="H3 Graph Builder – Syrian Public Transit (Interactive)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("kmz_files", nargs="+", help="One or more KMZ files")
    parser.add_argument("--dbname",   required=True,  help="PostgreSQL database name")
    parser.add_argument("--user",     required=True,  help="Database user")
    parser.add_argument("--password", required=True,  help="Database password")
    parser.add_argument("--host",     default="localhost", help="Database host")
    parser.add_argument("--port",     default=5432, type=int, help="Database port")
    # Optional overrides – if omitted the script will prompt interactively
    parser.add_argument("--walk-dist",        type=float, help="Max walking edge distance in meters")
    parser.add_argument("--walk-speed",       type=float, help="Walking speed in m/s")
    parser.add_argument("--bus-speed",        type=float, help="Average bus speed in km/h")
    parser.add_argument("--transfer-dist",    type=float, help="Route transfer threshold in meters")
    parser.add_argument("--h3-resolution",    type=int,   help="H3 resolution (7-12)")
    parser.add_argument("--congestion",       type=float, help="Initial congestion factor (1.0 = normal)")
    parser.add_argument("--max-walk-neighbors", type=int, help="Max walking neighbors per node (prune to N closest)")
    parser.add_argument("--non-interactive",  action="store_true",
                        help="Skip all prompts; use defaults or provided flags")
    args = parser.parse_args()

    # ------------------------------------------------------------------
    # 1. Interactive parameter collection
    # ------------------------------------------------------------------
    ni = args.non_interactive  # shorthand

    print()
    print("=" * 60)
    print("  H3 Transit Graph Builder — Parameter Setup")
    print("=" * 60)

    if ni:
        walk_max_m       = args.walk_dist          or DEFAULT_WALK_MAX_DIST_M
        walking_speed_ms = args.walk_speed          or DEFAULT_WALKING_SPEED_MS
        avg_bus_speed    = args.bus_speed           or DEFAULT_AVG_BUS_SPEED_KMH
        transfer_thresh  = args.transfer_dist       or DEFAULT_TRANSFER_THRESHOLD_M
        h3_res           = args.h3_resolution       or DEFAULT_H3_RESOLUTION
        congestion       = args.congestion          or DEFAULT_CONGESTION_FACTOR
        max_walk_nbrs    = args.max_walk_neighbors  or DEFAULT_MAX_WALK_NEIGHBORS
    else:
        print("\n  Leave blank to accept the default shown in [brackets].\n")
        walk_max_m       = args.walk_dist          or prompt("Max walking distance (m)",   DEFAULT_WALK_MAX_DIST_M)
        walking_speed_ms = args.walk_speed          or prompt("Walking speed (m/s)",        DEFAULT_WALKING_SPEED_MS)
        avg_bus_speed    = args.bus_speed           or prompt("Average bus speed (km/h)",   DEFAULT_AVG_BUS_SPEED_KMH)
        transfer_thresh  = args.transfer_dist       or prompt("Transfer threshold (m)",     DEFAULT_TRANSFER_THRESHOLD_M)
        h3_res           = int(args.h3_resolution   or prompt("H3 resolution (7-12)",       DEFAULT_H3_RESOLUTION, int))
        congestion       = args.congestion          or prompt("Congestion factor (1.0=normal)", DEFAULT_CONGESTION_FACTOR)
        max_walk_nbrs    = int(args.max_walk_neighbors or prompt("Max walking neighbors per node", DEFAULT_MAX_WALK_NEIGHBORS, int))

    walk_ring_k = math.ceil(walk_max_m / H3_EDGE_LEN_M)

    print()
    print("  Parameters confirmed:")
    print(f"    Walking distance max : {walk_max_m} m")
    print(f"    Walking speed        : {walking_speed_ms} m/s  ({walking_speed_ms*3.6:.1f} km/h)")
    print(f"    Bus speed            : {avg_bus_speed} km/h")
    print(f"    Transfer threshold   : {transfer_thresh} m")
    print(f"    H3 resolution        : {h3_res}  (cell ~{H3_EDGE_LEN_M*2:.0f} m wide)")
    print(f"    Congestion factor    : {congestion}")
    print(f"    Max walk neighbors   : {max_walk_nbrs} per node")
    print(f"    H3 walk ring k       : {walk_ring_k}")
    print()

    # ------------------------------------------------------------------
    # 2. Connect to PostgreSQL
    # ------------------------------------------------------------------
    conn = psycopg2.connect(
        dbname=args.dbname,
        user=args.user,
        password=args.password,
        host=args.host,
        port=args.port,
    )
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    # ------------------------------------------------------------------
    # 2a. Migrate schema: add new routing columns if they don't exist yet
    # ------------------------------------------------------------------
    cur.execute("""
        DO $$ BEGIN
            -- nodes
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nodes' AND column_name='node_type') THEN
                ALTER TABLE nodes ADD COLUMN node_type VARCHAR(20) DEFAULT 'single';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nodes' AND column_name='route_count') THEN
                ALTER TABLE nodes ADD COLUMN route_count INTEGER DEFAULT 1;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nodes' AND column_name='is_transfer') THEN
                ALTER TABLE nodes ADD COLUMN is_transfer BOOLEAN DEFAULT FALSE;
            END IF;
            -- edges
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='edges' AND column_name='edge_type') THEN
                ALTER TABLE edges ADD COLUMN edge_type VARCHAR(10) DEFAULT 'bus';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='edges' AND column_name='speed_kmh') THEN
                ALTER TABLE edges ADD COLUMN speed_kmh DOUBLE PRECISION;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='edges' AND column_name='bearing_deg') THEN
                ALTER TABLE edges ADD COLUMN bearing_deg DOUBLE PRECISION;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='edges' AND column_name='congestion_factor') THEN
                ALTER TABLE edges ADD COLUMN congestion_factor DOUBLE PRECISION DEFAULT 1.0;
            END IF;
        END $$;
    """)
    conn.commit()
    print("Schema columns verified / migrated.")

    # ------------------------------------------------------------------
    # 2. Parse all KMZ files, extract routes and simplified geometries
    # ------------------------------------------------------------------
    routes = (
        []
    )  # list of dict: temp_id, name, geom_original (for display), geom_simplified (for graph)
    kml_ns = {"kml": "http://www.opengis.net/kml/2.2"}

    for kmz_path in args.kmz_files:
        with zipfile.ZipFile(kmz_path, "r") as kmz:
            kml_files = [f for f in kmz.namelist() if f.endswith(".kml")]
            if not kml_files:
                print(f"Warning: No KML found in {kmz_path}, skipping.")
                continue
            with kmz.open(kml_files[0], "r") as kml_file:
                tree = ET.parse(kml_file)
                root = tree.getroot()

                for placemark in root.findall(".//kml:Placemark", kml_ns):
                    name_elem = placemark.find("kml:name", kml_ns)
                    if name_elem is None or not name_elem.text:
                        continue
                    name = name_elem.text

                    line_elem = placemark.find(".//kml:LineString", kml_ns)
                    if line_elem is None:
                        continue
                    coords_elem = line_elem.find("kml:coordinates", kml_ns)
                    if coords_elem is None or not coords_elem.text:
                        continue

                    raw_coords = parse_coordinates(coords_elem.text)
                    if len(raw_coords) < 2:
                        continue

                    original = LineString(raw_coords)
                    # Simplify: tolerance ~0.0005 deg ≈ 55m (adjust as needed)
                    simplified = original.simplify(0.0005, preserve_topology=True)
                    routes.append(
                        {
                            "name": name,
                            "geom_original": original,  # store for display
                            "geom_simplified": simplified,  # used for graph building
                            "temp_id": len(routes),
                        }
                    )

    print(f"Loaded {len(routes)} routes.")

    # ------------------------------------------------------------------
    # 3. Insert routes into database (get real route_ids)
    #    Store the full original geometry in routes.geom for display.
    # ------------------------------------------------------------------
    route_id_map = {}  # temp_id -> real id
    for r in routes:
        cur.execute(
            """
            INSERT INTO routes (name, type, avg_speed_kmh, base_price, frequency_minutes, crowding_tendency, geom)
            VALUES (%s, 'bus', %s, NULL, NULL, 'medium', ST_GeomFromText(%s, 4326))
            RETURNING id
        """,
            (r["name"], avg_bus_speed, r["geom_original"].wkt),
        )
        route_id = cur.fetchone()[0]
        route_id_map[r["temp_id"]] = route_id
        r["id"] = route_id
    conn.commit()
    print("Routes inserted with full geometry.")

    # ------------------------------------------------------------------
    # 4. Generate candidate nodes (each candidate: lon, lat, set_of_route_ids)
    # ------------------------------------------------------------------
    candidate_nodes = []

    def add_candidate(lon, lat, route_set):
        candidate_nodes.append((lon, lat, route_set))

    # 4a. Endpoints of each route (use simplified geometry for consistency)
    for r in routes:
        coords = list(r["geom_simplified"].coords)
        # first point
        add_candidate(coords[0][0], coords[0][1], {r["id"]})
        # last point (if different)
        if len(coords) > 1 and (
            coords[-1][0] != coords[0][0] or coords[-1][1] != coords[0][1]
        ):
            add_candidate(coords[-1][0], coords[-1][1], {r["id"]})

    # 4b. Intersections and close parallels between route pairs
    n = len(routes)
    for i in range(n):
        geom_i = routes[i]["geom_simplified"]
        id_i = routes[i]["id"]
        for j in range(i + 1, n):
            geom_j = routes[j]["geom_simplified"]
            id_j = routes[j]["id"]

            # Quick bounding‑box filter (in degrees)
            if geom_i.distance(geom_j) > transfer_thresh / 111000:
                continue

            # Check for intersections
            intersect = geom_i.intersection(geom_j)
            if not intersect.is_empty:
                if intersect.geom_type == "Point":
                    points = [intersect]
                elif intersect.geom_type == "MultiPoint":
                    points = list(intersect.geoms)
                else:
                    # Could be LineString if routes overlap; ignore for now
                    points = []
                for pt in points:
                    add_candidate(pt.x, pt.y, {id_i, id_j})
                continue

            # No intersection: check if they are close enough for a transfer node
            p1, p2 = nearest_points(geom_i, geom_j)
            dist_m = haversine(p1.x, p1.y, p2.x, p2.y)
            if dist_m < transfer_thresh:
                # Compute midpoint
                mid_lon = (p1.x + p2.x) / 2.0
                mid_lat = (p1.y + p2.y) / 2.0
                add_candidate(mid_lon, mid_lat, {id_i, id_j})

    print(f"Generated {len(candidate_nodes)} raw candidate nodes.")

    # ------------------------------------------------------------------
    # 5. Merge candidate nodes using H3 hexagonal grid
    #    All candidates in the same H3 cell merge to the cell centroid.
    # ------------------------------------------------------------------
    if len(candidate_nodes) == 0:
        print("No candidate nodes, exiting.")
        return

    cell_groups = defaultdict(list)  # h3_cell -> list of (lon, lat, route_set)
    for lon, lat, route_set in candidate_nodes:
        cell = h3.latlng_to_cell(lat, lon, h3_res)
        cell_groups[cell].append((lon, lat, route_set))

    final_nodes = []  # each: (lon, lat, route_set, h3_cell)
    for cell, candidates in cell_groups.items():
        # Use H3 cell center as the merged position (deterministic)
        center_lat, center_lon = h3.cell_to_latlng(cell)

        # Union of all route ids from candidates in this cell
        all_route_ids = set()
        for _, _, rs in candidates:
            all_route_ids |= rs

        final_nodes.append((center_lon, center_lat, all_route_ids, cell))

    print(f"After clustering: {len(final_nodes)} final nodes.")

    # ------------------------------------------------------------------
    # 6. Insert final nodes into database (with H3 cell ID + routing meta)
    # ------------------------------------------------------------------
    node_records = []  # list of dict: id, lon, lat, route_ids
    for lon, lat, route_set, cell in final_nodes:
        rc = len(route_set)
        is_transfer = rc > 1
        # Check if this node is an endpoint of any route
        is_endpoint = False
        for r in routes:
            coords = list(r["geom_simplified"].coords)
            ep_cell_start = h3.latlng_to_cell(coords[0][1],  coords[0][0],  h3_res)
            ep_cell_end   = h3.latlng_to_cell(coords[-1][1], coords[-1][0], h3_res)
            if cell in (ep_cell_start, ep_cell_end):
                is_endpoint = True
                break
        if is_endpoint:
            node_type = "endpoint"
        elif is_transfer:
            node_type = "transfer"
        else:
            node_type = "single"

        cur.execute(
            """
            INSERT INTO nodes (latitude, longitude, h3_cell, node_type, route_count, is_transfer)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
        """,
            (float(lat), float(lon), cell, node_type, rc, is_transfer),
        )
        node_id = cur.fetchone()[0]
        node_records.append(
            {
                "id": node_id,
                "lon": float(lon),
                "lat": float(lat),
                "route_ids": route_set,
                "h3_cell": cell,
                "node_type": node_type,
                "route_count": rc,
                "is_transfer": is_transfer,
            }
        )
    conn.commit()
    print(f"Inserted {len(node_records)} nodes (endpoint/transfer/single classified).")

    # ------------------------------------------------------------------
    # 7. Associate nodes with routes (compute fraction along each route)
    #    Use simplified geometry for fraction calculation.
    # ------------------------------------------------------------------
    route_node_fractions = defaultdict(list)  # route_id -> list of (node_id, fraction)

    for node in node_records:
        node_id = node["id"]
        node_point = Point(node["lon"], node["lat"])
        for route_id in node["route_ids"]:
            # Find the route geometry
            route_geom = None
            for r in routes:
                if r["id"] == route_id:
                    route_geom = r["geom_simplified"]
                    break
            if route_geom is None:
                continue

            # Project node onto route to get fraction
            fraction = route_geom.project(node_point, normalized=True)
            route_node_fractions[route_id].append((node_id, fraction))

    # ------------------------------------------------------------------
    # 8. Insert into route_nodes table (ordered by fraction)
    # ------------------------------------------------------------------
    for route_id, frac_list in route_node_fractions.items():
        # Remove duplicates (same node may appear multiple times? unlikely)
        unique = {}
        for node_id, frac in frac_list:
            unique[node_id] = frac
        sorted_items = sorted(unique.items(), key=lambda x: x[1])
        for seq, (node_id, _) in enumerate(sorted_items):
            cur.execute(
                """
                INSERT INTO route_nodes (route_id, node_id, sequence_order)
                VALUES (%s, %s, %s)
                ON CONFLICT (route_id, sequence_order) DO NOTHING
            """,
                (route_id, node_id, seq),
            )
    conn.commit()
    print("Route-node associations inserted.")

    # ------------------------------------------------------------------
    # 9. Build directed edges for each route (using simplified geometry)
    # ------------------------------------------------------------------
    edges_created = 0
    for route_id, frac_list in route_node_fractions.items():
        if len(frac_list) < 2:
            continue

        # Get route geometry
        route_geom = None
        for r in routes:
            if r["id"] == route_id:
                route_geom = r["geom_simplified"]
                break
        if route_geom is None:
            continue

        # Sort nodes by fraction
        sorted_nodes = sorted(frac_list, key=lambda x: x[1])
        node_ids = [nid for nid, _ in sorted_nodes]
        fractions = [f for _, f in sorted_nodes]

        for i in range(len(node_ids) - 1):
            from_id = node_ids[i]
            to_id = node_ids[i + 1]
            f1 = fractions[i]
            f2 = fractions[i + 1]

            if f1 >= f2:
                continue

            # Extract sub‑linestring between f1 and f2
            try:
                sub_geom = substring(
                    route_geom, f1 * route_geom.length, f2 * route_geom.length
                )
            except Exception:
                # Fallback: straight line between the two points
                p1 = route_geom.interpolate(f1, normalized=True)
                p2 = route_geom.interpolate(f2, normalized=True)
                sub_geom = LineString([p1, p2])

            # Approximate length in meters (crude but ok for short segments)
            distance_m = sub_geom.length * 111000
            distance_km = distance_m / 1000.0
            travel_time = distance_km / avg_bus_speed * 3600.0  # seconds

            # Compute bearing from start → end of sub-segment
            sc = list(sub_geom.coords)
            fwd_bearing = bearing(sc[0][0], sc[0][1], sc[-1][0], sc[-1][1])
            rev_bearing = (fwd_bearing + 180) % 360

            # Insert forward edge
            cur.execute(
                """
                INSERT INTO edges
                    (from_node, to_node, route_id, travel_time, distance_km,
                     edge_type, speed_kmh, bearing_deg, congestion_factor, geom)
                VALUES (%s, %s, %s, %s, %s, 'bus', %s, %s, %s, ST_GeomFromText(%s, 4326))
                ON CONFLICT (from_node, to_node, route_id) DO NOTHING
            """,
                (from_id, to_id, route_id, travel_time, distance_km,
                 avg_bus_speed, fwd_bearing, congestion, sub_geom.wkt),
            )
            edges_created += cur.rowcount

            # Insert backward edge
            cur.execute(
                """
                INSERT INTO edges
                    (from_node, to_node, route_id, travel_time, distance_km,
                     edge_type, speed_kmh, bearing_deg, congestion_factor, geom)
                VALUES (%s, %s, %s, %s, %s, 'bus', %s, %s, %s, ST_GeomFromText(%s, 4326))
                ON CONFLICT (from_node, to_node, route_id) DO NOTHING
            """,
                (to_id, from_id, route_id, travel_time, distance_km,
                 avg_bus_speed, rev_bearing, congestion, sub_geom.wkt),
            )
            edges_created += cur.rowcount

    conn.commit()
    print(f"Created {edges_created} directed route edges.")

    # ------------------------------------------------------------------
    # 10. Add walking edges using H3 neighborhood search
    #     Phase A: collect all candidate pairs per node (with distance).
    #     Phase B: keep only the closest `max_walk_nbrs` per node.
    #     Phase C: insert the pruned set.
    # ------------------------------------------------------------------
    print("Adding walking edges using H3 neighborhood search...")
    print(f"  (max {max_walk_nbrs} closest walking neighbors per node)")

    walk_speed_kmh = walking_speed_ms * 3.6
    node_by_id = {nrec["id"]: nrec for nrec in node_records}
    cell_to_node_ids = defaultdict(list)
    for nrec in node_records:
        cell_to_node_ids[nrec["h3_cell"]].append(nrec["id"])

    # Phase A: collect candidates  {src_id: [(dist_m, dst_id), ...]}
    walk_candidates = defaultdict(list)

    for src in node_records:
        src_id = src["id"]
        src_cell = src["h3_cell"]

        nearby_cells = h3.grid_disk(src_cell, walk_ring_k)
        for ncell in nearby_cells:
            for dst_id in cell_to_node_ids.get(ncell, []):
                if dst_id == src_id:
                    continue

                dst = node_by_id[dst_id]

                # Skip nodes on the same bus route (they have bus edges already)
                if src["route_ids"] & dst["route_ids"]:
                    continue

                dist_m = haversine(src["lon"], src["lat"], dst["lon"], dst["lat"])
                if dist_m > walk_max_m:
                    continue

                walk_candidates[src_id].append((dist_m, dst_id))

    # Phase B: prune to closest N per node, then deduplicate symmetric pairs
    kept_pairs = set()  # (min_id, max_id) to avoid inserting same pair twice
    for src_id, cands in walk_candidates.items():
        cands.sort()  # sort by distance ascending
        for dist_m, dst_id in cands[:max_walk_nbrs]:
            pair = (min(src_id, dst_id), max(src_id, dst_id))
            kept_pairs.add(pair)

    print(f"  Candidates before pruning: {sum(len(c) for c in walk_candidates.values())} directed")
    print(f"  Kept after pruning: {len(kept_pairs)} unique pairs → {len(kept_pairs) * 2} directed edges")

    # Phase C: insert kept pairs (both directions)
    walking_edges_created = 0
    for a_id, b_id in kept_pairs:
        a = node_by_id[a_id]
        b = node_by_id[b_id]
        dist_m = haversine(a["lon"], a["lat"], b["lon"], b["lat"])
        distance_km = dist_m / 1000.0
        travel_time = dist_m / walking_speed_ms
        walk_geom = LineString([(a["lon"], a["lat"]), (b["lon"], b["lat"])]).wkt
        fwd_bearing = bearing(a["lon"], a["lat"], b["lon"], b["lat"])
        rev_bearing = (fwd_bearing + 180) % 360

        # Forward
        cur.execute(
            """
            INSERT INTO edges
                (from_node, to_node, route_id, travel_time, distance_km,
                 edge_type, speed_kmh, bearing_deg, congestion_factor, geom)
            SELECT %s, %s, NULL, %s, %s, 'walking', %s, %s, %s, ST_GeomFromText(%s, 4326)
            WHERE NOT EXISTS (
                SELECT 1 FROM edges
                WHERE from_node = %s AND to_node = %s AND route_id IS NULL
            )
        """,
            (
                a_id, b_id, travel_time, distance_km,
                walk_speed_kmh, fwd_bearing, congestion, walk_geom,
                a_id, b_id,
            ),
        )
        walking_edges_created += cur.rowcount

        # Backward
        cur.execute(
            """
            INSERT INTO edges
                (from_node, to_node, route_id, travel_time, distance_km,
                 edge_type, speed_kmh, bearing_deg, congestion_factor, geom)
            SELECT %s, %s, NULL, %s, %s, 'walking', %s, %s, %s, ST_GeomFromText(%s, 4326)
            WHERE NOT EXISTS (
                SELECT 1 FROM edges
                WHERE from_node = %s AND to_node = %s AND route_id IS NULL
            )
        """,
            (
                b_id, a_id, travel_time, distance_km,
                walk_speed_kmh, rev_bearing, congestion, walk_geom,
                b_id, a_id,
            ),
        )
        walking_edges_created += cur.rowcount

    conn.commit()
    print(f"Created {walking_edges_created} directed walking edges.")

    # ------------------------------------------------------------------
    # 11. Done
    # ------------------------------------------------------------------
    cur.close()
    conn.close()
    print()
    print("=" * 60)
    print("  Graph building completed successfully.")
    print(f"  Routes   : {len(routes)}")
    print(f"  Nodes    : {len(node_records)}")
    print(f"  Bus edges: {edges_created}")
    print(f"  Walk edges: {walking_edges_created}")
    print("=" * 60)


if __name__ == "__main__":
    main()
