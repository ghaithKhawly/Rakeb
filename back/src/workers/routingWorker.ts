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

const START_NODE_ID = -1;
const END_NODE_ID = -2;

const T_REF_SECONDS = 600;
const P_REF_PRICE = 3000;
const WALK_DISTANCE_REF_M = 400;
const WALK_QUADRATIC_ALPHA = 0.6;
const TRANSFER_REF = 1.0;
const MAX_PLAUSIBLE_SPEED_MPS = 22.22;
const EPSILON = 1e-9;

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
};

type NodeState = {
  nodeId: number;
  routeId: number | null;
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
  spatialBuckets: Map<string, number[]>;
  bucketSizeDeg: number;
};

class MinHeap {
  private items: QueueNode[] = [];

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
      if (this.items[parent].fScore <= this.items[current].fScore) {
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

      if (left < length && this.items[left].fScore < this.items[smallest].fScore) {
        smallest = left;
      }
      if (right < length && this.items[right].fScore < this.items[smallest].fScore) {
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

function makeStateKey(nodeId: number, routeId: number | null): string {
  return `${nodeId}|${routeId ?? 0}`;
}

function parseStateKey(stateKey: string): NodeState {
  const [nodeRaw, routeRaw] = stateKey.split("|");
  const nodeId = Number(nodeRaw);
  const routeId = Number(routeRaw);
  return { nodeId, routeId: routeId === 0 ? null : routeId };
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
  for (const edge of graph.edges) {
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

function buildWalkingEdge(
  fromNodeId: number,
  toNodeId: number,
  distanceM: number,
  previousRouteId: number | null,
  config: RoutingWorkerPayload["config"],
): StepEdge {
  const timeSeconds = distanceM / config.walkingSpeedMps;
  const parts: RouteCostBreakdown = {
    speed: timeSeconds / T_REF_SECONDS,
    crowding: 0,
    price: 0,
    transfer: 0,
    walking: (distanceM / WALK_DISTANCE_REF_M) + (WALK_QUADRATIC_ALPHA * ((distanceM / 1000) ** 2)),
  };

  if (previousRouteId !== null) {
    parts.transfer = TRANSFER_REF;
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
    transferIncrement: previousRouteId !== null ? 1 : 0,
  };
}

function buildBusEdge(
  edge: RoutingGraphEdge,
  previousRouteId: number | null,
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

  const boardedBus = edge.route_id !== null && previousRouteId !== edge.route_id;
  const priceBase = metrics?.effectivePrice;
  const priceComponent = boardedBus
    ? (typeof priceBase === "number" ? Math.max(0, priceBase / P_REF_PRICE) : 0.5)
    : 0;

  const parts: RouteCostBreakdown = {
    speed: speedComponent,
    crowding: crowdComponent,
    price: priceComponent,
    transfer: transferHappened ? TRANSFER_REF : 0,
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

  const bucketSizeDeg = Math.max(0.0005, config.maxWalkingDistanceM / 111320);
  const indexes = buildIndexes(graph, bucketSizeDeg);
  const metricsByRoute: RouteMetricsById = new Map(routeMetrics.map((metric) => [metric.routeId, metric]));

  const startNeighbors = findNearbyNodeIds(from, config.maxWalkingDistanceM, config.maxWalkingNeighbors, indexes);
  const endNeighbors = findNearbyNodeIds(to, config.maxWalkingDistanceM, config.maxWalkingNeighbors, indexes);
  const endNeighborSet = new Set(endNeighbors.map((n) => n.nodeId));

  if (startNeighbors.length === 0 || endNeighbors.length === 0) {
    throw new Error("No reachable graph nodes found within walking radius for origin or destination");
  }

  const startStateKey = makeStateKey(START_NODE_ID, null);
  const openSet = new MinHeap();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  const parent = new Map<string, ParentInfo>();

  gScore.set(startStateKey, 0);
  fScore.set(startStateKey, heuristicCost(from, to, config.weights.speed));
  openSet.push({ stateKey: startStateKey, fScore: fScore.get(startStateKey) ?? 0 });

  let finalKey: string | null = null;

  while (openSet.size > 0) {
    const current = openSet.pop();
    if (!current) {
      break;
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
        candidateEdges.push(buildWalkingEdge(
          START_NODE_ID,
          neighbor.nodeId,
          neighbor.distanceM,
          currentState.routeId,
          config,
        ));
      }
    } else {
      const busEdges = indexes.busAdjacency.get(currentState.nodeId) ?? [];
      for (const edge of busEdges) {
        candidateEdges.push(buildBusEdge(edge, currentState.routeId, metricsByRoute, config));
      }

      const currentNode = indexes.nodeById.get(currentState.nodeId);
      if (currentNode) {
        const currentLocation = nodeToLocation(currentNode);
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
            currentState.routeId,
            config,
          ));
        }

        if (endNeighborSet.has(currentState.nodeId)) {
          const endDistance = haversineDistanceM(currentLocation, to);
          if (endDistance <= config.maxWalkingDistanceM) {
            candidateEdges.push(buildWalkingEdge(
              currentState.nodeId,
              END_NODE_ID,
              endDistance,
              currentState.routeId,
              config,
            ));
          }
        }
      }
    }

    for (const edge of candidateEdges) {
      const nextRouteId = edge.mode === "bus" ? edge.routeId : null;
      const nextStateKey = makeStateKey(edge.toNodeId, nextRouteId);
      const tentativeG = currentG + edge.cost;

      const knownG = gScore.get(nextStateKey);
      if (knownG !== undefined && tentativeG >= knownG - EPSILON) {
        continue;
      }

      gScore.set(nextStateKey, tentativeG);
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
      openSet.push({ stateKey: nextStateKey, fScore: nextF });
    }
  }

  if (!finalKey) {
    throw new Error("No route found between origin and destination under current constraints");
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
    from,
    to,
    totalCost,
    components,
    transferCount,
    walkingDistanceM,
    etaSeconds,
    segments,
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
