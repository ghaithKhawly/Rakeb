import { parentPort } from "node:worker_threads";

import type {
  NavigationRouteResult,
  RouteCostBreakdown,
  RouteLiveMetricForRouting,
  RouteSegment,
  RoutingGraphNode,
  RoutingWorkerPayload,
} from "../../../types/navigation";
import { MinHeap } from "./routingHeap.js";
import {
  appendSegmentCoordinates,
  buildBusEdge,
  buildIndexes,
  buildStepPolyline,
  buildWalkingEdge,
  createDiagnostics,
  findAnchorNodeIds,
  findNearbyNodeIds,
  formatSegment,
  haversineDistanceM,
  heuristicCost,
  logRoutingDiagnostics,
  makeStateKey,
  mergeComponents,
  nodeToLocation,
  parseStateKey,
} from "./routingWorkerHelpers.js";
import type {
  ParentInfo,
  RouteMetricsById,
  RoutingWorkerRequest,
  RoutingWorkerResponse,
  StepEdge,
} from "./routingWorkerTypes.js";
import { enrichBusSegmentGeometryWithApi } from "./busRoutingApi.js";
import { enrichWalkingStepWithApi } from "./walkingRoutingApi.js";

const START_NODE_ID = -1;
const END_NODE_ID = -2;
const EPSILON = 1e-9;

async function runWeightedAStar(payload: RoutingWorkerPayload): Promise<NavigationRouteResult> {
  const { graph, from, to, routeMetrics, config } = payload;
  const walkingMode = payload.walkingMode ?? "api";
  const maxExpandedStates = Math.max(
    80_000,
    Number(process.env.ROUTING_MAX_EXPANDED_STATES ?? 220_000),
  );
  const allowStartAnchorOverCap = payload.relaxation?.allowStartAnchorOverCap === true;
  const allowEndAnchorOverCap = payload.relaxation?.allowEndAnchorOverCap === true;
  const requireBusSegment = payload.relaxation?.requireBusSegment === true;
  const enforceStrictAvailability =
    process.env.ROUTING_STRICT_AVAILABILITY === "1"
    || (process.env.ROUTING_STRICT_AVAILABILITY == null && process.env.NODE_ENV === "production");
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
        availability: 0,
      },
      transferCount: 0,
      walkingDistanceM: 0,
      etaSeconds: 0,
      segments: [],
      bestEffort: false,
      walkingMode,
      usedConfig: config,
    };
  }

  const bucketSizeDeg = Math.max(0.0005, config.maxWalkingDistanceM / 111320);
  const indexes = buildIndexes(graph, bucketSizeDeg);
  const metricsByRoute: RouteMetricsById = new Map(routeMetrics.map((metric: RouteLiveMetricForRouting) => [metric.routeId, metric]));

  const startNeighbors = findAnchorNodeIds(from, indexes);

  if (process.env.DEBUG_ROUTING === "1") {
    console.warn("[routing-worker] search start", JSON.stringify({
      walkingMode,
      from,
      to,
      startNeighborsCount: startNeighbors.length,
      endNeighborsCount: 0,
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
    if (diagnostics.expandedStates > maxExpandedStates) {
      logRoutingDiagnostics(diagnostics, payload, startNeighbors.length, 0, walkingMode);
      throw new Error(
        `Routing search budget exceeded before finding a path | expanded=${diagnostics.expandedStates} max=${maxExpandedStates} diagnostics=${JSON.stringify(diagnostics)}`,
      );
    }

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

        if (!allowStartAnchorOverCap && neighbor.distanceM > config.maxWalkingDistanceM) {
          diagnostics.prunedMaxSingleWalk += 1;
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
        if (enforceStrictAvailability && edge.route_id != null) {
          const metric = metricsByRoute.get(edge.route_id);
          const availabilityRatio = typeof metric?.availabilityRatio === "number"
            ? metric.availabilityRatio
            : 0;

          if (availabilityRatio <= 0) {
            continue;
          }
        }

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

        if (walkingMode === "api" || walkingMode === "dynamic") {
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

        const endDistance = haversineDistanceM(currentLocation, to);
        if (allowEndAnchorOverCap || endDistance <= config.maxWalkingDistanceM) {
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
      const isStartAnchorWalk = edge.mode === "walk" && edge.fromNodeId === START_NODE_ID;
      const isEndAnchorWalk = edge.mode === "walk" && edge.toNodeId === END_NODE_ID;
      const startAnchorAllowed = isStartAnchorWalk && allowStartAnchorOverCap;
      const endAnchorAllowed = isEndAnchorWalk && allowEndAnchorOverCap;

      if (!startAnchorAllowed && !endAnchorAllowed && edge.mode === "walk" && edge.distanceM > config.maxWalkingDistanceM) {
        diagnostics.prunedMaxSingleWalk += 1;
        continue;
      }

      const existingWalkM = cumulativeWalkM.get(current.stateKey) ?? 0;
      const projectedWalkM = existingWalkM + (edge.mode === "walk" ? edge.distanceM : 0);
      if (projectedWalkM > config.maxTotalWalkingDistanceM) {
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
    logRoutingDiagnostics(diagnostics, payload, startNeighbors.length, 0, walkingMode);
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
    availability: 0,
  };

  if (requireBusSegment && !steps.some((step) => step.mode === "bus")) {
    throw new Error("No transit-first route found under current constraints");
  }

  const enrichedSteps: StepEdge[] = [];
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

    enrichedSteps.push(
      walkingMode === "api"
        ? await enrichWalkingStepWithApi(step, fromLocation, toLocation, config)
        : step,
    );
  }

  const components = enrichedSteps.reduce((acc, step) => mergeComponents(acc, step.components), zero);
  const totalCost = enrichedSteps.reduce((sum, step) => sum + step.cost, 0);
  const transferCount = enrichedSteps.reduce((sum, step) => sum + step.transferIncrement, 0);
  const walkingDistanceM = enrichedSteps
    .filter((step) => step.mode === "walk")
    .reduce((sum, step) => sum + step.distanceM, 0);
  const etaSeconds = enrichedSteps.reduce((sum, step) => sum + step.timeSeconds, 0);

  const segments: RouteSegment[] = [];
  for (const step of enrichedSteps) {
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

    const stepCoordinates = buildStepPolyline(step, fromLocation, toLocation);

    const previous = segments[segments.length - 1];
    if (previous && previous.mode === step.mode && previous.routeId === step.routeId) {
      previous.to = toLocation;
      previous.coordinates = appendSegmentCoordinates(previous.coordinates, stepCoordinates);
      previous.distanceM += step.distanceM;
      previous.timeSeconds += step.timeSeconds;
      previous.cost += step.cost;
      continue;
    }

    segments.push(formatSegment(step, fromLocation, toLocation, stepCoordinates, indexes.routeNameById));
  }

  const roadSnappedSegments = await Promise.all(
    segments.map((segment) => enrichBusSegmentGeometryWithApi(segment)),
  );

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
    segments: roadSnappedSegments,
    bestEffort: false,
    walkingMode,
    usedConfig: config,
  };
}

if (!parentPort) {
  throw new Error("routingWorker must run inside a worker thread");
}

const port = parentPort;

port.on("message", async (message: RoutingWorkerRequest) => {
  try {
    const response: RoutingWorkerResponse = { id: message.id, result: await runWeightedAStar(message.payload) };

    port.postMessage(response);
  } catch (error) {
    port.postMessage({
      id: message.id,
      error: error instanceof Error ? error.message : String(error),
    } satisfies RoutingWorkerResponse);
  }
});
