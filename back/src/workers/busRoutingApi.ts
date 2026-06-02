import type { LocationDTO } from "../../../types/location";
import type { RouteSegment } from "../../../types/navigation";
import { ensurePolylineEndpoints } from "./routingPolyline.js";
import { haversineDistanceM } from "./routingWorkerHelpers.js";

type BusRouteGeometry = {
  coordinates: LocationDTO[];
  distanceM: number;
};

type OsrmRouteResponse = {
  code?: string;
  routes?: Array<{
    geometry?: string;
    distance?: number;
  }>;
};

type CacheEntry = BusRouteGeometry & {
  expiresAt: number;
};

const DEFAULT_OSRM_BUS_BASE_URL = "https://routing.openstreetmap.de/routed-car/route/v1/driving";
const DEFAULT_TIMEOUT_MS = 2_000;
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1_000;
const DEFAULT_MAX_DETOUR_RATIO = 1.8;
const DEFAULT_MAX_DETOUR_EXTRA_M = 250;
const DEFAULT_MAX_WAYPOINTS = 20;

const busRouteGeometryCache = new Map<string, CacheEntry>();

function readPositiveNumberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function waypointsCacheKey(points: LocationDTO[]): string {
  const normalize = (value: number) => value.toFixed(6);
  return points
    .map((point) => `${normalize(point.lng)},${normalize(point.lat)}`)
    .join(";");
}

function polylineDistanceM(points: LocationDTO[]): number {
  let distanceM = 0;
  for (let idx = 1; idx < points.length; idx += 1) {
    distanceM += haversineDistanceM(points[idx - 1] as LocationDTO, points[idx] as LocationDTO);
  }
  return distanceM;
}

function downsampleWaypoints(points: LocationDTO[]): LocationDTO[] {
  const maxWaypoints = Math.max(
    2,
    Math.floor(readPositiveNumberEnv("OSRM_BUS_MAX_WAYPOINTS", DEFAULT_MAX_WAYPOINTS)),
  );

  if (points.length <= maxWaypoints) {
    return points;
  }

  const sampled: LocationDTO[] = [];
  const lastIndex = points.length - 1;
  for (let idx = 0; idx < maxWaypoints; idx += 1) {
    const sourceIndex = Math.round((idx * lastIndex) / (maxWaypoints - 1));
    const point = points[sourceIndex] as LocationDTO;
    const previous = sampled[sampled.length - 1];
    if (!previous || previous.lat !== point.lat || previous.lng !== point.lng) {
      sampled.push(point);
    }
  }

  return sampled;
}

function decodePolyline(polyline: string, precision = 5): LocationDTO[] {
  const coordinates: LocationDTO[] = [];
  const factor = 10 ** precision;
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < polyline.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = polyline.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < polyline.length);

    const deltaLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    result = 0;
    shift = 0;

    do {
      byte = polyline.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < polyline.length);

    const deltaLng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push({ lat: lat / factor, lng: lng / factor });
  }

  return coordinates.filter((point) =>
    Number.isFinite(point.lat)
    && Number.isFinite(point.lng)
    && point.lat >= -90
    && point.lat <= 90
    && point.lng >= -180
    && point.lng <= 180
  );
}

function assertPlausibleBusGeometryAgainstDistance(route: BusRouteGeometry, referenceDistanceM: number): void {
  const maxDetourRatio = readPositiveNumberEnv("OSRM_BUS_MAX_DETOUR_RATIO", DEFAULT_MAX_DETOUR_RATIO);
  const maxDetourExtraM = readPositiveNumberEnv("OSRM_BUS_MAX_DETOUR_EXTRA_M", DEFAULT_MAX_DETOUR_EXTRA_M);
  const excessiveRatio = referenceDistanceM > 0 && route.distanceM > referenceDistanceM * maxDetourRatio;
  const excessiveExtra = route.distanceM > referenceDistanceM + maxDetourExtraM;

  if (excessiveRatio && excessiveExtra) {
    throw new Error(
      `OSRM bus geometry rejected as implausible detour: routed=${route.distanceM.toFixed(1)}m reference=${referenceDistanceM.toFixed(1)}m`,
    );
  }
}

async function fetchOsrmBusGeometryForWaypoints(points: LocationDTO[]): Promise<BusRouteGeometry> {
  const baseUrl = (process.env.OSRM_BUS_BASE_URL ?? DEFAULT_OSRM_BUS_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = readPositiveNumberEnv("OSRM_BUS_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const coordinates = points.map((point) => `${point.lng},${point.lat}`).join(";");
    const url = `${baseUrl}/${coordinates}?geometries=polyline&overview=full`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`OSRM bus geometry failed with HTTP ${response.status}`);
    }

    const body = await response.json() as OsrmRouteResponse;
    const route = body.routes?.[0];
    if (
      body.code !== "Ok"
      || !route
      || typeof route.geometry !== "string"
      || !Number.isFinite(route.distance)
    ) {
      throw new Error(`OSRM bus geometry returned invalid response code ${body.code ?? "unknown"}`);
    }

    const first = points[0] as LocationDTO;
    const last = points[points.length - 1] as LocationDTO;
    const geometry = {
      coordinates: ensurePolylineEndpoints(decodePolyline(route.geometry), first, last),
      distanceM: route.distance as number,
    };

    assertPlausibleBusGeometryAgainstDistance(geometry, polylineDistanceM(points));
    return geometry;
  } finally {
    clearTimeout(timeout);
  }
}

async function getBusGeometryForWaypoints(points: LocationDTO[]): Promise<BusRouteGeometry> {
  const key = waypointsCacheKey(points);
  const cached = busRouteGeometryCache.get(key);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached;
  }

  const geometry = await fetchOsrmBusGeometryForWaypoints(points);
  const ttlMs = readPositiveNumberEnv("OSRM_BUS_CACHE_TTL_MS", DEFAULT_CACHE_TTL_MS);
  busRouteGeometryCache.set(key, { ...geometry, expiresAt: now + ttlMs });
  return geometry;
}

export async function enrichBusSegmentGeometryWithApi(segment: RouteSegment): Promise<RouteSegment> {
  if (segment.mode !== "bus") {
    return segment;
  }

  const fallbackCoordinates = ensurePolylineEndpoints(segment.coordinates, segment.from, segment.to);
  const waypoints = downsampleWaypoints(fallbackCoordinates);
  if (waypoints.length < 2) {
    return { ...segment, coordinates: fallbackCoordinates };
  }

  try {
    const geometry = await getBusGeometryForWaypoints(waypoints);
    return { ...segment, coordinates: geometry.coordinates };
  } catch {
    return { ...segment, coordinates: fallbackCoordinates };
  }
}
