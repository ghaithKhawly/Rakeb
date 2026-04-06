import type { LocationDTO } from "./location";

export type RoutingPreferenceWeights = {
  speed: number;
  crowding: number;
  price: number;
  transfer: number;
  walking: number;
};

export type RoutingOptions = {
  maxWalkingDistanceM?: number;
  maxTotalWalkingDistanceM?: number;
  maxWalkingNeighbors?: number;
  maxBusTransfers?: number;
  walkingSpeedMps?: number;
};

export type NavigationRouteRequestBody = {
  from: LocationDTO;
  to: LocationDTO;
  preferences?: Partial<RoutingPreferenceWeights>;
  options?: RoutingOptions;
};

export type RoutingGraphRoute = {
  id: number;
  name: string;
  type: string;
  avg_speed_kmh: number | null;
  base_price: number | null;
  frequency_minutes: number | null;
  crowding_tendency: string | null;
};

export type RoutingGraphNode = {
  id: number;
  latitude: number;
  longitude: number;
};

export type RoutingGraphEdge = {
  id: number;
  from_node: number;
  to_node: number;
  route_id: number | null;
  travel_time: number;
  distance_km: number;
  geom: string | null;
};

export type RoutingGraphRouteNode = {
  route_id: number;
  node_id: number;
  sequence_order: number;
};

export type RoutingGraphSnapshot = {
  routes: RoutingGraphRoute[];
  nodes: RoutingGraphNode[];
  edges: RoutingGraphEdge[];
  routeNodes: RoutingGraphRouteNode[];
  loadedAt: string | null;
  graphVersion: string | null;
};

export type RouteLiveMetricForRouting = {
  routeId: number;
  effectivePrice: number | null;
  effectiveSpeedScore: number | null;
  effectiveCrowdingScore: number | null;
  effectiveSlownessMultiplier: number | null;
};

export type EffectiveRoutingConfig = {
  weights: RoutingPreferenceWeights;
  maxWalkingDistanceM: number;
  maxTotalWalkingDistanceM: number;
  maxWalkingNeighbors: number;
  maxBusTransfers: number;
  walkingSpeedMps: number;
  walkLinearCoeff: number;
  walkExpCoeff: number;
  walkExpScaleM: number;
  transferExpCoeff: number;
  transferExpRate: number;
};

export type RoutingWorkerPayload = {
  from: LocationDTO;
  to: LocationDTO;
  graph: RoutingGraphSnapshot;
  routeMetrics: RouteLiveMetricForRouting[];
  config: EffectiveRoutingConfig;
  walkingMode?: "dynamic" | "precomputed"; // internal: not exposed to clients
};

export type RouteCostBreakdown = {
  speed: number;
  crowding: number;
  price: number;
  transfer: number;
  walking: number;
};

export type RouteSegment = {
  mode: "walk" | "bus";
  routeId: number | null;
  routeName: string | null;
  from: LocationDTO;
  to: LocationDTO;
  coordinates: LocationDTO[];
  distanceM: number;
  timeSeconds: number;
  cost: number;
};

export type NavigationRouteResult = {
  message: string;
  executedInWorker: true;
  graphLoadedAt: string | null;
  graphVersion: string | null;
  from: LocationDTO;
  to: LocationDTO;
  totalCost: number;
  components: RouteCostBreakdown;
  transferCount: number;
  walkingDistanceM: number;
  etaSeconds: number;
  segments: RouteSegment[];
  bestEffort: boolean;
  // usedConfig is the server-client parity contract for routing formulas/constants.
  usedConfig: EffectiveRoutingConfig;
};