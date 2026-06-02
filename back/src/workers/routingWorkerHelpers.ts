import type { LocationDTO } from "../../../types/location";
import type {
  RouteCostBreakdown,
  RouteLiveMetricForRouting,
  RouteSegment,
  RoutingGraphEdge,
  RoutingGraphNode,
  RoutingGraphSnapshot,
  RoutingWorkerPayload,
} from "../../../types/navigation";
import {
  AVAILABILITY_COST_COEFF,
  TRANSFER_EXP_COEFF,
  TRANSFER_EXP_RATE,
  TRANSFER_REF,
  WALK_DISTANCE_REF_M,
  WALK_EXP_COEFF,
  WALK_EXP_SCALE_M,
  WALK_LINEAR_COEFF,
} from "../constants/routingConstants.js";
import {
  appendPolylineSegment,
  ensurePolylineEndpoints,
  parseGeoJsonPolyline,
} from "./routingPolyline.js";
import type {
  GraphIndexes,
  NodeState,
  RouteMetricsById,
  RoutingDiagnostics,
  StepEdge,
} from "./routingWorkerTypes.js";

const T_REF_SECONDS = 600;
const P_REF_PRICE = 3000;
const MAX_PLAUSIBLE_SPEED_MPS = 22.22;
const LONG_WALK_STATE_BUCKET_M = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function haversineDistanceM(a: LocationDTO, b: LocationDTO): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export function nodeToLocation(node: RoutingGraphNode): LocationDTO {
  return {
    lat: node.latitude,
    lng: node.longitude,
  };
}

export function createDiagnostics(): RoutingDiagnostics {
  return {
    expandedStates: 0,
    generatedEdges: 0,
    prunedAnchors: 0,
    prunedMaxSingleWalk: 0,
    prunedMaxTotalWalk: 0,
    prunedMaxBusTransfers: 0,
    prunedLongWalkSpacing: 0,
    prunedDominated: 0,
    prunedMissingState: 0,
    bestFrontierCost: null,
    bestFrontierWalkM: null,
  };
}

export function logRoutingDiagnostics(
  diagnostics: RoutingDiagnostics,
  payload: RoutingWorkerPayload,
  startNeighborsCount: number,
  endNeighborsCount: number,
  walkingMode: "api" | "dynamic" | "precomputed",
): void {
  const summary = {
    walkingMode,
    startNeighborsCount,
    endNeighborsCount,
    config: {
      maxWalkingDistanceM: payload.config.maxWalkingDistanceM,
      maxTotalWalkingDistanceM: payload.config.maxTotalWalkingDistanceM,
      maxBusTransfers: payload.config.maxBusTransfers,
      walkingSpeedMps: payload.config.walkingSpeedMps,
      walkLinearCoeff: payload.config.walkLinearCoeff,
      walkExpCoeff: payload.config.walkExpCoeff,
      walkExpScaleM: payload.config.walkExpScaleM,
      transferExpCoeff: payload.config.transferExpCoeff,
      transferExpRate: payload.config.transferExpRate,
    },
    diagnostics,
  };

  console.warn("[routing-worker] search failed", JSON.stringify(summary));
}

export function makeStateKey(
  nodeId: number,
  routeId: number | null,
  busTransferCount: number,
  hasLongWalk: boolean,
  busDistanceSinceLongWalkM: number,
): string {
  const busDistanceBucket = Math.floor(busDistanceSinceLongWalkM / LONG_WALK_STATE_BUCKET_M);
  return `${nodeId}|${routeId ?? 0}|${busTransferCount}|${hasLongWalk ? 1 : 0}|${busDistanceBucket}`;
}

export function parseStateKey(stateKey: string): NodeState {
  const [nodeRaw, routeRaw, transferRaw, longWalkRaw, busDistanceBucketRaw] = stateKey.split("|");
  const nodeId = Number(nodeRaw);
  const routeId = Number(routeRaw);
  const busTransferCount = Number(transferRaw ?? "0");
  const busDistanceBucket = Number(busDistanceBucketRaw ?? "0");
  return {
    nodeId,
    routeId: routeId === 0 ? null : routeId,
    busTransferCount: Number.isFinite(busTransferCount) ? busTransferCount : 0,
    hasLongWalk: longWalkRaw === "1",
    busDistanceSinceLongWalkM: Number.isFinite(busDistanceBucket)
      ? (busDistanceBucket * LONG_WALK_STATE_BUCKET_M)
      : 0,
  };
}

function computeCost(
  parts: RouteCostBreakdown,
  weights: RoutingWorkerPayload["config"]["weights"],
): number {
  return (weights.speed * parts.speed)
    + (weights.crowding * parts.crowding)
    + (weights.price * parts.price)
    + (weights.transfer * parts.transfer)
    + (weights.walking * parts.walking)
    + (AVAILABILITY_COST_COEFF * parts.availability);
}

function bucketKey(lat: number, lng: number, bucketSizeDeg: number): string {
  const y = Math.floor(lat / bucketSizeDeg);
  const x = Math.floor(lng / bucketSizeDeg);
  return `${y}:${x}`;
}

export function buildIndexes(graph: RoutingGraphSnapshot, bucketSizeDeg: number): GraphIndexes {
  const nodeById = new Map<number, RoutingGraphNode>();
  for (const node of graph.nodes) {
    nodeById.set(node.id, node);
  }

  const routeNameById = new Map<number, string>();
  for (const route of graph.routes) {
    routeNameById.set(route.id, route.name);
  }

  const busAdjacency = new Map<number, RoutingGraphEdge[]>();
  const walkingAdjacency = new Map<number, RoutingGraphEdge[]>();
  for (const edge of graph.edges) {
    if (edge.route_id === null) {
      const currentWalk = walkingAdjacency.get(edge.from_node) ?? [];
      currentWalk.push(edge);
      walkingAdjacency.set(edge.from_node, currentWalk);
      continue;
    }

    const current = busAdjacency.get(edge.from_node) ?? [];
    current.push(edge);
    busAdjacency.set(edge.from_node, current);
  }

  const spatialBuckets = new Map<string, number[]>();
  for (const node of graph.nodes) {
    const key = bucketKey(node.latitude, node.longitude, bucketSizeDeg);
    const nodes = spatialBuckets.get(key) ?? [];
    nodes.push(node.id);
    spatialBuckets.set(key, nodes);
  }

  return {
    nodeById,
    routeNameById,
    busAdjacency,
    walkingAdjacency,
    spatialBuckets,
    bucketSizeDeg,
  };
}

export function findNearbyNodeIds(
  location: LocationDTO,
  maxDistanceM: number,
  maxNeighbors: number,
  indexes: GraphIndexes,
): Array<{ nodeId: number; distanceM: number }> {
  const degreeSpan = maxDistanceM / 111320;
  const range = Math.max(1, Math.ceil(degreeSpan / indexes.bucketSizeDeg));
  const centerLatBucket = Math.floor(location.lat / indexes.bucketSizeDeg);
  const centerLngBucket = Math.floor(location.lng / indexes.bucketSizeDeg);

  const candidates: Array<{ nodeId: number; distanceM: number }> = [];

  for (let y = centerLatBucket - range; y <= centerLatBucket + range; y += 1) {
    for (let x = centerLngBucket - range; x <= centerLngBucket + range; x += 1) {
      const bucket = indexes.spatialBuckets.get(`${y}:${x}`);
      if (!bucket) {
        continue;
      }

      for (const nodeId of bucket) {
        const node = indexes.nodeById.get(nodeId);
        if (!node) {
          continue;
        }
        const distanceM = haversineDistanceM(location, nodeToLocation(node));
        if (distanceM <= maxDistanceM) {
          candidates.push({ nodeId, distanceM });
        }
      }
    }
  }

  candidates.sort((a, b) => a.distanceM - b.distanceM);
  return candidates.slice(0, maxNeighbors);
}

export function findAnchorNodeIds(
  location: LocationDTO,
  indexes: GraphIndexes,
): Array<{ nodeId: number; distanceM: number }> {
  const candidates: Array<{ nodeId: number; distanceM: number }> = [];

  for (const node of indexes.nodeById.values()) {
    const distanceM = haversineDistanceM(location, nodeToLocation(node));
    candidates.push({ nodeId: node.id, distanceM });
  }

  candidates.sort((a, b) => a.distanceM - b.distanceM);
  return candidates;
}

export function buildWalkingEdge(
  fromNodeId: number,
  toNodeId: number,
  distanceM: number,
  config: RoutingWorkerPayload["config"],
): StepEdge {
  const timeSeconds = distanceM / config.walkingSpeedMps;
  const parts = buildWalkingComponents(distanceM, timeSeconds, config);

  return {
    fromNodeId,
    toNodeId,
    mode: "walk",
    routeId: null,
    distanceM,
    timeSeconds,
    cost: computeCost(parts, config.weights),
    components: parts,
    transferIncrement: 0,
  };
}

export function buildWalkingComponents(
  distanceM: number,
  timeSeconds: number,
  config: RoutingWorkerPayload["config"],
): RouteCostBreakdown {
  const linearCoeff = config.walkLinearCoeff ?? WALK_LINEAR_COEFF;
  const expCoeff = config.walkExpCoeff ?? WALK_EXP_COEFF;
  const expScaleM = config.walkExpScaleM ?? WALK_EXP_SCALE_M;

  return {
    speed: timeSeconds / T_REF_SECONDS,
    crowding: 0,
    price: 0,
    transfer: 0,
    walking: (linearCoeff * (distanceM / WALK_DISTANCE_REF_M))
      + (expCoeff * (Math.exp(distanceM / expScaleM) - 1)),
    availability: 0,
  };
}

export function rebuildWalkingEdgeMetrics(
  step: StepEdge,
  distanceM: number,
  timeSeconds: number,
  config: RoutingWorkerPayload["config"],
  polyline?: LocationDTO[],
): StepEdge {
  if (step.mode !== "walk") {
    return step;
  }

  const components = buildWalkingComponents(distanceM, timeSeconds, config);
  return {
    ...step,
    distanceM,
    timeSeconds,
    components,
    polyline,
    cost: computeCost(components, config.weights),
  };
}

export function buildBusEdge(
  edge: RoutingGraphEdge,
  previousRouteId: number | null,
  accumulatedBusTransferCount: number,
  metricsByRoute: RouteMetricsById,
  config: RoutingWorkerPayload["config"],
): StepEdge {
  const metrics = edge.route_id !== null ? metricsByRoute.get(edge.route_id) : undefined;
  const travelTimeSeconds = Math.max(1, edge.travel_time);
  const speedScoreRaw = metrics?.effectiveSpeedScore;
  const speedScore = typeof speedScoreRaw === "number"
    ? clamp(speedScoreRaw, 1, 5)
    : 3;
  const speedComponent = (5 - speedScore) / 4;
  const crowdRaw = metrics?.effectiveCrowdingScore;
  const crowdComponent = typeof crowdRaw === "number"
    ? clamp((crowdRaw - 1) / 4, 0, 1)
    : 0.5;

  const transferHappened = previousRouteId !== null
    && edge.route_id !== null
    && previousRouteId !== edge.route_id;
  const transfersAfter = accumulatedBusTransferCount + (transferHappened ? 1 : 0);
  const transferCost = TRANSFER_REF
      * (config.transferExpCoeff ?? TRANSFER_EXP_COEFF)
      * (Math.exp((config.transferExpRate ?? TRANSFER_EXP_RATE) * (transfersAfter - 2)) - 1);

  const availabilityRatio = typeof metrics?.availabilityRatio === "number"
    ? clamp(metrics.availabilityRatio, 0, 1)
    : 1;
  const availabilityCost = 1 - availabilityRatio;

  const boardedBus = edge.route_id !== null && previousRouteId !== edge.route_id;
  const priceBase = metrics?.effectivePrice;
  const priceComponent = boardedBus
    ? (typeof priceBase === "number" ? Math.max(0, priceBase / P_REF_PRICE) : 0.5)
    : 0;

  const parts: RouteCostBreakdown = {
    speed: speedComponent,
    crowding: crowdComponent,
    price: priceComponent,
    transfer: transferCost,
    walking: 0,
    availability: availabilityCost,
  };

  return {
    fromNodeId: edge.from_node,
    toNodeId: edge.to_node,
    mode: "bus",
    routeId: edge.route_id,
    distanceM: edge.distance_km * 1000,
    timeSeconds: travelTimeSeconds,
    cost: computeCost(parts, config.weights),
    components: parts,
    transferIncrement: transferHappened ? 1 : 0,
    polyline: parseGeoJsonPolyline(edge.geom),
  };
}

export function heuristicCost(
  from: LocationDTO,
  to: LocationDTO,
  speedWeight: number,
): number {
  if (speedWeight <= 0) {
    return 0;
  }

  const distanceM = haversineDistanceM(from, to);
  const minCostPerMeter = speedWeight * ((1 / MAX_PLAUSIBLE_SPEED_MPS) / T_REF_SECONDS);
  return distanceM * minCostPerMeter;
}

export function formatSegment(
  step: StepEdge,
  from: LocationDTO,
  to: LocationDTO,
  coordinates: LocationDTO[],
  routeNameById: Map<number, string>,
): RouteSegment {
  return {
    mode: step.mode,
    routeId: step.routeId,
    routeName: step.routeId === null ? null : (routeNameById.get(step.routeId) ?? null),
    from,
    to,
    coordinates,
    distanceM: step.distanceM,
    timeSeconds: step.timeSeconds,
    cost: step.cost,
  };
}

export function buildStepPolyline(step: StepEdge, from: LocationDTO, to: LocationDTO): LocationDTO[] {
  if (step.polyline && step.polyline.length > 0) {
    return ensurePolylineEndpoints(step.polyline, from, to);
  }

  return [from, to];
}

export function appendSegmentCoordinates(previousCoordinates: LocationDTO[], stepCoordinates: LocationDTO[]): LocationDTO[] {
  return appendPolylineSegment(previousCoordinates, stepCoordinates.slice(1));
}

export function mergeComponents(
  total: RouteCostBreakdown,
  addition: RouteCostBreakdown,
): RouteCostBreakdown {
  return {
    speed: total.speed + addition.speed,
    crowding: total.crowding + addition.crowding,
    price: total.price + addition.price,
    transfer: total.transfer + addition.transfer,
    walking: total.walking + addition.walking,
    availability: total.availability + addition.availability,
  };
}
