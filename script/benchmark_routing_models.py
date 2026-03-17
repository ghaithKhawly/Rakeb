import argparse
import math
import random
import subprocess
import sys
import time
import zipfile
from collections import defaultdict
from xml.etree import ElementTree as ET

import numpy as np
import psycopg2
from shapely.geometry import LineString, Point
from shapely.ops import nearest_points, substring
from sklearn.cluster import DBSCAN

BASE_WALK_MAX = 100000.0
WALK_SPEED_MS = 1.4
BUS_AVG_SPEED_KMH = 25.0
BUS_MAX_SPEED_MS = BUS_AVG_SPEED_KMH * 1000.0 / 3600.0
TRANSFER_DIST_THRESHOLD = 200.0
NODE_MERGE_TOLERANCE = 10.0


def parse_coordinates(coord_string):
    points = []
    for triplet in coord_string.strip().split():
        parts = triplet.split(",")
        if len(parts) >= 2:
            lon, lat = float(parts[0]), float(parts[1])
            points.append((lon, lat))
    return points


def haversine(lon1, lat1, lon2, lat2):
    r = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def run_original_builder(kmz_files, db_cfg):
    cmd = [
        sys.executable,
        "build_graph_from_kmz.py",
        *kmz_files,
        "--dbname",
        db_cfg["dbname"],
        "--user",
        db_cfg["user"],
        "--password",
        db_cfg["password"],
        "--host",
        db_cfg["host"],
        "--port",
        str(db_cfg["port"]),
    ]
    subprocess.run(cmd, check=True)


def load_graph_from_db(db_cfg):
    conn = psycopg2.connect(**db_cfg)
    cur = conn.cursor()

    cur.execute("SELECT id, latitude, longitude FROM nodes ORDER BY id")
    nodes = cur.fetchall()

    cur.execute(
        """
        SELECT from_node, to_node, travel_time, distance_km
        FROM edges
        WHERE route_id IS NOT NULL
        """
    )
    bus_edges = cur.fetchall()

    cur.close()
    conn.close()

    node_coords = {}
    node_ids = []
    for nid, lat, lon in nodes:
        node_coords[nid] = (float(lat), float(lon))
        node_ids.append(nid)

    bus_adj = defaultdict(list)
    for u, v, travel_time, dist_km in bus_edges:
        bus_adj[u].append((v, float(travel_time), float(dist_km) * 1000.0, "bus"))

    return node_ids, node_coords, bus_adj


def extract_routes_from_kmz(kmz_files):
    routes = []
    kml_ns = {"kml": "http://www.opengis.net/kml/2.2"}

    for kmz_path in kmz_files:
        with zipfile.ZipFile(kmz_path, "r") as kmz:
            kml_files = [f for f in kmz.namelist() if f.endswith(".kml")]
            if not kml_files:
                continue
            with kmz.open(kml_files[0], "r") as kml_file:
                tree = ET.parse(kml_file)
                root = tree.getroot()

                for placemark in root.findall(".//kml:Placemark", kml_ns):
                    name_elem = placemark.find("kml:name", kml_ns)
                    if name_elem is None or not name_elem.text:
                        continue

                    line_elem = placemark.find(".//kml:LineString", kml_ns)
                    if line_elem is None:
                        continue
                    coords_elem = line_elem.find("kml:coordinates", kml_ns)
                    if coords_elem is None or not coords_elem.text:
                        continue

                    raw_coords = parse_coordinates(coords_elem.text)
                    if len(raw_coords) < 2:
                        continue

                    geom = LineString(raw_coords).simplify(0.0005, preserve_topology=True)
                    routes.append(
                        {
                            "id": len(routes) + 1,
                            "name": name_elem.text,
                            "geom": geom,
                        }
                    )

    return routes


def build_graph_from_routes(routes):
    candidate_nodes = []

    def add_candidate(lon, lat, route_set):
        candidate_nodes.append((lon, lat, route_set))

    for route in routes:
        coords = list(route["geom"].coords)
        add_candidate(coords[0][0], coords[0][1], {route["id"]})
        if len(coords) > 1 and (coords[-1][0] != coords[0][0] or coords[-1][1] != coords[0][1]):
            add_candidate(coords[-1][0], coords[-1][1], {route["id"]})

    n = len(routes)
    for i in range(n):
        geom_i = routes[i]["geom"]
        id_i = routes[i]["id"]
        for j in range(i + 1, n):
            geom_j = routes[j]["geom"]
            id_j = routes[j]["id"]

            if geom_i.distance(geom_j) > TRANSFER_DIST_THRESHOLD / 111000.0:
                continue

            intersect = geom_i.intersection(geom_j)
            if not intersect.is_empty:
                if intersect.geom_type == "Point":
                    points = [intersect]
                elif intersect.geom_type == "MultiPoint":
                    points = list(intersect.geoms)
                else:
                    points = []
                for pt in points:
                    add_candidate(pt.x, pt.y, {id_i, id_j})
                continue

            p1, p2 = nearest_points(geom_i, geom_j)
            dist_m = haversine(p1.x, p1.y, p2.x, p2.y)
            if dist_m < TRANSFER_DIST_THRESHOLD:
                add_candidate((p1.x + p2.x) / 2.0, (p1.y + p2.y) / 2.0, {id_i, id_j})

    if not candidate_nodes:
        return [], {}, defaultdict(list)

    x = np.array([[lat, lon] for (lon, lat, _rs) in candidate_nodes])
    labels = DBSCAN(
        eps=NODE_MERGE_TOLERANCE / 6371000.0,
        min_samples=1,
        algorithm="ball_tree",
        metric="haversine",
    ).fit_predict(np.radians(x))

    clusters = defaultdict(list)
    for idx, label in enumerate(labels):
        clusters[label].append(idx)

    node_records = []
    for indices in clusters.values():
        points = [candidate_nodes[i][:2] for i in indices]
        route_sets = [candidate_nodes[i][2] for i in indices]
        lon_avg = float(np.mean([p[0] for p in points]))
        lat_avg = float(np.mean([p[1] for p in points]))
        all_route_ids = set().union(*route_sets)
        node_records.append((lon_avg, lat_avg, all_route_ids))

    node_ids = []
    node_coords = {}
    route_node_fractions = defaultdict(list)

    for idx, (lon, lat, route_set) in enumerate(node_records, start=1):
        node_ids.append(idx)
        node_coords[idx] = (lat, lon)
        pt = Point(lon, lat)
        for route_id in route_set:
            route_geom = next((r["geom"] for r in routes if r["id"] == route_id), None)
            if route_geom is None:
                continue
            frac = route_geom.project(pt, normalized=True)
            route_node_fractions[route_id].append((idx, frac))

    bus_adj = defaultdict(list)
    route_geom_by_id = {route["id"]: route["geom"] for route in routes}

    for route_id, frac_list in route_node_fractions.items():
        if len(frac_list) < 2:
            continue

        route_geom = route_geom_by_id.get(route_id)
        if route_geom is None:
            continue

        unique = {node_id: frac for node_id, frac in frac_list}
        sorted_nodes = sorted(unique.items(), key=lambda x_item: x_item[1])

        ids = [nid for nid, _frac in sorted_nodes]
        fracs = [frac for _nid, frac in sorted_nodes]

        for i in range(len(ids) - 1):
            from_id = ids[i]
            to_id = ids[i + 1]
            f1 = fracs[i]
            f2 = fracs[i + 1]
            if f1 >= f2:
                continue

            try:
                sub_geom = substring(route_geom, f1 * route_geom.length, f2 * route_geom.length)
            except Exception:
                p1 = route_geom.interpolate(f1, normalized=True)
                p2 = route_geom.interpolate(f2, normalized=True)
                sub_geom = LineString([p1, p2])

            dist_m = float(sub_geom.length) * 111000.0
            travel_s = (dist_m / 1000.0) / BUS_AVG_SPEED_KMH * 3600.0
            bus_adj[from_id].append((to_id, travel_s, dist_m, "bus"))
            bus_adj[to_id].append((from_id, travel_s, dist_m, "bus"))

    return node_ids, node_coords, bus_adj


def build_grid(node_ids, node_coords, cell_m=200.0):
    deg_per_m = 1.0 / 111000.0
    cell_deg = cell_m * deg_per_m
    grid = defaultdict(list)

    for nid in node_ids:
        lat, lon = node_coords[nid]
        gx = int(lon / cell_deg)
        gy = int(lat / cell_deg)
        grid[(gx, gy)].append(nid)

    return grid, cell_deg


def nearby_nodes(node_id, max_dist_m, node_coords, grid, cell_deg):
    lat, lon = node_coords[node_id]
    gx = int(lon / cell_deg)
    gy = int(lat / cell_deg)

    r = int(math.ceil((max_dist_m / 111000.0) / cell_deg))
    out = []

    for dx in range(-r, r + 1):
        for dy in range(-r, r + 1):
            for other in grid.get((gx + dx, gy + dy), []):
                if other == node_id:
                    continue
                olat, olon = node_coords[other]
                d = haversine(lon, lat, olon, olat)
                if d <= max_dist_m:
                    out.append((other, d))
    return out


def precompute_walking(node_ids, node_coords, grid, cell_deg, max_dist_m):
    walk_adj = defaultdict(list)
    for nid in node_ids:
        for other, d in nearby_nodes(nid, max_dist_m, node_coords, grid, cell_deg):
            walk_adj[nid].append((other, d / WALK_SPEED_MS, d, "walk"))
    return walk_adj


def heuristic(a, b, node_coords):
    lat1, lon1 = node_coords[a]
    lat2, lon2 = node_coords[b]
    d = haversine(lon1, lat1, lon2, lat2)
    return d / BUS_MAX_SPEED_MS


def astar(start, goal, node_coords, bus_adj, walk_neighbor_fn):
    open_set = {start}
    g = {start: 0.0}
    f = {start: heuristic(start, goal, node_coords)}
    expanded = 0

    while open_set:
        current = min(open_set, key=lambda n: f.get(n, float("inf")))
        if current == goal:
            return g[current], expanded

        open_set.remove(current)
        expanded += 1

        neighbors = bus_adj.get(current, []) + walk_neighbor_fn(current)
        for nxt, edge_cost, _dist, _kind in neighbors:
            cand = g[current] + edge_cost
            if cand < g.get(nxt, float("inf")):
                g[nxt] = cand
                f[nxt] = cand + heuristic(nxt, goal, node_coords)
                open_set.add(nxt)

    return float("inf"), expanded


def run_trials(node_ids, node_coords, bus_adj, walk_adj_pre, grid, cell_deg, n_trials=40):
    random.seed(42)
    pairs = []
    for _ in range(n_trials):
        s = random.choice(node_ids)
        t = random.choice(node_ids)
        while t == s:
            t = random.choice(node_ids)
        pairs.append((s, t))

    prefs = [100.0, 300.0, 500.0,1000.0, 2000.0, 5000.0, 10000.0,20000.0, 50000.0, 100000.0]
    results = []

    for pref in prefs:
        t0 = time.perf_counter()
        exp1 = 0
        ok1 = 0
        for s, t in pairs:
            def walk_pre(n):
                return [e for e in walk_adj_pre.get(n, []) if e[2] <= pref]

            cost, expanded = astar(s, t, node_coords, bus_adj, walk_pre)
            exp1 += expanded
            if math.isfinite(cost):
                ok1 += 1
        t1 = time.perf_counter()

        t2 = time.perf_counter()
        exp2 = 0
        ok2 = 0
        cache = {}
        for s, t in pairs:
            def walk_dyn(n):
                key = (n, pref)
                if key in cache:
                    return cache[key]
                vals = [
                    (other, d / WALK_SPEED_MS, d, "walk")
                    for other, d in nearby_nodes(n, pref, node_coords, grid, cell_deg)
                ]
                cache[key] = vals
                return vals

            cost, expanded = astar(s, t, node_coords, bus_adj, walk_dyn)
            exp2 += expanded
            if math.isfinite(cost):
                ok2 += 1
        t3 = time.perf_counter()

        results.append(
            {
                "pref": pref,
                "a1_ms_avg": ((t1 - t0) * 1000.0) / n_trials,
                "a1_exp_avg": exp1 / n_trials,
                "a1_ok": ok1,
                "a2_ms_avg": ((t3 - t2) * 1000.0) / n_trials,
                "a2_exp_avg": exp2 / n_trials,
                "a2_ok": ok2,
            }
        )

    return results


def parse_args():
    parser = argparse.ArgumentParser(description="Benchmark routing models")
    parser.add_argument("kmz_files", nargs="+", help="One or more KMZ files")
    parser.add_argument("--trials", type=int, default=40, help="Number of source-target pairs")
    parser.add_argument("--mode", choices=["db", "kmz"], default="db")
    parser.add_argument("--rebuild-first", action="store_true")
    parser.add_argument("--dbname", default="bus")
    parser.add_argument("--user", default="postgres")
    parser.add_argument("--password", default="44241155")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=5432)
    return parser.parse_args()


def main():
    args = parse_args()
    db_cfg = {
        "dbname": args.dbname,
        "user": args.user,
        "password": args.password,
        "host": args.host,
        "port": args.port,
    }

    t0 = time.perf_counter()

    if args.mode == "db":
        if args.rebuild_first:
            run_original_builder(args.kmz_files, db_cfg)
        node_ids, node_coords, bus_adj = load_graph_from_db(db_cfg)
    else:
        routes = extract_routes_from_kmz(args.kmz_files)
        node_ids, node_coords, bus_adj = build_graph_from_routes(routes)

    t1 = time.perf_counter()

    if not node_ids:
        print("No graph nodes available for benchmarking.")
        return

    grid, cell_deg = build_grid(node_ids, node_coords)
    t2 = time.perf_counter()

    walk_adj_pre = precompute_walking(node_ids, node_coords, grid, cell_deg, BASE_WALK_MAX)
    t3 = time.perf_counter()

    walk_edge_count = sum(len(v) for v in walk_adj_pre.values())
    bus_edge_count = sum(len(v) for v in bus_adj.values())

    print("=== Graph stats ===")
    print(f"mode={args.mode}")
    print(f"nodes={len(node_ids)}")
    print(f"bus_edges_directed={bus_edge_count}")
    print(f"walking_edges_directed_precomputed={walk_edge_count}")
    print(f"load_ms={(t1 - t0) * 1000.0:.2f}")
    print(f"grid_build_ms={(t2 - t1) * 1000.0:.2f}")
    print(f"precompute_walk_ms={(t3 - t2) * 1000.0:.2f}")

    res = run_trials(node_ids, node_coords, bus_adj, walk_adj_pre, grid, cell_deg, n_trials=args.trials)

    print(f"\n=== Trial results ({args.trials} routes each) ===")
    for row in res:
        delta_pct = ((row["a2_ms_avg"] - row["a1_ms_avg"]) / max(1e-9, row["a1_ms_avg"])) * 100.0
        print(
            f"pref={int(row['pref'])}m | "
            f"A1 avg_ms={row['a1_ms_avg']:.3f}, avg_exp={row['a1_exp_avg']:.1f}, solved={row['a1_ok']}/{args.trials} | "
            f"A2 avg_ms={row['a2_ms_avg']:.3f}, avg_exp={row['a2_exp_avg']:.1f}, solved={row['a2_ok']}/{args.trials} | "
            f"A2_vs_A1={delta_pct:+.1f}%"
        )


if __name__ == "__main__":
    main()
