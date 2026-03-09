#!/usr/bin/env python3
"""
Export nodes from PostgreSQL to a KMZ file for visualization.
Each node is displayed as a placemark with its ID and the number of routes using it.
"""

import argparse
import zipfile
import psycopg2
import psycopg2.extras
from xml.etree.ElementTree import Element, SubElement, ElementTree, tostring
from xml.dom import minidom

def prettify(elem):
    """Return a pretty-printed XML string for the Element."""
    rough_string = tostring(elem, 'utf-8')
    reparsed = minidom.parseString(rough_string)
    return reparsed.toprettyxml(indent="  ")

def main():
    parser = argparse.ArgumentParser(description='Export nodes to KMZ')
    parser.add_argument('--dbname', required=True, help='PostgreSQL database name')
    parser.add_argument('--user', required=True, help='Database user')
    parser.add_argument('--password', required=True, help='Database password')
    parser.add_argument('--host', default='localhost', help='Database host')
    parser.add_argument('--port', default=5432, type=int, help='Database port')
    parser.add_argument('--output', default='nodes.kmz', help='Output KMZ file')
    args = parser.parse_args()

    conn = psycopg2.connect(
        dbname=args.dbname,
        user=args.user,
        password=args.password,
        host=args.host,
        port=args.port
    )
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    # Fetch all nodes with their route count (using route_nodes table)
    cur.execute("""
        SELECT n.id, n.latitude, n.longitude,
               COALESCE(COUNT(rn.route_id), 0) AS route_count
        FROM nodes n
        LEFT JOIN route_nodes rn ON n.id = rn.node_id
        GROUP BY n.id
        ORDER BY n.id
    """)
    nodes = cur.fetchall()
    cur.close()
    conn.close()

    # Create KML root
    kml = Element('kml', xmlns='http://www.opengis.net/kml/2.2')
    document = SubElement(kml, 'Document')
    name = SubElement(document, 'name')
    name.text = 'Transit Nodes'

    # Style for nodes (optional)
    style = SubElement(document, 'Style', id='nodeStyle')
    icon_style = SubElement(style, 'IconStyle')
    scale = SubElement(icon_style, 'scale')
    scale.text = '0.8'
    icon = SubElement(icon_style, 'Icon')
    href = SubElement(icon, 'href')
    href.text = 'http://maps.google.com/mapfiles/kml/paddle/red-circle.png'

    for node in nodes:
        node_id, lat, lon, route_count = node

        placemark = SubElement(document, 'Placemark')
        name = SubElement(placemark, 'name')
        name.text = f'Node {node_id} ({route_count} route{"s" if route_count != 1 else ""})'

        styleUrl = SubElement(placemark, 'styleUrl')
        styleUrl.text = '#nodeStyle'

        point = SubElement(placemark, 'Point')
        coordinates = SubElement(point, 'coordinates')
        coordinates.text = f'{lon},{lat},0'

    # Write to temporary KML file
    kml_content = prettify(kml)
    with open('temp_nodes.kml', 'w', encoding='utf-8') as f:
        f.write(kml_content)

    # Zip into KMZ
    with zipfile.ZipFile(args.output, 'w', zipfile.ZIP_DEFLATED) as kmz:
        kmz.write('temp_nodes.kml', 'doc.kml')

    # Clean up
    os.remove('temp_nodes.kml')
    print(f"Exported {len(nodes)} nodes to {args.output}")

if __name__ == '__main__':
    import os
    main()