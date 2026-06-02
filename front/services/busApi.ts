import { api } from "@/config/api";

import type {
  BusRouteDTO,
  CreateAdminRouteBody,
  CreateAdminRouteResponse,
  DeleteBusesQuery,
  DeleteBusQuery,
  DeleteUserTravelHistoryQuery,
  GetBusFeedbackSummaryQuery,
  GetBusesQuery,
  GetGraphQuery,
  GetRouteLiveMetricsQuery,
  GetUserTravelHistoryQuery,
  GraphCacheQuery,
  InvalidateGraphQuery,
  SetRoutingPreferencesBody,
  SnapAdminRouteBody,
  SnapAdminRouteResponse,
  SubmitBusFeedbackBody,
} from "../../types/bus";
import type {
  ResolveTripRequestBody,
  ResolveTripResponse,
  RoutingPreferenceWeights,
  NavigationRouteRequestBody,
  NavigationRouteResult,
  RoutingGraphSnapshot,
} from "../../types/navigation";

export type ApiMessageResponse = {
  message: string;
};

export type GetBussesResponse = {
  busses: BusRouteDTO[];
};

export type GetBusResponse = {
  busses: BusRouteDTO[];
};

export type GraphCacheStatusResponse = {
  isLoaded: boolean;
  loadedAt: string | null;
  lastInvalidatedAt: string | null;
  rebuild: {
    isRebuilding: boolean;
    startedAt: string | null;
    finishedAt: string | null;
    lastError: string | null;
  };
  counts: {
    routes: number;
    nodes: number;
    edges: number;
    routeNodes: number;
  } | null;
};

export type GraphSnapshotResponse = RoutingGraphSnapshot;

export type SubmitBusFeedbackResponse = {
  message: string;
  reportId: number;
};

export type RouteLiveMetric = {
  routeId: number;
  reportsCount: number;
  confidenceScore: number;
  avgReportedPrice: number | null;
  avgCrowdingLevel: number | null;
  avgSpeedLevel: number | null;
  avgSlownessLevel: number | null;
  effectivePrice: number | null;
  effectiveSpeedScore: number | null;
  effectiveCrowdingScore: number | null;
  effectiveSlownessMultiplier: number;
  suggestedAvgSpeedKmh: number | null;
  activeDriverCount: number;
  maxActiveBuses: number;
  availabilityRatio: number;
  lastReportAt: string | null;
  updatedAt: string | null;
};

export type GetRouteLiveMetricsResponse = {
  metrics: RouteLiveMetric[];
};

export type GetBusFeedbackSummaryResponse = {
  routeId: number;
  windowDays: number;
  reportsCount: number;
  avgPrice: number | null;
  avgCrowdingLevel: number | null;
  avgSpeedLevel: number | null;
  avgSlownessLevel: number | null;
  crowdingTendency: "low" | "medium" | "high" | null;
  speedMultiplierSuggestion: number | null;
  lastReportAt: string | null;
};

export type TravelHistoryItem = {
  id: number;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  originLabel: string | null;
  destLabel: string | null;
  routeIds: number[] | null;
  transferCount: number | null;
  totalDistanceM: number | null;
  totalDurationSeconds: number | null;
  dayOfWeek: number;
  hourOfDay: number;
  traveledAt: string | null;
  pathfindingResult: unknown;
};

export type SaveUserTravelHistoryBody = {
  routeResult: NavigationRouteResult;
  startedAt?: string;
  finishedAt?: string;
};

export type GetUserTravelHistoryResponse = {
  limit: number;
  offset: number;
  total: number;
  items: TravelHistoryItem[];
};

export type RoutingPreferencesResponse = {
  message?: string;
  preferences: RoutingPreferenceWeights;
  options: {
    maxWalkingDistanceM: number;
    maxTotalWalkingDistanceM: number;
    maxWalkingNeighbors: number;
    maxBusTransfers: number;
    walkingSpeedMps: number;
  };
};

export async function computeNavigationRoute(
  body: NavigationRouteRequestBody,
): Promise<NavigationRouteResult> {
  const { data } = await api.post<NavigationRouteResult>(
    "/api/busses/navigation/route",
    body,
  );
  return data;
}

export async function resolveTrip(
  body: ResolveTripRequestBody,
): Promise<ResolveTripResponse> {
  const { data } = await api.post<ResolveTripResponse>(
    "/api/trip/resolve",
    body,
  );
  return data;
}

export async function getUserTravelHistory(
  query: GetUserTravelHistoryQuery = {},
): Promise<GetUserTravelHistoryResponse> {
  const { data } = await api.get<GetUserTravelHistoryResponse>(
    "/api/busses/navigation/history",
    { params: query },
  );
  return data;
}

export async function saveUserTravelHistory(
  body: SaveUserTravelHistoryBody,
): Promise<ApiMessageResponse> {
  const { data } = await api.post<ApiMessageResponse>(
    "/api/busses/navigation/history",
    body,
  );
  return data;
}

export async function getRoutingPreferences(): Promise<RoutingPreferencesResponse> {
  const { data } = await api.get<RoutingPreferencesResponse>(
    "/api/busses/navigation/preferences",
  );
  return data;
}

export async function setRoutingPreferences(
  body: SetRoutingPreferencesBody,
): Promise<RoutingPreferencesResponse> {
  const { data } = await api.post<RoutingPreferencesResponse>(
    "/api/busses/navigation/preferences",
    body,
  );
  return data;
}

export async function deleteUserTravelHistory(
  query: DeleteUserTravelHistoryQuery,
): Promise<ApiMessageResponse> {
  const { data } = await api.delete<ApiMessageResponse>(
    "/api/busses/navigation/history",
    { params: query },
  );
  return data;
}

export async function getGraphCacheStatus(
  query: GraphCacheQuery = {},
): Promise<GraphCacheStatusResponse> {
  const { data } = await api.get<GraphCacheStatusResponse>("/api/busses/graph/cache", {
    params: query,
  });
  return data;
}

export async function invalidateGraphCache(
  query: InvalidateGraphQuery = {},
): Promise<ApiMessageResponse> {
  const { data } = await api.post<ApiMessageResponse>(
    "/api/busses/graph/invalidate",
    {},
    { params: query },
  );
  return data;
}

export async function getGraphSnapshot(
  query: GetGraphQuery = {},
): Promise<GraphSnapshotResponse> {
  const { data } = await api.get<GraphSnapshotResponse>("/api/busses/graph", {
    params: query,
  });
  return data;
}

export async function getBusses(
  query: GetBusesQuery = {},
): Promise<GetBussesResponse> {
  const { data } = await api.get<GetBussesResponse>("/api/busses/busses", {
    params: query,
  });
  return data;
}

export async function getBusById(id: number): Promise<GetBusResponse> {
  const { data } = await api.get<GetBusResponse>("/api/busses/bus", {
    params: { id },
  });
  return data;
}

export async function createAdminRoute(
  body: CreateAdminRouteBody,
): Promise<CreateAdminRouteResponse> {
  const { data } = await api.post<CreateAdminRouteResponse>(
    "/api/busses/admin/routes",
    body,
  );
  return data;
}

export async function snapAdminRoute(
  body: SnapAdminRouteBody,
): Promise<SnapAdminRouteResponse> {
  const { data } = await api.post<SnapAdminRouteResponse>(
    "/api/busses/admin/routes/snap",
    body,
  );
  return data;
}

export async function deleteAllBusses(
  query: DeleteBusesQuery = {},
): Promise<ApiMessageResponse> {
  const { data } = await api.delete<ApiMessageResponse>("/api/busses/busses", {
    params: query,
  });
  return data;
}

export async function deleteBusById(
  query: DeleteBusQuery,
): Promise<ApiMessageResponse> {
  const { data } = await api.delete<ApiMessageResponse>("/api/busses/bus", {
    params: query,
  });
  return data;
}

export async function submitBusFeedback(
  body: SubmitBusFeedbackBody,
): Promise<SubmitBusFeedbackResponse> {
  const { data } = await api.post<SubmitBusFeedbackResponse>(
    "/api/busses/bus/feedback",
    body,
  );
  return data;
}

export async function getRouteLiveMetrics(
  query: GetRouteLiveMetricsQuery = {},
): Promise<GetRouteLiveMetricsResponse> {
  const { data } = await api.get<GetRouteLiveMetricsResponse>(
    "/api/busses/bus/live-metrics",
    {
      params: query,
    },
  );
  return data;
}

export async function getBusFeedbackSummary(
  query: GetBusFeedbackSummaryQuery,
): Promise<GetBusFeedbackSummaryResponse> {
  const { data } = await api.get<GetBusFeedbackSummaryResponse>(
    "/api/busses/bus/feedback/summary",
    {
      params: query,
    },
  );
  return data;
}

export async function increaseBusPricesByTenPercent(): Promise<ApiMessageResponse> {
  const { data } = await api.post<ApiMessageResponse>("/api/busses/busses/price", {});
  return data;
}
