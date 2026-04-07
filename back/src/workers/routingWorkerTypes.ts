import type { LocationDTO } from "../../../types/location";
import type {
  NavigationRouteResult,
  RouteCostBreakdown,
  RouteLiveMetricForRouting,
  RoutingGraphEdge,
  RoutingGraphNode,
  RoutingWorkerPayload,
} from "../../../types/navigation";

export type RoutingWorkerRequest = {
  id: number;
  payload: RoutingWorkerPayload;
};

export type RoutingWorkerResponse = {
  id: number;
  result?: NavigationRouteResult;
  error?: string;
};

export type RouteMetricsById = Map<number, RouteLiveMetricForRouting>;

export type QueueNode = {
  stateKey: string;
  fScore: number;
  busTransferCount: number;
  cumulativeWalkM: number;
};

export type NodeState = {
  nodeId: number;
  routeId: number | null;
  busTransferCount: number;
  hasLongWalk: boolean;
  busDistanceSinceLongWalkM: number;
};

export type StepEdge = {
  fromNodeId: number;
  toNodeId: number;
  mode: "walk" | "bus";
  routeId: number | null;
  distanceM: number;
  timeSeconds: number;
  cost: number;
  components: RouteCostBreakdown;
  transferIncrement: number;
  polyline?: LocationDTO[];
};

export type ParentInfo = {
  previousStateKey: string;
  edge: StepEdge;
};

export type GraphIndexes = {
  nodeById: Map<number, RoutingGraphNode>;
  routeNameById: Map<number, string>;
  busAdjacency: Map<number, RoutingGraphEdge[]>;
  walkingAdjacency: Map<number, RoutingGraphEdge[]>;
  spatialBuckets: Map<string, number[]>;
  bucketSizeDeg: number;
};

export type RoutingDiagnostics = {
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
