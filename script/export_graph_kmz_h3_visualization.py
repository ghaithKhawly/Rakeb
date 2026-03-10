#!/usr/bin/env python3
"""
Export the transit graph (nodes + edges) from PostgreSQL to a KMZ file.
- Nodes: colored circles with route count and H3 cell info.
- Edges: colored lines grouped by route (bus edges) or dashed (walking edges).
"""

import os
import argparse
import zipfile
import psycopg2
import psycopg2.extras
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom import minidom

# Colors for routes (cycle through these)
ROUTE_COLORS = [
    "ff0000ff",  # red
    "ff00ff00",  # green
    "ffff0000",  # blue
    "ff00ffff",  # yellow
    "ffff00ff",  # magenta
    "ffffff00",  # cyan
    "ff0080ff",  # orange
    "ff8000ff",  # pink
    "ff008080",  # dark yellow
    "ff800080",  # purple
    "ff808000",  # teal
    "ff008000",  # dark green
    "ff000080",  # dark red
    "ff800000",  # dark blue
    "ff404040",  # dark gray
]


def prettify(elem):
    rough_string = tostring(elem, "utf-8")
    reparsed = minidom.parseString(rough_string)
    return reparsed.toprettyxml(indent="  ")


def main():
    parser = argparse.ArgumentParser(description="Export graph to KMZ")
    parser.add_argument("--dbname", required=True, help="PostgreSQL database name")
    parser.add_argument("--user", required=True, help="Database user")
    parser.add_argument("--password", required=True, help="Database password")
    parser.add_argument("--host", default="localhost", help="Database host")
    parser.add_argument("--port", default=5432, type=int, help="Database port")
    parser.add_argument("--output", default="graph.kmz", help="Output KMZ file")
    args = parser.parse_args()

    conn = psycopg2.connect(
        dbname=args.dbname,
        user=args.user,
        password=args.password,
        host=args.host,
        port=args.port,
    )
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    # Fetch nodes with route counts, endpoint detection, and h3_cell
    cur.execute(
        """
        WITH node_route_info AS (
            SELECT n.id, n.latitude, n.longitude, n.h3_cell,
                   COUNT(DISTINCT rn.route_id) AS route_count,
                   ARRAY_AGG(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL) AS route_names,
                   -- Detect endpoints: nodes at sequence 0 or max sequence for any route
                   BOOL_OR(
                       rn.sequence_order = 0 OR
                       rn.sequence_order = (SELECT MAX(sequence_order) FROM route_nodes WHERE route_id = rn.route_id)
                   ) AS is_endpoint
            FROM nodes n
            LEFT JOIN route_nodes rn ON n.id = rn.node_id
            LEFT JOIN routes r ON rn.route_id = r.id
            GROUP BY n.id
        )
        SELECT id, latitude, longitude, h3_cell, 
               COALESCE(route_count, 0) AS route_count,
               COALESCE(route_names, '{}') AS route_names,
               COALESCE(is_endpoint, false) AS is_endpoint
        FROM node_route_info
        ORDER BY id
    """
    )
    nodes = cur.fetchall()

    # Fetch edges with route name and geometry as text coordinates
    cur.execute(
        """
        SELECT e.id, e.from_node, e.to_node, e.route_id,
               r.name AS route_name,
               e.travel_time, e.distance_km,
               ST_AsText(e.geom) AS geom_wkt
        FROM edges e
        LEFT JOIN routes r ON e.route_id = r.id
        ORDER BY e.route_id NULLS LAST, e.id
    """
    )
    edges = cur.fetchall()

    # Fetch routes for color mapping
    cur.execute("SELECT id, name FROM routes ORDER BY id")
    routes = cur.fetchall()
    route_color_map = {}
    for i, route in enumerate(routes):
        route_color_map[route["id"]] = ROUTE_COLORS[i % len(ROUTE_COLORS)]

    cur.close()
    conn.close()

    # --- Build KML ---
    kml = Element("kml", xmlns="http://www.opengis.net/kml/2.2")
    document = SubElement(kml, "Document")
    doc_name = SubElement(document, "name")
    doc_name.text = "Transit Graph"

    # Node styles: endpoint (green/small), single-route (yellow), transfer/cross (red/large)
    for style_id, color, scale, label in [
        ("endpoint", "ff00ff00", "0.6", "Endpoint"),          # green
        ("singleRoute", "ff00d4ff", "0.7", "Single Route"),   # yellow
        ("transfer", "ff0000ff", "1.0", "Transfer/Cross"),    # red
    ]:
        style = SubElement(document, "Style", id=style_id)
        icon_style = SubElement(style, "IconStyle")
        SubElement(icon_style, "scale").text = scale
        SubElement(icon_style, "color").text = color
        icon = SubElement(icon_style, "Icon")
        SubElement(icon, "href").text = (
            "http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png"
        )

    # Walking edge style (dashed gray line)
    walk_style = SubElement(document, "Style", id="walking")
    walk_line = SubElement(walk_style, "LineStyle")
    SubElement(walk_line, "color").text = "ff808080"  # gray
    SubElement(walk_line, "width").text = "2"

    # Line styles per route (solid colored lines for bus routes)
    for route_id, color in route_color_map.items():
        style = SubElement(document, "Style", id=f"route_{route_id}")
        line_style = SubElement(style, "LineStyle")
        SubElement(line_style, "color").text = color
        SubElement(line_style, "width").text = "3"

    # --- Nodes folder ---
    nodes_folder = SubElement(document, "Folder")
    SubElement(nodes_folder, "name").text = "Nodes"

    for node in nodes:
        nid, lat, lon, h3_cell = (
            node["id"],
            node["latitude"],
            node["longitude"],
            node["h3_cell"],
        )
        route_count = node["route_count"]
        route_names = node["route_names"] if node["route_names"] != [""] else []
        is_endpoint = node["is_endpoint"]

        pm = SubElement(nodes_folder, "Placemark")
        SubElement(pm, "name").text = f"Node {nid}"
        desc_lines = [
            f"Routes: {route_count}",
            f'Type: {"Endpoint" if is_endpoint else "Transfer" if route_count > 1 else "Single Route"}',
            f'H3 Cell: {h3_cell or "N/A"}',
        ]
        if route_names:
            desc_lines.append(f'Lines: {", ".join(str(n) for n in route_names)}')
        SubElement(pm, "description").text = "\n".join(desc_lines)
        
        # Choose style: endpoint (green) > transfer (red) > single-route (yellow)
        if is_endpoint:
            style_url = "#endpoint"
        elif route_count > 1:
            style_url = "#transfer"
        else:
            style_url = "#singleRoute"
        SubElement(pm, "styleUrl").text = style_url

        point = SubElement(pm, "Point")
        SubElement(point, "coordinates").text = f"{lon},{lat},0"

    # --- Edges folder (grouped by route) ---
    edges_folder = SubElement(document, "Folder")
    SubElement(edges_folder, "name").text = "Edges"

    for edge in edges:
        geom_wkt = edge["geom_wkt"]
        if not geom_wkt:
            continue

        # Parse LINESTRING(lon lat, lon lat, ...) to KML coordinates
        inner = geom_wkt.replace("LINESTRING(", "").replace(")", "")
        coord_pairs = inner.split(",")
        kml_coords = " ".join(
            f"{pair.strip().split()[0]},{pair.strip().split()[1]},0"
            for pair in coord_pairs
            if len(pair.strip().split()) >= 2
        )

        route_id = edge["route_id"]
        route_name = edge["route_name"] or "Walking"
        label = f'{route_name}: {edge["from_node"]}→{edge["to_node"]}'

        pm = SubElement(edges_folder, "Placemark")
        SubElement(pm, "name").text = label
        SubElement(pm, "description").text = (
            f'Distance: {edge["distance_km"]:.2f} km\n'
            f'Travel time: {edge["travel_time"]:.0f} sec'
        )
        # Apply walking style for NULL route_id, otherwise use route color
        if route_id and route_id in route_color_map:
            SubElement(pm, "styleUrl").text = f"#route_{route_id}"
        else:
            SubElement(pm, "styleUrl").text = "#walking"

        line = SubElement(pm, "LineString")
        SubElement(line, "tessellate").text = "1"
        SubElement(line, "coordinates").text = kml_coords

    # --- Write KMZ ---
    kml_content = prettify(kml)
    tmp_kml = "temp_graph.kml"
    with open(tmp_kml, "w", encoding="utf-8") as f:
        f.write(kml_content)

    with zipfile.ZipFile(args.output, "w", zipfile.ZIP_DEFLATED) as kmz:
        kmz.write(tmp_kml, "doc.kml")

    os.remove(tmp_kml)
    print(f"Exported {len(nodes)} nodes + {len(edges)} edges to {args.output}")


if __name__ == "__main__":
    import os

    main()
