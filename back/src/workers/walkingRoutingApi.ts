import type { LocationDTO } from "../../../types/location";
import type { RoutingWorkerPayload } from "../../../types/navigation";
import { ensurePolylineEndpoints } from "./routingPolyline.js";
import { haversineDistanceM, rebuildWalkingEdgeMetrics } from "./routingWorkerHelpers.js";
import type { StepEdge } from "./routingWorkerTypes.js";

type WalkingRoute = {
  coordinates: LocationDTO[];
  distanceM: number;
  durationSeconds: number;
};

type OsrmRouteResponse = {
  code?: string;
  routes?: Array<{
    geometry?: string;
    distance?: number;
    duration?: number;
  }>;
};

type CacheEntry = WalkingRoute & {
  expiresAt: number;
};

const DEFAULT_OSRM_FOOT_BASE_URL = "https://routing.openstreetmap.de/routed-foot/route/v1/foot";
const DEFAULT_TIMEOUT_MS = 2_000;
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1_000;
const DEFAULT_FALLBACK_WALKING_SPEED_MPS = 1.4;
const DEFAULT_MAX_DETOUR_RATIO = 2.5;
const DEFAULT_MAX_DETOUR_EXTRA_M = 250;
const DEFAULT_TRANSFER_STRAIGHT_LINE_MAX_M = 500;

const walkingRouteCache = new Map<string, CacheEntry>();

function readPositiveNumberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cacheKey(from: LocationDTO, to: LocationDTO): string {
  const normalize = (value: number) => value.toFixed(6);
  return `${normalize(from.lng)},${normalize(from.lat)};${normalize(to.lng)},${normalize(to.lat)}`;
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

function fallbackWalkingRoute(from: LocationDTO, to: LocationDTO): WalkingRoute {
  const distanceM = haversineDistanceM(from, to);
  const fallbackSpeedMps = readPositiveNumberEnv(
    "WALKING_API_FALLBACK_SPEED_MPS",
    DEFAULT_FALLBACK_WALKING_SPEED_MPS,
  );

  return {
    coordinates: [from, to],
    distanceM,
    durationSeconds: distanceM / fallbackSpeedMps,
  };
}

function isBusNodeTransferWalk(step: StepEdge): boolean {
  return step.mode === "walk" && step.fromNodeId >= 0 && step.toNodeId >= 0;
}

function assertPlausibleWalkingRoute(route: WalkingRoute, from: LocationDTO, to: LocationDTO): void {
  const directDistanceM = haversineDistanceM(from, to);
  const maxDetourRatio = readPositiveNumberEnv("OSRM_WALK_MAX_DETOUR_RATIO", DEFAULT_MAX_DETOUR_RATIO);
  const maxDetourExtraM = readPositiveNumberEnv("OSRM_WALK_MAX_DETOUR_EXTRA_M", DEFAULT_MAX_DETOUR_EXTRA_M);
  const excessiveRatio = directDistanceM > 0 && route.distanceM > directDistanceM * maxDetourRatio;
  const excessiveExtra = route.distanceM > directDistanceM + maxDetourExtraM;

  if (excessiveRatio && excessiveExtra) {
    throw new Error(
      `OSRM walking route rejected as implausible detour: routed=${route.distanceM.toFixed(1)}m direct=${directDistanceM.toFixed(1)}m`,
    );
  }
}

async function fetchOsrmWalkingRoute(from: LocationDTO, to: LocationDTO): Promise<WalkingRoute> {
  const baseUrl = (process.env.OSRM_FOOT_BASE_URL ?? DEFAULT_OSRM_FOOT_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = readPositiveNumberEnv("OSRM_WALK_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${baseUrl}/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=polyline&overview=full`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`OSRM walking route failed with HTTP ${response.status}`);
    }

    const body = await response.json() as OsrmRouteResponse;
    const route = body.routes?.[0];
    if (
      body.code !== "Ok"
      || !route
      || typeof route.geometry !== "string"
      || !Number.isFinite(route.distance)
      || !Number.isFinite(route.duration)
    ) {
      throw new Error(`OSRM walking route returned invalid response code ${body.code ?? "unknown"}`);
    }

    const decoded = decodePolyline(route.geometry);
    const walkingRoute = {
      coordinates: ensurePolylineEndpoints(decoded, from, to),
      distanceM: route.distance as number,
      durationSeconds: route.duration as number,
    };

    assertPlausibleWalkingRoute(walkingRoute, from, to);
    return walkingRoute;
  } finally {
    clearTimeout(timeout);
  }
}

async function getWalkingRoute(from: LocationDTO, to: LocationDTO): Promise<WalkingRoute> {
  const key = cacheKey(from, to);
  const cached = walkingRouteCache.get(key);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached;
  }

  try {
    const route = await fetchOsrmWalkingRoute(from, to);
    const ttlMs = readPositiveNumberEnv("OSRM_WALK_CACHE_TTL_MS", DEFAULT_CACHE_TTL_MS);
    walkingRouteCache.set(key, { ...route, expiresAt: now + ttlMs });
    return route;
  } catch {
    return fallbackWalkingRoute(from, to);
  }
}

export async function enrichWalkingStepWithApi(
  step: StepEdge,
  from: LocationDTO,
  to: LocationDTO,
  config: RoutingWorkerPayload["config"],
): Promise<StepEdge> {
  if (step.mode !== "walk") {
    return step;
  }

  const directDistanceM = haversineDistanceM(from, to);
  const transferStraightLineMaxM = readPositiveNumberEnv(
    "OSRM_WALK_TRANSFER_STRAIGHT_LINE_MAX_M",
    DEFAULT_TRANSFER_STRAIGHT_LINE_MAX_M,
  );
  const finalRoute = isBusNodeTransferWalk(step) && directDistanceM <= transferStraightLineMaxM
    ? fallbackWalkingRoute(from, to)
    : await getWalkingRoute(from, to);

  return rebuildWalkingEdgeMetrics(
    step,
    finalRoute.distanceM,
    finalRoute.durationSeconds,
    config,
    finalRoute.coordinates,
  );
}
