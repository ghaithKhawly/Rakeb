import { parentPort } from "node:worker_threads";

import type { LocationDTO } from "../../../types/location";
import type {
  NavigationRouteResult,
  RouteCostBreakdown,
  RouteLiveMetricForRouting,
  RouteSegment,
  RoutingGraphEdge,
  RoutingGraphNode,
  RoutingGraphSnapshot,
  RoutingWorkerPayload,
} from "../../../types/navigation";
import {
  TRANSFER_EXP_COEFF,
  TRANSFER_EXP_RATE,
  TRANSFER_REF,
  WALK_DISTANCE_REF_M,
  WALK_EXP_COEFF,
  WALK_EXP_SCALE_M,
  WALK_LINEAR_COEFF,
} from "../constants/routingConstants.js";

const START_NODE_ID = -1;
const END_NODE_ID = -2;

const T_REF_SECONDS = 600;
const P_REF_PRICE = 3000;
const MAX_PLAUSIBLE_SPEED_MPS = 22.22;
const EPSILON = 1e-9;
const LONG_WALK_STATE_BUCKET_M = 100;

type RoutingWorkerRequest = {
  id: number;
  payload: RoutingWorkerPayload;
};

type RoutingWorkerResponse = {
  id: number;
  result?: NavigationRouteResult;
  error?: string;
};

type RouteMetricsById = Map<number, RouteLiveMetricForRouting>;

type QueueNode = {
  stateKey: string;
  fScore: number;
  busTransferCount: number;
  cumulativeWalkM: number;
};

type NodeState = {
  nodeId: number;
  routeId: number | null;
  busTransferCount: number;
  hasLongWalk: boolean;
  busDistanceSinceLongWalkM: number;
};

type StepEdge = {
  fromNodeId: number;
  toNodeId: number;
  mode: "walk" | "bus";
  routeId: number | null;
  distanceM: number;
  timeSeconds: number;
  cost: number;
  components: RouteCostBreakdown;
  transferIncrement: number;
};

type ParentInfo = {
  previousStateKey: string;
  edge: StepEdge;
};

type GraphIndexes = {
  nodeById: Map<number, RoutingGraphNode>;
  routeNameById: Map<number, string>;
  busAdjacency: Map<number, RoutingGraphEdge[]>;
  walkingAdjacency: Map<number, RoutingGraphEdge[]>;
  spatialBuckets: Map<string, number[]>;
  bucketSizeDeg: number;
};

type RoutingDiagnostics = {
  expandedStates: number;
  generatedEdges: number;
  prunedAnchors: number;
  prunedMaxSingleWalk: number;
  prunedMaxTotalWalk: number;
  prunedMaxBusTransfers: number;
  prunedLongWalkSpacing: number;
  prunedDominated: number;
  prunedMissingState: number;
  bestFrontierCost: number | null;
  bestFrontierWalkM: number | null;
};

function createDiagnostics(): RoutingDiagnostics {
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

function logRoutingDiagnostics(
  diagnostics: RoutingDiagnostics,
  payload: RoutingWorkerPayload,
  startNeighborsCount: number,
  endNeighborsCount: number,
  walkingMode: "dynamic" | "precomputed",
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

class MinHeap {
  private items: QueueNode[] = [];

  private compare(a: QueueNode, b: QueueNode): number {
    if (Math.abs(a.fScore - b.fScore) > EPSILON) {
      return a.fScore - b.fScore;
    }
    if (a.busTransferCount !== b.busTransferCount) {
      return a.busTransferCount - b.busTransferCount;
    }
    return a.cumulativeWalkM - b.cumulativeWalkM;
  }

  push(item: QueueNode): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): QueueNode | undefined {
    if (this.items.length === 0) {
      return undefined;
    }
    const first = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return first;
  }

  get size(): number {
    return this.items.length;
  }

  private bubbleUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      if (this.compare(this.items[parent], this.items[current]) <= 0) {
        break;
      }
      [this.items[parent], this.items[current]] = [this.items[current], this.items[parent]];
      current = parent;
    }
  }

  private bubbleDown(index: number): void {
    let current = index;
    const length = this.items.length;
    while (true) {
      const left = current * 2 + 1;
      const right = current * 2 + 2;
      let smallest = current;

      if (left < length && this.compare(this.items[left], this.items[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && this.compare(this.items[right], this.items[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === current) {
        break;
      }

      [this.items[current], this.items[smallest]] = [this.items[smallest], this.items[current]];
      current = smallest;
    }
  }
}

function makeStateKey(
  nodeId: number,
  routeId: number | null,
  busTransferCount: number,
  hasLongWalk: boolean,
  busDistanceSinceLongWalkM: number,
): string {
  const busDistanceBucket = Math.floor(busDistanceSinceLongWalkM / LONG_WALK_STATE_BUCKET_M);
  return `${nodeId}|${routeId ?? 0}|${busTransferCount}|${hasLongWalk ? 1 : 0}|${busDistanceBucket}`;
}

function parseStateKey(stateKey: string): NodeState {
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function haversineDistanceM(a: LocationDTO, b: LocationDTO): number {
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

function nodeToLocation(node: RoutingGraphNode): LocationDTO {
  return {
    lat: node.latitude,
    lng: node.longitude,
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
    + (weights.walking * parts.walking);
}

function buildIndexes(graph: RoutingGraphSnapshot, bucketSizeDeg: number): GraphIndexes {
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

function bucketKey(lat: number, lng: number, bucketSizeDeg: number): string {
  const y = Math.floor(lat / bucketSizeDeg);
  const x = Math.floor(lng / bucketSizeDeg);
  return `${y}:${x}`;
}

function findNearbyNodeIds(
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

function findAnchorNodeIds(
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

function buildWalkingEdge(
  fromNodeId: number,
  toNodeId: number,
  distanceM: number,
  config: RoutingWorkerPayload["config"],
): StepEdge {
  const timeSeconds = distanceM / config.walkingSpeedMps;
  const linearCoeff = config.walkLinearCoeff ?? WALK_LINEAR_COEFF;
  const expCoeff = config.walkExpCoeff ?? WALK_EXP_COEFF;
  const expScaleM = config.walkExpScaleM ?? WALK_EXP_SCALE_M;

  const parts: RouteCostBreakdown = {
    speed: timeSeconds / T_REF_SECONDS,
    crowding: 0,
    price: 0,
    transfer: 0,
    walking: (linearCoeff * (distanceM / WALK_DISTANCE_REF_M))
      + (expCoeff * (Math.exp(distanceM / expScaleM) - 1)),
  }

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

function buildBusEdge(
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
  const transferCost = transfersAfter <= 2
    ? 0
    : TRANSFER_REF
      * (config.transferExpCoeff ?? TRANSFER_EXP_COEFF)
      * (Math.exp((config.transferExpRate ?? TRANSFER_EXP_RATE) * (transfersAfter - 2)) - 1);

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
  };
}

function heuristicCost(
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

function formatSegment(
  step: StepEdge,
  from: LocationDTO,
  to: LocationDTO,
  routeNameById: Map<number, string>,
): RouteSegment {
  return {
    mode: step.mode,
    routeId: step.routeId,
    routeName: step.routeId === null ? null : (routeNameById.get(step.routeId) ?? null),
    from,
    to,
    distanceM: step.distanceM,
    timeSeconds: step.timeSeconds,
    cost: step.cost,
  };
}

function mergeComponents(
  total: RouteCostBreakdown,
  addition: RouteCostBreakdown,
): RouteCostBreakdown {
  return {
    speed: total.speed + addition.speed,
    crowding: total.crowding + addition.crowding,
    price: total.price + addition.price,
    transfer: total.transfer + addition.transfer,
    walking: total.walking + addition.walking,
  };
}

function runWeightedAStar(payload: RoutingWorkerPayload): NavigationRouteResult {
  const { graph, from, to, routeMetrics, config } = payload;
  const walkingMode = payload.walkingMode ?? "dynamic";
  const diagnostics = createDiagnostics();
  const longWalkThresholdM = Math.max(1000, Math.min(config.maxWalkingDistanceM * 0.9, config.maxWalkingDistanceM));
  const minBusDistanceBetweenLongWalksM = Math.max(800, config.maxTotalWalkingDistanceM * 0.25);
  const enforceLongWalkSpacing = config.maxTotalWalkingDistanceM >= 4000 && config.maxWalkingDistanceM >= 1200;

  if (haversineDistanceM(from, to) <= 1) {
    return {
      message: "Origin and destination are the same point",
      executedInWorker: true,
      graphLoadedAt: graph.loadedAt ?? null,
      graphVersion: graph.graphVersion ?? null,
      from,
      to,
      totalCost: 0,
      components: {
        speed: 0,
        crowding: 0,
        price: 0,
        transfer: 0,
        walking: 0,
      },
      transferCount: 0,
      walkingDistanceM: 0,
      etaSeconds: 0,
      segments: [],
      bestEffort: false,
      usedConfig: config,
    };
  }

  const bucketSizeDeg = Math.max(0.0005, config.maxWalkingDistanceM / 111320);
  const indexes = buildIndexes(graph, bucketSizeDeg);
  const metricsByRoute: RouteMetricsById = new Map(routeMetrics.map((metric) => [metric.routeId, metric]));

  const startNeighbors = findAnchorNodeIds(from, indexes);
  const endNeighbors = findAnchorNodeIds(to, indexes);
  const endNeighborSet = new Set(endNeighbors.map((n) => n.nodeId));

  if (process.env.DEBUG_ROUTING === "1") {
    console.warn("[routing-worker] search start", JSON.stringify({
      walkingMode,
      from,
      to,
      startNeighborsCount: startNeighbors.length,
      endNeighborsCount: endNeighbors.length,
      config: {
        maxWalkingDistanceM: config.maxWalkingDistanceM,
        maxTotalWalkingDistanceM: config.maxTotalWalkingDistanceM,
        maxBusTransfers: config.maxBusTransfers,
        walkingSpeedMps: config.walkingSpeedMps,
      },
    }));
  }

  const startStateKey = makeStateKey(START_NODE_ID, null, 0, false, 0);
  const openSet = new MinHeap();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  const parent = new Map<string, ParentInfo>();
  const cumulativeWalkM = new Map<string, number>();

  gScore.set(startStateKey, 0);
  cumulativeWalkM.set(startStateKey, 0);
  fScore.set(startStateKey, heuristicCost(from, to, config.weights.speed));
  openSet.push({ stateKey: startStateKey, fScore: fScore.get(startStateKey) ?? 0, busTransferCount: 0, cumulativeWalkM: 0 });

  let finalKey: string | null = null;

  while (openSet.size > 0) {
    const current = openSet.pop();
    if (!current) {
      break;
    }

    diagnostics.expandedStates += 1;
    if (diagnostics.bestFrontierCost === null || current.fScore < diagnostics.bestFrontierCost) {
      diagnostics.bestFrontierCost = current.fScore;
      diagnostics.bestFrontierWalkM = cumulativeWalkM.get(current.stateKey) ?? 0;
    }

    const currentBest = fScore.get(current.stateKey);
    if (currentBest !== undefined && current.fScore - currentBest > EPSILON) {
      continue;
    }

    const currentState = parseStateKey(current.stateKey);
    if (currentState.nodeId === END_NODE_ID) {
      finalKey = current.stateKey;
      break;
    }

    const currentG = gScore.get(current.stateKey) ?? Number.POSITIVE_INFINITY;

    const candidateEdges: StepEdge[] = [];

    if (currentState.nodeId === START_NODE_ID) {
      for (const neighbor of startNeighbors) {
        if (neighbor.nodeId === START_NODE_ID) {
          diagnostics.prunedAnchors += 1;
          continue;
        }

        candidateEdges.push(buildWalkingEdge(
          START_NODE_ID,
          neighbor.nodeId,
          neighbor.distanceM,
          config,
        ));
      }
    } else {
      const busEdges = indexes.busAdjacency.get(currentState.nodeId) ?? [];
      for (const edge of busEdges) {
        candidateEdges.push(buildBusEdge(
          edge,
          currentState.routeId,
          currentState.busTransferCount,
          metricsByRoute,
          config,
        ));
      }

      const currentNode = indexes.nodeById.get(currentState.nodeId);
      if (currentNode) {
        const currentLocation = nodeToLocation(currentNode);

        if (walkingMode === "dynamic") {
          const walkNeighbors = findNearbyNodeIds(
            currentLocation,
            config.maxWalkingDistanceM,
            config.maxWalkingNeighbors,
            indexes,
          );

          for (const neighbor of walkNeighbors) {
            if (neighbor.nodeId === currentState.nodeId) {
              continue;
            }

            candidateEdges.push(buildWalkingEdge(
              currentState.nodeId,
              neighbor.nodeId,
              neighbor.distanceM,
              config,
            ));
          }
        } else {
          const precomputedWalkEdges = indexes.walkingAdjacency.get(currentState.nodeId) ?? [];
          for (const walkEdge of precomputedWalkEdges) {
            candidateEdges.push(buildWalkingEdge(
              walkEdge.from_node,
              walkEdge.to_node,
              walkEdge.distance_km * 1000,
              config,
            ));
          }
        }

        if (endNeighborSet.has(currentState.nodeId)) {
          const endDistance = haversineDistanceM(currentLocation, to);
          candidateEdges.push(buildWalkingEdge(
            currentState.nodeId,
            END_NODE_ID,
            endDistance,
            config,
          ));
        }
      }
    }

    diagnostics.generatedEdges += candidateEdges.length;

    for (const edge of candidateEdges) {
      const isAnchorWalkingEdge = edge.mode === "walk"
        && (edge.fromNodeId === START_NODE_ID || edge.toNodeId === END_NODE_ID);

      if (!isAnchorWalkingEdge && edge.mode === "walk" && edge.distanceM > config.maxWalkingDistanceM) {
        diagnostics.prunedMaxSingleWalk += 1;
        continue;
      }

      const existingWalkM = cumulativeWalkM.get(current.stateKey) ?? 0;
      const projectedWalkM = existingWalkM + (edge.mode === "walk" ? edge.distanceM : 0);
      if (!isAnchorWalkingEdge && projectedWalkM > config.maxTotalWalkingDistanceM) {
        diagnostics.prunedMaxTotalWalk += 1;
        continue;
      }

      if (
        edge.mode === "bus"
        && edge.transferIncrement > 0
        && currentState.busTransferCount >= config.maxBusTransfers
      ) {
        diagnostics.prunedMaxBusTransfers += 1;
        continue;
      }

      const nextBusTransferCount = currentState.busTransferCount + edge.transferIncrement;

      const isLongWalkEdge = edge.mode === "walk" && edge.distanceM >= longWalkThresholdM;
      if (
        !isAnchorWalkingEdge
        &&
        enforceLongWalkSpacing
        && isLongWalkEdge
        && currentState.hasLongWalk
        && currentState.busDistanceSinceLongWalkM + EPSILON < minBusDistanceBetweenLongWalksM
      ) {
        diagnostics.prunedLongWalkSpacing += 1;
        continue;
      }

      let nextHasLongWalk = currentState.hasLongWalk;
      let nextBusDistanceSinceLongWalkM = currentState.busDistanceSinceLongWalkM;

      if (edge.mode === "bus") {
        if (currentState.hasLongWalk) {
          nextBusDistanceSinceLongWalkM = Math.min(
            currentState.busDistanceSinceLongWalkM + edge.distanceM,
            minBusDistanceBetweenLongWalksM,
          );
        }
      } else if (isLongWalkEdge) {
        nextHasLongWalk = true;
        nextBusDistanceSinceLongWalkM = 0;
      }

      const nextRouteId = edge.mode === "bus" ? edge.routeId : null;
      const nextStateKey = makeStateKey(
        edge.toNodeId,
        nextRouteId,
        nextBusTransferCount,
        nextHasLongWalk,
        nextBusDistanceSinceLongWalkM,
      );
      const tentativeG = currentG + edge.cost;

      const knownG = gScore.get(nextStateKey);
      if (knownG !== undefined && tentativeG >= knownG - EPSILON) {
        diagnostics.prunedDominated += 1;
        continue;
      }

      gScore.set(nextStateKey, tentativeG);
      cumulativeWalkM.set(nextStateKey, projectedWalkM);
      parent.set(nextStateKey, {
        previousStateKey: current.stateKey, 
        edge,
      });

      const nextLocation = edge.toNodeId === END_NODE_ID
        ? to
        : nodeToLocation(indexes.nodeById.get(edge.toNodeId) as RoutingGraphNode);
      const h = heuristicCost(nextLocation, to, config.weights.speed);
      const nextF = tentativeG + h;

      fScore.set(nextStateKey, nextF);
      openSet.push({
        stateKey: nextStateKey,
        fScore: nextF,
        busTransferCount: nextBusTransferCount,
        cumulativeWalkM: projectedWalkM,
      });
    }
  }

  if (!finalKey) {
    diagnostics.prunedMissingState = gScore.size;
    logRoutingDiagnostics(diagnostics, payload, startNeighbors.length, endNeighbors.length, walkingMode);
    throw new Error(`No route found between origin and destination under current constraints | diagnostics=${JSON.stringify(diagnostics)}`);
  }

  const steps: StepEdge[] = [];
  let cursor = finalKey;
  while (cursor !== startStateKey) {
    const parentInfo = parent.get(cursor);
    if (!parentInfo) {
      break;
    }
    steps.push(parentInfo.edge);
    cursor = parentInfo.previousStateKey;
  }
  steps.reverse();

  const zero: RouteCostBreakdown = {
    speed: 0,
    crowding: 0,
    price: 0,
    transfer: 0,
    walking: 0,
  };

  const components = steps.reduce((acc, step) => mergeComponents(acc, step.components), zero);
  const totalCost = steps.reduce((sum, step) => sum + step.cost, 0);
  const transferCount = steps.reduce((sum, step) => sum + step.transferIncrement, 0);
  const walkingDistanceM = steps
    .filter((step) => step.mode === "walk")
    .reduce((sum, step) => sum + step.distanceM, 0);
  const etaSeconds = steps.reduce((sum, step) => sum + step.timeSeconds, 0);

  const segments: RouteSegment[] = [];
  for (const step of steps) {
    const fromLocation = step.fromNodeId === START_NODE_ID
      ? from
      : step.fromNodeId === END_NODE_ID
        ? to
        : nodeToLocation(indexes.nodeById.get(step.fromNodeId) as RoutingGraphNode);
    const toLocation = step.toNodeId === START_NODE_ID
      ? from
      : step.toNodeId === END_NODE_ID
        ? to
        : nodeToLocation(indexes.nodeById.get(step.toNodeId) as RoutingGraphNode);

    const previous = segments[segments.length - 1];
    if (previous && previous.mode === step.mode && previous.routeId === step.routeId) {
      previous.to = toLocation;
      previous.distanceM += step.distanceM;
      previous.timeSeconds += step.timeSeconds;
      previous.cost += step.cost;
      continue;
    }

    segments.push(formatSegment(step, fromLocation, toLocation, indexes.routeNameById));
  }

  return {
    message: "Weighted A* route computed in worker",
    executedInWorker: true,
    graphLoadedAt: graph.loadedAt ?? null,
    graphVersion: graph.graphVersion ?? null,
    from,
    to,
    totalCost,
    components,
    transferCount,
    walkingDistanceM,
    etaSeconds,
    segments,
    bestEffort: false,
    usedConfig: config,
  };
}

if (!parentPort) {
  throw new Error("routingWorker must run inside a worker thread");
}

const port = parentPort;

port.on("message", (message: RoutingWorkerRequest) => {
  try {
    const response: RoutingWorkerResponse = { id: message.id, result: runWeightedAStar(message.payload) };

    port.postMessage(response);
  } catch (error) {
    port.postMessage({
      id: message.id,
      error: error instanceof Error ? error.message : String(error),
    } satisfies RoutingWorkerResponse);
  }
});
