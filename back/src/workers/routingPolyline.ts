import type { LocationDTO } from "../../../types/location";

function samePoint(a: LocationDTO | null | undefined, b: LocationDTO | null | undefined, epsilon = 1e-9): boolean {
  if (!a || !b) {
    return false;
  }

  return Math.abs(a.lat - b.lat) <= epsilon && Math.abs(a.lng - b.lng) <= epsilon;
}

function pointDistanceSq(a: LocationDTO, b: LocationDTO): number {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return (dLat * dLat) + (dLng * dLng);
}

export function parseGeoJsonPolyline(geom: string | null | undefined): LocationDTO[] {
  if (!geom) {
    return [];
  }

  try {
    const parsed = JSON.parse(geom) as {
      type?: string;
      coordinates?: unknown;
    };

    if (parsed?.type !== "LineString" || !Array.isArray(parsed.coordinates)) {
      return [];
    }

    return parsed.coordinates
      .map((coordinate) => {
        if (!Array.isArray(coordinate) || coordinate.length < 2) {
          return null;
        }

        const lng = Number(coordinate[0]);
        const lat = Number(coordinate[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }

        return { lat, lng };
      })
      .filter((point): point is LocationDTO => point !== null);
  } catch {
    return [];
  }
}

export function normalizePolyline(points: LocationDTO[]): LocationDTO[] {
  const normalized: LocationDTO[] = [];

  for (const point of points) {
    const last = normalized[normalized.length - 1];
    if (!last || !samePoint(last, point)) {
      normalized.push(point);
    }
  }

  return normalized;
}

export function ensurePolylineEndpoints(
  points: LocationDTO[],
  from: LocationDTO,
  to: LocationDTO,
): LocationDTO[] {
  const normalized = normalizePolyline(points);
  let oriented = normalized.length > 0 ? [...normalized] : [from, to];

  // Some DB geometries are stored opposite to traversal direction.
  // Reverse polyline when the opposite orientation fits endpoints better.
  if (oriented.length >= 2) {
    const first = oriented[0] as LocationDTO;
    const last = oriented[oriented.length - 1] as LocationDTO;
    const forwardScore = pointDistanceSq(first, from) + pointDistanceSq(last, to);
    const reverseScore = pointDistanceSq(first, to) + pointDistanceSq(last, from);

    if (reverseScore + 1e-12 < forwardScore) {
      oriented = [...oriented].reverse();
    }
  }

  const result = [...oriented];

  if (!samePoint(result[0], from)) {
    result.unshift(from);
  }

  if (!samePoint(result[result.length - 1], to)) {
    result.push(to);
  }

  return normalizePolyline(result);
}

export function appendPolylineSegment(target: LocationDTO[], segment: LocationDTO[]): LocationDTO[] {
  if (segment.length === 0) {
    return target;
  }

  if (target.length === 0) {
    return [...segment];
  }

  const merged = [...target];
  for (const point of segment) {
    const last = merged[merged.length - 1];
    if (!last || !samePoint(last, point)) {
      merged.push(point);
    }
  }

  return merged;
}
