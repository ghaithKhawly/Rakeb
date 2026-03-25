export type CrowdingTendency = "low" | "medium" | "high";

export type BusRouteDTO = {
  id: number;
  name: string;
  type: "bus" | string;
  avg_speed_kmh: number | null;
  base_price: number | null;
  frequency_minutes: number | null;
  crowding_tendency: CrowdingTendency | null;
  created_at: string | null;
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
