import { isAxiosError } from "axios";

import type {
  NavigationRouteResult,
  ParseNavigationTextResponse,
  RouteSegment,
} from "../../types/navigation";

export const INITIAL_REGION = {
  latitude: 33.5138,
  longitude: 36.2765,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
};

export const POINT_COLORS = [
  "#22C55E",
  "#0EA5E9",
  "#F97316",
  "#A855F7",
  "#EAB308",
  "#EF4444",
  "#14B8A6",
];

export function pointName(index: number): string {
  const base = "A".charCodeAt(0);
  return `Point ${String.fromCharCode(base + (index % 26))}`;
}

export function pointId(lat: number, lng: number): string {
  return `${lat.toFixed(6)}:${lng.toFixed(6)}`;
}

export function approxDistanceM(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const latScaleM = 111_320;
  const avgLatRad = ((a.latitude + b.latitude) / 2) * (Math.PI / 180);
  const lngScaleM = 111_320 * Math.cos(avgLatRad);
  const dLatM = (b.latitude - a.latitude) * latScaleM;
  const dLngM = (b.longitude - a.longitude) * lngScaleM;
  return Math.hypot(dLatM, dLngM);
}

export function sanitizeMapCoordinates(
  points: { latitude: number; longitude: number }[],
): { latitude: number; longitude: number }[] {
  if (points.length < 3) {
    return points;
  }

  const deduped: { latitude: number; longitude: number }[] = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const candidate = points[i];
    const prev = deduped[deduped.length - 1];
    if (approxDistanceM(prev, candidate) >= 3) {
      deduped.push(candidate);
    }
  }

  if (deduped.length < 3) {
    return deduped;
  }

  const cleaned: { latitude: number; longitude: number }[] = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i += 1) {
    const a = cleaned[cleaned.length - 1];
    const b = deduped[i];
    const c = deduped[i + 1];

    const ab = approxDistanceM(a, b);
    const bc = approxDistanceM(b, c);
    const ac = approxDistanceM(a, c);

    const v1x = b.longitude - a.longitude;
    const v1y = b.latitude - a.latitude;
    const v2x = c.longitude - b.longitude;
    const v2y = c.latitude - b.latitude;
    const v1Len = Math.hypot(v1x, v1y);
    const v2Len = Math.hypot(v2x, v2y);

    let cosine = 1;
    if (v1Len > 0 && v2Len > 0) {
      cosine = (v1x * v2x + v1y * v2y) / (v1Len * v2Len);
    }

    const isTinySpike = cosine < -0.7 && ab < 120 && bc < 120 && ac < 45;
    if (!isTinySpike) {
      cleaned.push(b);
    }
  }

  cleaned.push(deduped[deduped.length - 1]);
  return cleaned;
}

export function toMapCoordinates(
  segment: RouteSegment,
): { latitude: number; longitude: number }[] {
  const geometry = segment.coordinates
    ?.filter(
      (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
    )
    .map((point) => ({ latitude: point.lat, longitude: point.lng }));

  if (geometry && geometry.length >= 2) {
    return sanitizeMapCoordinates(geometry);
  }

  return [
    { latitude: segment.from.lat, longitude: segment.from.lng },
    { latitude: segment.to.lat, longitude: segment.to.lng },
  ];
}

export function getSelectedRoute(
  routeResult: NavigationRouteResult | null,
  selectedRouteIndex: number,
): NavigationRouteResult | null {
  if (!routeResult) {
    return null;
  }

  const routeChoices =
    Array.isArray(routeResult.routes) && routeResult.routes.length > 0
      ? routeResult.routes
      : [routeResult, ...(routeResult.alternatives ?? [])];

  if (selectedRouteIndex >= 0 && selectedRouteIndex < routeChoices.length) {
    return routeChoices[selectedRouteIndex] as NavigationRouteResult;
  }

  return routeResult;
}

export function extractApiErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as
      | {
          error?: string;
          message?: string;
          details?:
            | string
            | { message?: string }
            | { field?: string; message?: string }[];
        }
      | string
      | undefined;

    if (typeof data === "string" && data.trim().length > 0) {
      return data;
    }

    if (data && typeof data === "object") {
      if (typeof data.details === "string" && data.details.trim().length > 0) {
        return data.details;
      }

      if (
        data.details &&
        typeof data.details === "object" &&
        !Array.isArray(data.details) &&
        typeof data.details.message === "string" &&
        data.details.message.trim().length > 0
      ) {
        return data.details.message;
      }

      const details = Array.isArray(data.details)
        ? data.details
            .map((item) => {
              if (!item) {
                return "";
              }
              const field = item.field ? `${item.field}: ` : "";
              return `${field}${item.message ?? "Invalid value"}`;
            })
            .filter(Boolean)
        : [];

      if (details.length > 0) {
        return details.join("\n");
      }

      if (typeof data.error === "string" && data.error.trim().length > 0) {
        return data.error;
      }

      if (typeof data.message === "string" && data.message.trim().length > 0) {
        return data.message;
      }
    }

    if (error.message) {
      return error.message;
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Failed to compute route.";
}

export function isNavigationRouteResult(
  value: unknown,
): value is NavigationRouteResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { segments?: unknown; etaSeconds?: unknown };
  return (
    Array.isArray(candidate.segments) &&
    typeof candidate.etaSeconds === "number"
  );
}

export function buildNaturalRouteFallbackMessage(
  response: ParseNavigationTextResponse,
): string {
  if (response.message && response.message.trim().length > 0) {
    return response.message;
  }

  switch (response.reason) {
    case "feature_disabled":
      return "Text route parsing is currently disabled on the server (NLP_ENABLED is off).";
    case "parse_failed":
      return "Could not parse that request. Try clearer start/destination names or choose points on the map.";
    case "unknown_landmark":
      return "Could not recognize one of the places. Try another wording or pick points on the map.";
    case "empty_or_invalid_input":
      return "Please enter a route request first.";
    default:
      return "Could not parse your text request. Please pick points on the map.";
  }
}