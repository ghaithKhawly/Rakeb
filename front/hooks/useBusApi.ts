import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useAuth } from "@/hooks/AuthContext";

import {
  computeNavigationRoute,
  deleteAllBusses,
  deleteBusById,
  deleteUserTravelHistory,
  getBusById,
  getBusFeedbackSummary,
  getBusses,
  getGraphCacheStatus,
  getGraphSnapshot,
  getRoutingPreferences,
  getRouteLiveMetrics,
  getUserTravelHistory,
  increaseBusPricesByTenPercent,
  invalidateGraphCache,
  parseNavigationText,
  setRoutingPreferences,
  submitBusFeedback,
} from "@/services/busApi";

import type {
  DeleteBusesQuery,
  DeleteBusQuery,
  DeleteUserTravelHistoryQuery,
  GetBusesQuery,
  GetGraphQuery,
  GetRouteLiveMetricsQuery,
  GetUserTravelHistoryQuery,
  GraphCacheQuery,
  InvalidateGraphQuery,
  SetRoutingPreferencesBody,
  SubmitBusFeedbackBody,
} from "../../types/bus";
import type {
  NavigationRouteRequestBody,
  ParseNavigationTextRequestBody,
} from "../../types/navigation";

export const busApiKeys = {
  all: ["busApi"] as const,
  navigationRoute: () => [...busApiKeys.all, "navigationRoute"] as const,
  travelHistory: (query: GetUserTravelHistoryQuery) => [...busApiKeys.all, "travelHistory", query] as const,
  graphCacheStatus: (query: GraphCacheQuery) => [...busApiKeys.all, "graphCacheStatus", query] as const,
  graphSnapshot: (query: GetGraphQuery) => [...busApiKeys.all, "graphSnapshot", query] as const,
  busses: (query: GetBusesQuery) => [...busApiKeys.all, "busses", query] as const,
  busById: (id: number) => [...busApiKeys.all, "busById", id] as const,
  routingPreferences: () => [...busApiKeys.all, "routingPreferences"] as const,
  routeLiveMetrics: (query: GetRouteLiveMetricsQuery) => [...busApiKeys.all, "routeLiveMetrics", query] as const,
  busFeedbackSummary: (routeId: number, days: number) => [...busApiKeys.all, "busFeedbackSummary", routeId, days] as const,
};

function invalidate(queryClient: ReturnType<typeof useQueryClient>, key: QueryKey) {
  return queryClient.invalidateQueries({ queryKey: key });
}

export function useBusses(query: GetBusesQuery = {}) {
  const { token } = useAuth();
  return useQuery({
    queryKey: busApiKeys.busses(query),
    queryFn: () => getBusses(query),
    enabled: !!token,
  });
}

export function useBusById(id?: number) {
  return useQuery({
    queryKey: id ? busApiKeys.busById(id) : [...busApiKeys.all, "busById", "disabled"],
    queryFn: () => getBusById(id as number),
    enabled: typeof id === "number" && id > 0,
  });
}

export function useGraphCacheStatus(query: GraphCacheQuery = {}) {
  const { token } = useAuth();
  return useQuery({
    queryKey: busApiKeys.graphCacheStatus(query),
    queryFn: () => getGraphCacheStatus(query),
    enabled: !!token,
  });
}

export function useGraphSnapshot(query: GetGraphQuery = {}) {
  const { token } = useAuth();
  return useQuery({
    queryKey: busApiKeys.graphSnapshot(query),
    queryFn: () => getGraphSnapshot(query),
    enabled: !!token,
  });
}

export function useUserTravelHistory(query: GetUserTravelHistoryQuery = {}) {
  const { token } = useAuth();
  return useQuery({
    queryKey: busApiKeys.travelHistory(query),
    queryFn: () => getUserTravelHistory(query),
    enabled: !!token,
  });
}

export function useRouteLiveMetrics(query: GetRouteLiveMetricsQuery = {}) {
  const { token } = useAuth();
  return useQuery({
    queryKey: busApiKeys.routeLiveMetrics(query),
    queryFn: () => getRouteLiveMetrics(query),
    enabled: !!token,
  });
}

export function useBusFeedbackSummary(routeId?: number, days = 30) {
  return useQuery({
    queryKey: routeId
      ? busApiKeys.busFeedbackSummary(routeId, days)
      : [...busApiKeys.all, "busFeedbackSummary", "disabled"],
    queryFn: () => getBusFeedbackSummary({ routeId: routeId as number, days }),
    enabled: typeof routeId === "number" && routeId > 0,
  });
}

export function useComputeNavigationRouteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: NavigationRouteRequestBody) => computeNavigationRoute(body),
    onSuccess: async () => {
      await invalidate(queryClient, [...busApiKeys.all, "travelHistory"]);
    },
  });
}

export function useParseNavigationTextMutation() {
  return useMutation({
    mutationFn: (body: ParseNavigationTextRequestBody) => parseNavigationText(body),
  });
}

export function useDeleteUserTravelHistoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (query: DeleteUserTravelHistoryQuery) => deleteUserTravelHistory(query),
    onSuccess: async () => {
      await invalidate(queryClient, [...busApiKeys.all, "travelHistory"]);
    },
  });
}

export function useInvalidateGraphCacheMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (query: InvalidateGraphQuery = {}) => invalidateGraphCache(query),
    onSuccess: async () => {
      await Promise.all([
        invalidate(queryClient, [...busApiKeys.all, "graphCacheStatus"]),
        invalidate(queryClient, [...busApiKeys.all, "graphSnapshot"]),
      ]);
    },
  });
}

export function useDeleteBusByIdMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (query: DeleteBusQuery) => deleteBusById(query),
    onSuccess: async () => {
      await Promise.all([
        invalidate(queryClient, [...busApiKeys.all, "busses"]),
        invalidate(queryClient, [...busApiKeys.all, "graphCacheStatus"]),
      ]);
    },
  });
}

export function useDeleteAllBussesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (query: DeleteBusesQuery = {}) => deleteAllBusses(query),
    onSuccess: async () => {
      await Promise.all([
        invalidate(queryClient, [...busApiKeys.all, "busses"]),
        invalidate(queryClient, [...busApiKeys.all, "graphCacheStatus"]),
        invalidate(queryClient, [...busApiKeys.all, "graphSnapshot"]),
      ]);
    },
  });
}

export function useSubmitBusFeedbackMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SubmitBusFeedbackBody) => submitBusFeedback(body),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        invalidate(queryClient, [...busApiKeys.all, "routeLiveMetrics"]),
        invalidate(queryClient, [...busApiKeys.all, "busFeedbackSummary", variables.routeId]),
      ]);
    },
  });
}

export function useIncreaseBusPricesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => increaseBusPricesByTenPercent(),
    onSuccess: async () => {
      await invalidate(queryClient, [...busApiKeys.all, "busses"]);
    },
  });
}

export function useRoutingPreferences() {
  const { token } = useAuth();
  return useQuery({
    queryKey: busApiKeys.routingPreferences(),
    queryFn: () => getRoutingPreferences(),
    enabled: !!token,
  });
}

export function useSetRoutingPreferencesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SetRoutingPreferencesBody) => setRoutingPreferences(body),
    onSuccess: async () => {
      await invalidate(queryClient, busApiKeys.routingPreferences());
    },
  });
}