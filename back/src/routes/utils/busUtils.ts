import type {
  RouteSegment,
  RoutingPreferenceWeights,
  NavigationRouteResult,
  EffectiveRoutingConfig,
} from "../../../../types/navigation";
import {
  DEFAULT_MAX_BUS_TRANSFERS,
  TRANSFER_EXP_COEFF,
  TRANSFER_EXP_RATE,
  WALK_EXP_COEFF,
  WALK_EXP_SCALE_M,
  WALK_LINEAR_COEFF,
} from "../../constants/routingConstants";

export const DEFAULT_ROUTING_WEIGHTS: RoutingPreferenceWeights = {
  speed: 1,
  crowding: 1,
  price: 1,
  transfer: 1,
  walking: 1,
};

export const DEFAULT_ROUTING_CONFIG = {
  maxWalkingDistanceM: 1000,
  maxTotalWalkingDistanceM: 2000,
  maxWalkingNeighbors: 12,
  maxBusTransfers: DEFAULT_MAX_BUS_TRANSFERS,
  walkingSpeedMps: 1.25,
  walkLinearCoeff: WALK_LINEAR_COEFF,
  walkExpCoeff: WALK_EXP_COEFF,
  walkExpScaleM: WALK_EXP_SCALE_M,
  transferExpCoeff: TRANSFER_EXP_COEFF,
  transferExpRate: TRANSFER_EXP_RATE,
};

export function normalizeWeights(weights: RoutingPreferenceWeights): RoutingPreferenceWeights {
  const raw = {
    speed: Math.max(0, weights.speed),
    crowding: Math.max(0, weights.crowding),
    price: Math.max(0, weights.price),
    transfer: Math.max(0, weights.transfer),
    walking: Math.max(0, weights.walking),
  };

  const sum = raw.speed + raw.crowding + raw.price + raw.transfer + raw.walking;
  if (sum <= 0) {
    return {
      speed: 0.2,
      crowding: 0.2,
      price: 0.2,
      transfer: 0.2,
      walking: 0.2,
    };
  }

  return {
    speed: raw.speed / sum,
    crowding: raw.crowding / sum,
    price: raw.price / sum,
    transfer: raw.transfer / sum,
    walking: raw.walking / sum,
  };
}

export function deriveDynamicMaxWalkingDistanceM(maxTotalWalkingDistanceM: number): number {
  return Math.max(300, maxTotalWalkingDistanceM * 0.35);
}

export function normalizeRouteSegment(
  segment: Partial<RouteSegment>,
  fallbackFrom: { lat: number; lng: number; label?: string },
  fallbackTo: { lat: number; lng: number; label?: string },
): RouteSegment {
  const from = segment.from ?? fallbackFrom;
  const to = segment.to ?? fallbackTo;

  const coordinates = Array.isArray(segment.coordinates) && segment.coordinates.length >= 2
    ? segment.coordinates
    : [from, to];

  return {
    mode: segment.mode === "bus" ? "bus" : "walk",
    routeId: typeof segment.routeId === "number" ? segment.routeId : null,
    routeName: typeof segment.routeName === "string" ? segment.routeName : null,
    from,
    to,
    coordinates,
    distanceM: Number(segment.distanceM ?? 0),
    timeSeconds: Number(segment.timeSeconds ?? 0),
    cost: Number(segment.cost ?? 0),
  };
}

export function normalizeRouteResultForSchema(
  result: NavigationRouteResult,
  requestFrom: { lat: number; lng: number; label?: string },
  requestTo: { lat: number; lng: number; label?: string },
): NavigationRouteResult {
  const baseFrom = result.from ?? requestFrom;
  const baseTo = result.to ?? requestTo;

  const normalizedResult = {
    ...result,
    from: baseFrom,
    to: baseTo,
    segments: (Array.isArray(result.segments) ? result.segments : []).map((segment) =>
      normalizeRouteSegment(segment, baseFrom, baseTo),
    ),
  };

  const normalizedRoutes = Array.isArray(result.routes)
    ? result.routes.map((route) => ({
      ...route,
      from: route.from ?? baseFrom,
      to: route.to ?? baseTo,
      segments: (Array.isArray(route.segments) ? route.segments : []).map((segment) =>
        normalizeRouteSegment(segment, route.from ?? baseFrom, route.to ?? baseTo),
      ),
    }))
    : null;

  const normalizedAlternatives = Array.isArray(result.alternatives)
    ? result.alternatives.map((route) => ({
      ...route,
      from: route.from ?? baseFrom,
      to: route.to ?? baseTo,
      segments: (Array.isArray(route.segments) ? route.segments : []).map((segment) =>
        normalizeRouteSegment(segment, route.from ?? baseFrom, route.to ?? baseTo),
      ),
    }))
    : null;

  return {
    ...normalizedResult,
    routes: normalizedRoutes ?? [normalizedResult, ...(normalizedAlternatives ?? [])],
    primaryRouteIndex: typeof result.primaryRouteIndex === "number"
      ? result.primaryRouteIndex
      : 0,
    alternatives: normalizedAlternatives ?? result.alternatives,
    primaryAlternativeIndex: typeof result.primaryAlternativeIndex === "number"
      ? result.primaryAlternativeIndex
      : 0,
  };
}

export type DriverSessionRow = {
  id: number;
  user_id: number;
  route_id: number;
  checked_in_at: string;
  checked_out_at: string | null;
};

export type RouteAvailabilityDbRow = {
  route_id: number;
  active_driver_count: number;
  max_active_buses: number;
  availability_ratio: number;
  availability_updated_at: string | null;
};

export function mapDriverSessionRow(row: DriverSessionRow) {
  return {
    sessionId: row.id,
    userId: row.user_id,
    routeId: row.route_id,
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
  };
}

export function mapRouteAvailabilityRow(row: RouteAvailabilityDbRow) {
  return {
    routeId: row.route_id,
    activeDriverCount: row.active_driver_count,
    maxActiveBuses: row.max_active_buses,
    availabilityRatio: row.availability_ratio,
    updatedAt: row.availability_updated_at,
  };
}

export function getAuthenticatedUserId(request: { user?: unknown }): number | null {
  const userPayload = request.user as { id?: number | string } | undefined;
  const userId = Number(userPayload?.id);
  return Number.isFinite(userId) ? userId : null;
}

export function relativeDelta(a: number, b: number): number {
  const baseline = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) / baseline;
}

export function estimateDirectDistanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusM = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return earthRadiusM * c;
}

export function busRouteSignature(result: NavigationRouteResult): string {
  return result.segments
    .filter((segment) => segment.mode === "bus" && typeof segment.routeId === "number")
    .map((segment) => String(segment.routeId))
    .join(">");
}

export function routeFingerprint(result: NavigationRouteResult): string {
  const modeShape = result.segments
    .map((segment) => `${segment.mode}:${segment.routeId ?? "walk"}`)
    .join(">");
  const walkBucket = Math.round(result.walkingDistanceM / 100);
  return `${modeShape}|walk${walkBucket}|t${result.transferCount}`;
}

export function isMeaningfullyDifferentRoute(
  candidate: NavigationRouteResult,
  existingRoutes: NavigationRouteResult[],
): boolean {
  const candidateBusSignature = busRouteSignature(candidate);

  for (const existing of existingRoutes) {
    const existingBusSignature = busRouteSignature(existing);
    const sameBusSignature = candidateBusSignature === existingBusSignature;
    const sameTransfers = candidate.transferCount === existing.transferCount;
    const similarWalking = relativeDelta(candidate.walkingDistanceM, existing.walkingDistanceM) < 0.15;
    const similarEta = relativeDelta(candidate.etaSeconds, existing.etaSeconds) < 0.12;

    if (sameBusSignature && sameTransfers && similarWalking && similarEta) {
      return false;
    }
  }

  return true;
}

export function applyProfileConfig(
  baseConfig: EffectiveRoutingConfig,
  profile: { id: string; weights: RoutingPreferenceWeights; configTweaks?: Partial<Pick<EffectiveRoutingConfig, "maxWalkingDistanceM" | "maxTotalWalkingDistanceM" | "maxBusTransfers" | "maxWalkingNeighbors">> },
): EffectiveRoutingConfig {
  let maxWalkingDistanceM = profile.configTweaks?.maxWalkingDistanceM
    ?? baseConfig.maxWalkingDistanceM;

  if (profile.id === "less_walking") {
    maxWalkingDistanceM = Math.max(250, Math.round(baseConfig.maxWalkingDistanceM * 0.7));
  }

  let maxTotalWalkingDistanceM = Math.max(
    profile.configTweaks?.maxTotalWalkingDistanceM ?? baseConfig.maxTotalWalkingDistanceM,
    maxWalkingDistanceM,
  );

  if (profile.id === "less_walking") {
    maxTotalWalkingDistanceM = Math.max(maxWalkingDistanceM, Math.round(baseConfig.maxTotalWalkingDistanceM * 0.75));
  }

  let maxBusTransfers = profile.configTweaks?.maxBusTransfers ?? baseConfig.maxBusTransfers;
  if (profile.id === "fewer_transfers") {
    maxBusTransfers = Math.max(0, Math.min(baseConfig.maxBusTransfers, 2));
  } else if (profile.id === "fastest") {
    maxBusTransfers = Math.max(baseConfig.maxBusTransfers, baseConfig.maxBusTransfers + 2);
  }

  return {
    ...baseConfig,
    weights: profile.weights,
    maxWalkingDistanceM,
    maxTotalWalkingDistanceM,
    maxBusTransfers,
    maxWalkingNeighbors: profile.configTweaks?.maxWalkingNeighbors ?? baseConfig.maxWalkingNeighbors,
  };
}

export function buildAlternativeProfiles(baseWeights: RoutingPreferenceWeights) {
  const balanced = normalizeWeights(baseWeights);
  return [
    { id: "balanced", label: "Best", weights: balanced },
    {
      id: "less_walking",
      label: "Less Walking",
      weights: normalizeWeights({
        ...balanced,
        walking: balanced.walking * 3.2,
        speed: balanced.speed * 1.1,
      }),
    },
    {
      id: "fewer_transfers",
      label: "Fewer Transfers",
      weights: normalizeWeights({
        ...balanced,
        transfer: balanced.transfer * 3.0,
        walking: balanced.walking * 1.3,
      }),
    },
    {
      id: "cheaper",
      label: "Cheaper",
      weights: normalizeWeights({
        ...balanced,
        price: balanced.price * 3.0,
        speed: balanced.speed * 0.9,
      }),
    },
    {
      id: "fastest",
      label: "Fastest",
      weights: normalizeWeights({
        ...balanced,
        speed: balanced.speed * 3.2,
        transfer: balanced.transfer * 0.8,
        walking: balanced.walking * 0.7,
      }),
    },
  ];
}
