#!/usr/bin/env python3
"""
KMZ → Graph Builder for Syrian Public Transit
- Reads KMZ files, extracts bus routes.
- Places nodes at:
    * route intersections (one node)
    * midpoints of closest points when routes are within 200m (one node)
    * route endpoints
- Merges nearby nodes (10m tolerance).
- Builds directed edges for each route and walking edges between nearby nodes.
- Stores full route geometry in routes.geom.
- Inserts all into PostgreSQL/PostGIS.
"""

import os
import sys
import zipfile
import math
import argparse
from collections import defaultdict
from xml.etree import ElementTree as ET

import psycopg2
import psycopg2.extras
from shapely.geometry import LineString, Point, MultiPoint
from shapely.ops import nearest_points, substring
import numpy as np
from sklearn.cluster import DBSCAN

# ----------------------------------------------------------------------
# Constants
# ----------------------------------------------------------------------
AVG_BUS_SPEED_KMH = 25.0
WALKING_SPEED_MS = 1.4
TRANSFER_DIST_THRESHOLD = 200.0      # meters
NODE_MERGE_TOLERANCE = 10.0          # meters
WALKING_EDGE_MAX_DIST = 500.0        # meters
ROUTE_ASSOCIATION_DIST = 150.0       # meters (for snapping nodes to routes)

# ----------------------------------------------------------------------
# Helper: parse KML coordinates
# ----------------------------------------------------------------------
def parse_coordinates(coord_string):
    points = []
    for triplet in coord_string.strip().split():
        parts = triplet.split(',')
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
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

# ----------------------------------------------------------------------
# Main script
# ----------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description='Build graph from KMZ files')
    parser.add_argument('kmz_files', nargs='+', help='One or more KMZ files')
    parser.add_argument('--dbname', required=True, help='PostgreSQL database name')
    parser.add_argument('--user', required=True, help='Database user')
    parser.add_argument('--password', required=True, help='Database password')
    parser.add_argument('--host', default='localhost', help='Database host')
    parser.add_argument('--port', default=5432, type=int, help='Database port')
    args = parser.parse_args()

    # ------------------------------------------------------------------
    # 1. Connect to PostgreSQL
    # ------------------------------------------------------------------
    conn = psycopg2.connect(
        dbname=args.dbname,
        user=args.user,
        password=args.password,
        host=args.host,
        port=args.port
    )
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    # ------------------------------------------------------------------
    # 2. Parse all KMZ files, extract routes and simplified geometries
    # ------------------------------------------------------------------
    routes = []  # list of dict: temp_id, name, geom_original (for display), geom_simplified (for graph)
    kml_ns = {'kml': 'http://www.opengis.net/kml/2.2'}

    for kmz_path in args.kmz_files:
        with zipfile.ZipFile(kmz_path, 'r') as kmz:
            kml_files = [f for f in kmz.namelist() if f.endswith('.kml')]
            if not kml_files:
                print(f"Warning: No KML found in {kmz_path}, skipping.")
                continue
            with kmz.open(kml_files[0], 'r') as kml_file:
                tree = ET.parse(kml_file)
                root = tree.getroot()

                for placemark in root.findall('.//kml:Placemark', kml_ns):
                    name_elem = placemark.find('kml:name', kml_ns)
                    if name_elem is None or not name_elem.text:
                        continue
                    name = name_elem.text

                    line_elem = placemark.find('.//kml:LineString', kml_ns)
                    if line_elem is None:
                        continue
                    coords_elem = line_elem.find('kml:coordinates', kml_ns)
                    if coords_elem is None or not coords_elem.text:
                        continue

                    raw_coords = parse_coordinates(coords_elem.text)
                    if len(raw_coords) < 2:
                        continue

                    original = LineString(raw_coords)
                    # Simplify: tolerance ~0.0005 deg ≈ 55m (adjust as needed)
                    simplified = original.simplify(0.0005, preserve_topology=True)
                    routes.append({
                        'name': name,
                        'geom_original': original,    # store for display
                        'geom_simplified': simplified, # used for graph building
                        'temp_id': len(routes)
                    })

    print(f"Loaded {len(routes)} routes.")

    # ------------------------------------------------------------------
    # 3. Insert routes into database (get real route_ids)
    #    Store the full original geometry in routes.geom for display.
    # ------------------------------------------------------------------
    route_id_map = {}  # temp_id -> real id
    for r in routes:
        cur.execute("""
            INSERT INTO routes (name, type, avg_speed_kmh, base_price, frequency_minutes, crowding_tendency, geom)
            VALUES (%s, 'bus', %s, NULL, NULL, 'medium', ST_GeomFromText(%s, 4326))
            RETURNING id
        """, (r['name'], AVG_BUS_SPEED_KMH, r['geom_original'].wkt))
        route_id = cur.fetchone()[0]
        route_id_map[r['temp_id']] = route_id
        r['id'] = route_id
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
        coords = list(r['geom_simplified'].coords)
        # first point
        add_candidate(coords[0][0], coords[0][1], {r['id']})
        # last point (if different)
        if len(coords) > 1 and (coords[-1][0] != coords[0][0] or coords[-1][1] != coords[0][1]):
            add_candidate(coords[-1][0], coords[-1][1], {r['id']})

    # 4b. Intersections and close parallels between route pairs
    n = len(routes)
    for i in range(n):
        geom_i = routes[i]['geom_simplified']
        id_i = routes[i]['id']
        for j in range(i+1, n):
            geom_j = routes[j]['geom_simplified']
            id_j = routes[j]['id']

            # Quick bounding‑box filter (in degrees)
            if geom_i.distance(geom_j) > TRANSFER_DIST_THRESHOLD / 111000:
                continue

            # Check for intersections
            intersect = geom_i.intersection(geom_j)
            if not intersect.is_empty:
                if intersect.geom_type == 'Point':
                    points = [intersect]
                elif intersect.geom_type == 'MultiPoint':
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
            if dist_m < TRANSFER_DIST_THRESHOLD:
                # Compute midpoint
                mid_lon = (p1.x + p2.x) / 2.0
                mid_lat = (p1.y + p2.y) / 2.0
                add_candidate(mid_lon, mid_lat, {id_i, id_j})

    print(f"Generated {len(candidate_nodes)} raw candidate nodes.")

    # ------------------------------------------------------------------
    # 5. Cluster candidate nodes within NODE_MERGE_TOLERANCE
    # ------------------------------------------------------------------
    if len(candidate_nodes) == 0:
        print("No candidate nodes, exiting.")
        return

    # Prepare array of (lat, lon) in radians for DBSCAN
    X = np.array([[lat, lon] for (lon, lat, _) in candidate_nodes])
    X_rad = np.radians(X)

    db = DBSCAN(eps=NODE_MERGE_TOLERANCE / 6371000,  # radians = meters / earth radius
                min_samples=1,
                algorithm='ball_tree',
                metric='haversine')
    labels = db.fit_predict(X_rad)

    clusters = defaultdict(list)
    for idx, label in enumerate(labels):
        clusters[label].append(idx)

    final_nodes = []  # each: (lon, lat, route_set)
    for label, indices in clusters.items():
        points = [candidate_nodes[i][:2] for i in indices]
        route_sets = [candidate_nodes[i][2] for i in indices]

        # Centroid (simple average)
        lon_avg = np.mean([p[0] for p in points])
        lat_avg = np.mean([p[1] for p in points])

        # Union of all route ids
        all_route_ids = set().union(*route_sets)

        final_nodes.append((lon_avg, lat_avg, all_route_ids))

    print(f"After clustering: {len(final_nodes)} final nodes.")

    # ------------------------------------------------------------------
    # 6. Insert final nodes into database (convert NumPy floats to Python floats)
    # ------------------------------------------------------------------
    node_records = []  # list of dict: id, lon, lat, route_ids
    for lon, lat, route_set in final_nodes:
        cur.execute("""
            INSERT INTO nodes (latitude, longitude)
            VALUES (%s, %s)
            RETURNING id
        """, (float(lat), float(lon)))   # ← cast to float
        node_id = cur.fetchone()[0]
        node_records.append({
            'id': node_id,
            'lon': float(lon),
            'lat': float(lat),
            'route_ids': route_set
        })
    conn.commit()
    print(f"Inserted {len(node_records)} nodes.")

    # ------------------------------------------------------------------
    # 7. Associate nodes with routes (compute fraction along each route)
    #    Use simplified geometry for fraction calculation.
    # ------------------------------------------------------------------
    route_node_fractions = defaultdict(list)  # route_id -> list of (node_id, fraction)

    for node in node_records:
        node_id = node['id']
        node_point = Point(node['lon'], node['lat'])
        for route_id in node['route_ids']:
            # Find the route geometry
            route_geom = None
            for r in routes:
                if r['id'] == route_id:
                    route_geom = r['geom_simplified']
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
            cur.execute("""
                INSERT INTO route_nodes (route_id, node_id, sequence_order)
                VALUES (%s, %s, %s)
                ON CONFLICT (route_id, sequence_order) DO NOTHING
            """, (route_id, node_id, seq))
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
            if r['id'] == route_id:
                route_geom = r['geom_simplified']
                break
        if route_geom is None:
            continue

        # Sort nodes by fraction
        sorted_nodes = sorted(frac_list, key=lambda x: x[1])
        node_ids = [nid for nid, _ in sorted_nodes]
        fractions = [f for _, f in sorted_nodes]

        for i in range(len(node_ids)-1):
            from_id = node_ids[i]
            to_id = node_ids[i+1]
            f1 = fractions[i]
            f2 = fractions[i+1]

            if f1 >= f2:
                continue

            # Extract sub‑linestring between f1 and f2
            try:
                sub_geom = substring(route_geom, f1 * route_geom.length, f2 * route_geom.length)
            except Exception:
                # Fallback: straight line between the two points
                p1 = route_geom.interpolate(f1, normalized=True)
                p2 = route_geom.interpolate(f2, normalized=True)
                sub_geom = LineString([p1, p2])

            # Approximate length in meters (crude but ok for short segments)
            distance_m = sub_geom.length * 111000
            distance_km = distance_m / 1000.0
            travel_time = distance_km / AVG_BUS_SPEED_KMH * 3600.0  # seconds

            # Insert forward edge
            cur.execute("""
                INSERT INTO edges (from_node, to_node, route_id, travel_time, distance_km, geom)
                VALUES (%s, %s, %s, %s, %s, ST_GeomFromText(%s, 4326))
                ON CONFLICT (from_node, to_node, route_id) DO NOTHING
            """, (from_id, to_id, route_id, travel_time, distance_km, sub_geom.wkt))
            edges_created += cur.rowcount

            # Insert backward edge
            cur.execute("""
                INSERT INTO edges (from_node, to_node, route_id, travel_time, distance_km, geom)
                VALUES (%s, %s, %s, %s, %s, ST_GeomFromText(%s, 4326))
                ON CONFLICT (from_node, to_node, route_id) DO NOTHING
            """, (to_id, from_id, route_id, travel_time, distance_km, sub_geom.wkt))
            edges_created += cur.rowcount

    conn.commit()
    print(f"Created {edges_created} directed route edges.")

    # ------------------------------------------------------------------
    # 10. Add walking edges between nearby nodes (straight‑line)
    # ------------------------------------------------------------------
    print("Adding walking edges between nodes within 500m...")
    cur.execute("""
        INSERT INTO edges (from_node, to_node, route_id, travel_time, distance_km, geom)
        SELECT a.id, b.id, NULL,
               ST_Distance(a.geom::geography, b.geom::geography) / %s AS travel_time,
               ST_Distance(a.geom::geography, b.geom::geography) / 1000.0 AS distance_km,
               ST_MakeLine(a.geom, b.geom) AS geom
        FROM nodes a, nodes b
        WHERE a.id < b.id
          AND ST_DWithin(a.geom::geography, b.geom::geography, %s)
        ON CONFLICT (from_node, to_node, route_id) DO NOTHING
    """, (WALKING_SPEED_MS, WALKING_EDGE_MAX_DIST))
    walking_count = cur.rowcount
    conn.commit()
    print(f"Added {walking_count} walking edges.")

    # ------------------------------------------------------------------
    # 11. Done
    # ------------------------------------------------------------------
    cur.close()
    conn.close()
    print("Graph building completed successfully.")

if __name__ == '__main__':
    main()