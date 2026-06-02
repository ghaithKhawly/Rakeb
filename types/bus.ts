export type CrowdingTendency = "low" | "medium" | "high";
export type TransitRouteType = "bus" | "microbus";

export type BusRouteDTO = {
  id: number;
  name: string;
  type: TransitRouteType | string;
  avg_speed_kmh: number | null;
  base_price: number | null;
  frequency_minutes: number | null;
  crowding_tendency: CrowdingTendency | null;
  max_active_buses?: number | null;
  created_at: string | null;
};

export type RouteAvailabilitySummary = {
  routeId: number;
  activeDriverCount: number;
  maxActiveBuses: number;
  availabilityRatio: number;
  updatedAt: string | null;
};

export type DriverSessionSummary = {
  sessionId: number;
  userId: number;
  routeId: number;
  checkedInAt: string;
  checkedOutAt: string | null;
};

export type GetBusesQuery = {
  name?: string;
  crowdingTendency?: CrowdingTendency;
  minSpeedKmh?: number;
  maxSpeedKmh?: number;
  limit?: number;
  offset?: number;
};

export type GetBusQuery = {
  id: number;
};
export type DeleteBusQuery = {
  id: number;
  invalidateGraph?: boolean;
};

export type DeleteBusesQuery = {
  invalidateGraph?: boolean;
};

export type GraphCacheQuery = {
  forceRefresh?: boolean;
};

export type GetGraphQuery = {
  forceRefresh?: boolean;
  includeRoutes?: boolean;
  includeNodes?: boolean;
  includeEdges?: boolean;
  includeRouteNodes?: boolean;
};

export type InvalidateGraphQuery = {
  rebuild?: boolean;
  wait?: boolean;
};

export type SubmitBusFeedbackBody = {
  routeId: number;
  reportedPrice?: number;
  crowdingLevel?: number;
  speedLevel?: number;
  slownessLevel?: number;
  comment?: string;
};

export type GetBusFeedbackSummaryQuery = {
  routeId: number;
  days?: number;
};

export type GetRouteLiveMetricsQuery = {
  routeId?: number;
  refresh?: boolean;
};

export type GetUserTravelHistoryQuery = {
  limit?: number;
  offset?: number;
};

export type DeleteUserTravelHistoryQuery = {
  id: number;
};

export type SaveUserTravelHistoryBody = {
  routeResult: unknown;
  startedAt?: string;
  finishedAt?: string;
};

export type SetRoutingPreferencesBody = {
  preferences?: {
    speed?: number;
    crowding?: number;
    price?: number;
    transfer?: number;
    walking?: number;
  };
  options?: {
    maxWalkingDistanceM?: number;
    maxTotalWalkingDistanceM?: number;
    maxWalkingNeighbors?: number;
    maxBusTransfers?: number;
    walkingSpeedMps?: number;
  };
};

export type DriverCheckInBody = {
  routeId: number;
};

export type DriverCheckOutBody = {
  routeId?: number;
};

export type DriverCheckInResponse = {
  message: string;
  session: DriverSessionSummary;
  availability: RouteAvailabilitySummary;
};

export type DriverCheckOutResponse = {
  message: string;
  session: DriverSessionSummary;
  availability: RouteAvailabilitySummary;
};

export type RouteAvailabilityResponse = {
  availability: RouteAvailabilitySummary[];
};

export type RouteDrawCoordinate = {
  lat: number;
  lng: number;
};

export type CreateAdminRouteBody = {
  name: string;
  transportType: TransitRouteType;
  basePrice?: number;
  avgSpeedKmh?: number;
  maxActiveBuses?: number;
  snapToRoads?: boolean;
  coordinates: RouteDrawCoordinate[];
};

export type CreateAdminRouteResponse = {
  message: string;
  route: BusRouteDTO;
  graph: {
    nodesCreated: number;
    edgesCreated: number;
  };
  snap?: {
    applied: boolean;
    source: string;
    distanceM: number | null;
    durationSeconds: number | null;
  };
};

export type SnapAdminRouteBody = {
  coordinates: RouteDrawCoordinate[];
};

export type SnapAdminRouteResponse = {
  coordinates: RouteDrawCoordinate[];
  distanceM: number | null;
  durationSeconds: number | null;
  source: string;
  fallbackReason?: string;
};
