import math
import random
import time
from collections import defaultdict

import psycopg2

DB = {
    "dbname": "bus",
    "user": "postgres",
    "password": "44241155",
    "host": "localhost",
    "port": 5432,
}

BASE_WALK_MAX = 500.0
WALK_SPEED_MS = 1.4
BUS_MAX_SPEED_MS = 25.0 * 1000 / 3600


def haversine(lon1, lat1, lon2, lat2):
    r = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def load_graph():
    conn = psycopg2.connect(**DB)
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


def heuristic(a, b, node_coords):
    lat1, lon1 = node_coords[a]
    lat2, lon2 = node_coords[b]
    d = haversine(lon1, lat1, lon2, lat2)
    return d / BUS_MAX_SPEED_MS


def run_trials(node_ids, node_coords, bus_adj, walk_adj_pre, grid, cell_deg, n_trials=40):
    random.seed(42)
    pairs = []
    for _ in range(n_trials):
        s = random.choice(node_ids)
        t = random.choice(node_ids)
        while t == s:
            t = random.choice(node_ids)
        pairs.append((s, t))

    prefs = [100.0, 300.0, 500.0]
    results = []

    for pref in prefs:
        # approach 1: precomputed + route-time filter
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

        # approach 2a: dynamic generation during search with per-node cache
        t2 = time.perf_counter()
        exp2 = 0
        ok2 = 0
        cache = {}

        for s, t in pairs:
            def walk_dyn(n):
                key = (n, pref)
                if key in cache:
                    return cache[key]
                vals = [(other, d / WALK_SPEED_MS, d, "walk")
                        for other, d in nearby_nodes(n, pref, node_coords, grid, cell_deg)]
                cache[key] = vals
                return vals

            cost, expanded = astar(s, t, node_coords, bus_adj, walk_dyn)
            exp2 += expanded
            if math.isfinite(cost):
                ok2 += 1
        t3 = time.perf_counter()

        # approach 2b: dynamic generation during search without cache
        t4 = time.perf_counter()
        exp3 = 0
        ok3 = 0

        for s, t in pairs:
            def walk_dyn_no_cache(n):
                return [(other, d / WALK_SPEED_MS, d, "walk")
                        for other, d in nearby_nodes(n, pref, node_coords, grid, cell_deg)]

            cost, expanded = astar(s, t, node_coords, bus_adj, walk_dyn_no_cache)
            exp3 += expanded
            if math.isfinite(cost):
                ok3 += 1
        t5 = time.perf_counter()

        results.append({
            "pref": pref,
            "a1_ms_total": (t1 - t0) * 1000,
            "a1_ms_avg": ((t1 - t0) * 1000) / n_trials,
            "a1_exp_avg": exp1 / n_trials,
            "a1_ok": ok1,
            "a2_ms_total": (t3 - t2) * 1000,
            "a2_ms_avg": ((t3 - t2) * 1000) / n_trials,
            "a2_exp_avg": exp2 / n_trials,
            "a2_ok": ok2,
            "a3_ms_total": (t5 - t4) * 1000,
            "a3_ms_avg": ((t5 - t4) * 1000) / n_trials,
            "a3_exp_avg": exp3 / n_trials,
            "a3_ok": ok3,
        })

    return results


def main():
    t0 = time.perf_counter()
    node_ids, node_coords, bus_adj = load_graph()
    t1 = time.perf_counter()

    grid, cell_deg = build_grid(node_ids, node_coords)
    t2 = time.perf_counter()

    walk_adj_pre = precompute_walking(node_ids, node_coords, grid, cell_deg, BASE_WALK_MAX)
    t3 = time.perf_counter()

    walk_edge_count = sum(len(v) for v in walk_adj_pre.values())
    bus_edge_count = sum(len(v) for v in bus_adj.values())

    print("=== Graph stats ===")
    print(f"nodes={len(node_ids)}")
    print(f"bus_edges_directed={bus_edge_count}")
    print(f"walking_edges_directed_precomputed={walk_edge_count}")
    print(f"load_ms={(t1-t0)*1000:.2f}")
    print(f"grid_build_ms={(t2-t1)*1000:.2f}")
    print(f"precompute_walk_ms={(t3-t2)*1000:.2f}")

    res = run_trials(node_ids, node_coords, bus_adj, walk_adj_pre, grid, cell_deg)

    n_trials = 40
    print(f"\n=== Trial results ({n_trials} routes each) ===")
    for row in res:
        print(
            f"pref={int(row['pref'])}m | "
            f"A1 avg_ms={row['a1_ms_avg']:.3f}, avg_exp={row['a1_exp_avg']:.1f}, solved={row['a1_ok']}/{n_trials} | "
            f"A2-cache avg_ms={row['a2_ms_avg']:.3f}, avg_exp={row['a2_exp_avg']:.1f}, solved={row['a2_ok']}/{n_trials} | "
            f"A2-no-cache avg_ms={row['a3_ms_avg']:.3f}, avg_exp={row['a3_exp_avg']:.1f}, solved={row['a3_ok']}/{n_trials}"
        )


if __name__ == "__main__":
    main()
