import json
import psycopg2

DB = {
    "dbname": "bus",
    "user": "postgres",
    "password": "44241155",
    "host": "localhost",
    "port": 5432,
}

conn = psycopg2.connect(**DB)
cur = conn.cursor()

cur.execute("SELECT id, latitude, longitude FROM nodes ORDER BY id")
nodes = [{"id": r[0], "lat": float(r[1]), "lon": float(r[2])} for r in cur.fetchall()]

cur.execute("SELECT from_node, to_node, travel_time, distance_km FROM edges WHERE route_id IS NOT NULL ORDER BY id")
bus_edges = [
    {"from": r[0], "to": r[1], "travel_time": float(r[2]), "distance_km": float(r[3]), "type": "bus"}
    for r in cur.fetchall()
]

cur.execute("SELECT from_node, to_node, travel_time, distance_km FROM edges WHERE route_id IS NULL ORDER BY id")
walk_edges = [
    {"from": r[0], "to": r[1], "travel_time": float(r[2]), "distance_km": float(r[3]), "type": "walk"}
    for r in cur.fetchall()
]

cur.close()
conn.close()

payload_a2 = {"nodes": nodes, "edges": bus_edges}
payload_a1 = {"nodes": nodes, "edges": bus_edges + walk_edges}

s2 = json.dumps(payload_a2, separators=(",", ":")).encode("utf-8")
s1 = json.dumps(payload_a1, separators=(",", ":")).encode("utf-8")

print("nodes", len(nodes))
print("bus_edges", len(bus_edges))
print("walking_edges", len(walk_edges))
print("payload_a2_bytes", len(s2))
print("payload_a1_bytes", len(s1))
print("ratio_a1_over_a2", round(len(s1) / max(1, len(s2)), 2))
