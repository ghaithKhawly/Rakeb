import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { kml as kmlToGeoJson } from "@tmcw/togeojson";
import { DOMParser } from "@xmldom/xmldom";

const QUICK_ROUTE_URL = process.env.QUICK_ROUTE_URL ?? "http://localhost:3000/api/busses/navigation/quick-route";
const KMZ_PATH = path.resolve("assets/map/public_routes.kmz");
const OUTPUT_DIR = path.resolve("reports");

const OPTIONS = {
  maxWalkingDistanceM: 80,
  maxTotalWalkingDistanceM: 1000,
  maxWalkingNeighbors: 10,
  maxBusTransfers: 10,
  walkingSpeedMps: 1,
};

const CASES_PER_BUCKET = Number(process.env.LOGICAL_AUDIT_CASES_PER_BUCKET ?? 20);

function haversineDistanceM(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

function normalizeRouteName(name) {
  return String(name).replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function toLocalXY(point, refLat) {
  const rad = Math.PI / 180;
  const mPerDegLat = 111132;
  const mPerDegLng = 111320 * Math.cos(refLat * rad);
  return {
    x: point.lng * mPerDegLng,
    y: point.lat * mPerDegLat,
  };
}

function pointToSegmentDistanceM(point, a, b) {
  const refLat = (a.lat + b.lat + point.lat) / 3;
  const p = toLocalXY(point, refLat);
  const p1 = toLocalXY(a, refLat);
  const p2 = toLocalXY(b, refLat);

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) {
    const ox = p.x - p1.x;
    const oy = p.y - p1.y;
    return Math.sqrt(ox * ox + oy * oy);
  }

  const t = Math.max(0, Math.min(1, ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / len2));
  const cx = p1.x + t * dx;
  const cy = p1.y + t * dy;
  const ox = p.x - cx;
  const oy = p.y - cy;
  return Math.sqrt(ox * ox + oy * oy);
}

function pointToPolylineDistanceM(point, polyline) {
  if (!polyline || polyline.length === 0) return Number.POSITIVE_INFINITY;
  if (polyline.length === 1) return haversineDistanceM(point, polyline[0]);

  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polyline.length - 1; i += 1) {
    const d = pointToSegmentDistanceM(point, polyline[i], polyline[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

function parseLineCoordinates(rawCoordinates) {
  if (!Array.isArray(rawCoordinates)) return [];
  return rawCoordinates
    .map((coordinate) => {
      if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
      const lng = Number(coordinate[0]);
      const lat = Number(coordinate[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    })
    .filter(Boolean);
}

function extractFeatureLines(feature) {
  const geometryType = feature?.geometry?.type;
  const coordinates = feature?.geometry?.coordinates;
  if (!geometryType || !coordinates) return [];

  if (geometryType === "LineString") {
    return [parseLineCoordinates(coordinates)];
  }

  if (geometryType === "MultiLineString" && Array.isArray(coordinates)) {
    return coordinates.map((line) => parseLineCoordinates(line));
  }

  return [];
}

function resolveRouteName(feature, index) {
  const properties = feature?.properties ?? {};
  const candidates = [
    properties.route,
    properties.route_name,
    properties.line,
    properties.name,
    properties.Name,
    properties.id,
  ];
  const hit = candidates.find((v) => typeof v === "string" && v.trim().length > 0);
  return hit ? String(hit).replace(/\s+/g, " ").trim() : `Route ${index + 1}`;
}

async function loadKmzRoutes() {
  const buffer = await fs.readFile(KMZ_PATH);
  const zip = await JSZip.loadAsync(buffer);
  const kmlEntry = Object.values(zip.files).find((file) => !file.dir && file.name.toLowerCase().endsWith(".kml"));
  if (!kmlEntry) throw new Error("KMZ does not contain a KML file");

  const kmlContent = await kmlEntry.async("text");
  const dom = new DOMParser().parseFromString(kmlContent, "text/xml");
  const geoJson = kmlToGeoJson(dom);

  const byName = new Map();
  const allLines = [];
  const points = [];
  const features = Array.isArray(geoJson?.features) ? geoJson.features : [];

  features.forEach((feature, idx) => {
    const routeName = resolveRouteName(feature, idx);
    const key = normalizeRouteName(routeName);
    const lines = extractFeatureLines(feature).filter((line) => line.length >= 2);
    if (lines.length === 0) return;

    const current = byName.get(key) ?? [];
    current.push(...lines);
    byName.set(key, current);

    for (const line of lines) {
      allLines.push(line);
      points.push(line[0], line[line.length - 1]);
      const stride = Math.max(1, Math.floor(line.length / 8));
      for (let i = stride; i < line.length - 1; i += stride) {
        points.push(line[i]);
      }
    }
  });

  const unique = [];
  const seen = new Set();
  for (const p of points) {
    const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
  }

  return { byName, allLines, points: unique };
}

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pickPairs(points, minDistanceM, maxDistanceM, targetCount, seed, label) {
  const rng = createRng(seed);
  const pairs = [];
  const seen = new Set();
  const maxAttempts = targetCount * 900;

  for (let attempt = 0; attempt < maxAttempts && pairs.length < targetCount; attempt += 1) {
    const i = Math.floor(rng() * points.length);
    const j = Math.floor(rng() * points.length);
    if (i === j) continue;

    const from = points[i];
    const to = points[j];
    const key = `${from.lat.toFixed(6)},${from.lng.toFixed(6)}>${to.lat.toFixed(6)},${to.lng.toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const d = haversineDistanceM(from, to);
    if (d < minDistanceM || d > maxDistanceM) continue;

    pairs.push({
      name: `${label}-${pairs.length + 1}`,
      bucket: label,
      from,
      to,
      directDistanceM: d,
    });
  }

  return pairs;
}

async function callRoute(from, to, options = OPTIONS) {
  const response = await fetch(QUICK_ROUTE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ from, to, options }),
  });
  let body;
  try {
    body = await response.json();
  } catch {
    body = { error: "non-json response" };
  }
  return { status: response.status, body };
}

function minDistanceToAnyLine(point, lines) {
  let best = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    const d = pointToPolylineDistanceM(point, line);
    if (d < best) best = d;
  }
  return best;
}

function evaluateLogicalIssues(result, pair, kmz) {
  const issues = [];
  const busSegments = result.segments.filter((s) => s.mode === "bus");
  const walkingSegments = result.segments.filter((s) => s.mode === "walk");

  const totalDistanceM = result.segments.reduce((sum, seg) => sum + (seg.distanceM ?? 0), 0);
  const detourRatio = totalDistanceM / Math.max(pair.directDistanceM, 1);
  if (detourRatio > 1.8 && pair.directDistanceM > 1000) {
    issues.push({
      type: "high_detour_ratio",
      severity: "medium",
      details: `detour ratio ${detourRatio.toFixed(2)}x vs direct distance`,
    });
  }

  if (result.transferCount >= 2) {
    issues.push({
      type: "many_transfers",
      severity: "medium",
      details: `transferCount=${result.transferCount}`,
    });
  }

  for (let i = 0; i < busSegments.length - 1; i += 1) {
    const current = busSegments[i];
    const next = busSegments[i + 1];
    const transferPoint = current.to;
    const remainingToDestM = haversineDistanceM(transferPoint, pair.to);

    if (remainingToDestM < 700 && next.distanceM < 450) {
      issues.push({
        type: "transfer_near_destination",
        severity: "high",
        details: `remaining ${remainingToDestM.toFixed(0)}m, next bus segment ${next.distanceM.toFixed(0)}m`,
      });
    }

    if ((next.timeSeconds ?? 0) < 180 && next.distanceM < 350) {
      issues.push({
        type: "very_short_post_transfer_bus_segment",
        severity: "medium",
        details: `next bus ${next.distanceM.toFixed(0)}m / ${next.timeSeconds.toFixed(0)}s`,
      });
    }
  }

  for (const walk of walkingSegments) {
    if (walk.distanceM < 350) continue;

    const start = walk.from;
    const end = walk.to;
    const nearStart = minDistanceToAnyLine(start, kmz.allLines);
    const nearEnd = minDistanceToAnyLine(end, kmz.allLines);

    if (nearStart < 90 && nearEnd < 90) {
      issues.push({
        type: "long_walk_where_bus_lines_exist_nearby",
        severity: "high",
        details: `walk ${walk.distanceM.toFixed(0)}m, nearby lines start=${nearStart.toFixed(0)}m end=${nearEnd.toFixed(0)}m`,
      });
    }
  }

  for (const bus of busSegments) {
    const coords = Array.isArray(bus.coordinates) ? bus.coordinates : [];
    if (coords.length < 2) continue;

    const startDist = haversineDistanceM(coords[0], pair.to);
    const endDist = haversineDistanceM(coords[coords.length - 1], pair.to);
    if (endDist > startDist + 500 && bus.distanceM > 600) {
      issues.push({
        type: "bus_backtracking_away_from_destination",
        severity: "medium",
        details: `distance-to-destination increased by ${(endDist - startDist).toFixed(0)}m`,
      });
    }

    if (bus.routeName) {
      const lines = kmz.byName.get(normalizeRouteName(bus.routeName)) ?? [];
      if (lines.length > 0) {
        const fromOffset = minDistanceToAnyLine(bus.from, lines);
        const toOffset = minDistanceToAnyLine(bus.to, lines);
        if (fromOffset > 120 || toOffset > 120) {
          issues.push({
            type: "bus_segment_poorly_aligned_with_kmz_route",
            severity: "low",
            details: `${bus.routeName}: fromOff=${fromOffset.toFixed(0)}m toOff=${toOffset.toFixed(0)}m`,
          });
        }
      }
    }
  }

  return { issues, detourRatio };
}

async function evaluateAlternatives(pair, baseResult) {
  if (!baseResult || typeof baseResult.transferCount !== "number" || baseResult.transferCount <= 0) {
    return null;
  }

  const altTransfers = Math.max(0, baseResult.transferCount - 1);
  const alt = await callRoute(pair.from, pair.to, {
    ...OPTIONS,
    maxBusTransfers: altTransfers,
  });

  if (alt.status !== 200) {
    return {
      tested: true,
      altStatus: alt.status,
      finding: null,
    };
  }

  const etaDeltaPct = ((alt.body.etaSeconds - baseResult.etaSeconds) / Math.max(baseResult.etaSeconds, 1)) * 100;
  const transferDelta = baseResult.transferCount - alt.body.transferCount;

  const finding = transferDelta > 0 && etaDeltaPct <= 10
    ? {
      type: "possible_needless_transfer",
      severity: "high",
      details: `alt transfers ${alt.body.transferCount} vs ${baseResult.transferCount} with eta delta ${etaDeltaPct.toFixed(1)}%`,
    }
    : null;

  return {
    tested: true,
    altStatus: alt.status,
    finding,
  };
}

function rankSeverity(issues) {
  let score = 0;
  for (const issue of issues) {
    if (issue.severity === "high") score += 3;
    else if (issue.severity === "medium") score += 2;
    else score += 1;
  }
  return score;
}

function groupSummary(rows) {
  const success = rows.filter((r) => r.status === 200);
  const withIssues = success.filter((r) => r.issues.length > 0);
  const high = success.filter((r) => r.issues.some((i) => i.severity === "high"));

  return {
    totalCases: rows.length,
    successfulRoutes: success.length,
    routesWithAnyIssue: withIssues.length,
    routesWithHighSeverityIssue: high.length,
    avgIssuesPerSuccessfulRoute: success.length ? success.reduce((s, r) => s + r.issues.length, 0) / success.length : null,
    issueTypeCounts: success
      .flatMap((r) => r.issues)
      .reduce((acc, issue) => {
        acc[issue.type] = (acc[issue.type] ?? 0) + 1;
        return acc;
      }, {}),
  };
}

async function main() {
  const kmz = await loadKmzRoutes();
  const pairs = [
    ...pickPairs(kmz.points, 500, 3000, CASES_PER_BUCKET, 1001, "short"),
    ...pickPairs(kmz.points, 3000, 8000, CASES_PER_BUCKET, 2002, "medium"),
    ...pickPairs(kmz.points, 8000, 20000, CASES_PER_BUCKET, 3003, "long"),
  ];

  const rows = [];

  for (const pair of pairs) {
    const base = await callRoute(pair.from, pair.to, OPTIONS);
    if (base.status !== 200) {
      rows.push({ ...pair, status: base.status, error: base.body?.error ?? "failed", issues: [] });
      continue;
    }

    const logical = evaluateLogicalIssues(base.body, pair, kmz);
    const alt = await evaluateAlternatives(pair, base.body);
    if (alt?.finding) {
      logical.issues.push(alt.finding);
    }

    rows.push({
      ...pair,
      status: 200,
      transferCount: base.body.transferCount,
      walkingDistanceM: base.body.walkingDistanceM,
      etaSeconds: base.body.etaSeconds,
      detourRatio: logical.detourRatio,
      issues: logical.issues,
      severityScore: rankSeverity(logical.issues),
    });
  }

  const summary = groupSummary(rows);

  const worst = rows
    .filter((r) => r.status === 200 && r.issues.length > 0)
    .sort((a, b) => b.severityScore - a.severityScore)
    .slice(0, 25);

  const markdown = [
    "# Logical Route Quality Audit",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Endpoint: ${QUICK_ROUTE_URL}`,
    `Cases: ${summary.totalCases}`,
    "",
    "## Summary",
    "",
    `- Successful routes: ${summary.successfulRoutes}`,
    `- Routes with issues: ${summary.routesWithAnyIssue}`,
    `- Routes with high-severity issue: ${summary.routesWithHighSeverityIssue}`,
    `- Avg issues per successful route: ${summary.avgIssuesPerSuccessfulRoute?.toFixed(2) ?? "n/a"}`,
    "",
    "### Issue Type Counts",
    ...Object.entries(summary.issueTypeCounts).map(([k, v]) => `- ${k}: ${v}`),
    "",
    "## Top Problematic Routes",
    "",
    "| Case | Bucket | ETA min | Transfers | Walk m | Detour x | Severity Score | Issues |",
    "|---|---|---:|---:|---:|---:|---:|---|",
    ...worst.map((r) => `| ${r.name} | ${r.bucket} | ${(r.etaSeconds / 60).toFixed(1)} | ${r.transferCount} | ${r.walkingDistanceM.toFixed(0)} | ${r.detourRatio.toFixed(2)} | ${r.severityScore} | ${r.issues.map((i) => i.type).join(", ")} |`),
    "",
  ].join("\n");

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(OUTPUT_DIR, `route_logical_audit_${stamp}.json`);
  const mdPath = path.join(OUTPUT_DIR, `route_logical_audit_${stamp}.md`);

  await fs.writeFile(jsonPath, JSON.stringify({ summary, rows }, null, 2), "utf8");
  await fs.writeFile(mdPath, markdown, "utf8");

  console.log(JSON.stringify({ ok: true, summary, output: { json: jsonPath, markdown: mdPath } }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
