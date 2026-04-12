import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { computeNavigationRoute } from "@/services/busApi";

type LocationDTO = {
  lat: number;
  lng: number;
  label?: string;
};

type RoutingPreferenceWeights = {
  speed: number;
  crowding: number;
  price: number;
  transfer: number;
  walking: number;
};

type NavigationRouteResult = Awaited<ReturnType<typeof computeNavigationRoute>>;

type RoutePlanningContextType = {
  currentLocation: LocationDTO | null;
  destination: LocationDTO | null;
  routeResult: NavigationRouteResult | null;
  routeOptions: NavigationRouteResult[];
  selectedRoute: NavigationRouteResult | null;
  selectedRouteIndex: number;
  preferences: RoutingPreferenceWeights;
  isRouting: boolean;
  routingError: string | null;
  setCurrentLocation: (location: LocationDTO | null) => void;
  setDestination: (destination: LocationDTO | null) => void;
  setSelectedRouteIndex: (index: number) => void;
  updatePreference: (
    key: keyof RoutingPreferenceWeights,
    value: number,
  ) => void;
  computeRoute: () => Promise<void>;
  clearRoute: () => void;
};

const defaultPreferences: RoutingPreferenceWeights = {
  speed: 85,
  crowding: 30,
  price: 15,
  transfer: 60,
  walking: 45,
};

const RoutePlanningContext = createContext<
  RoutePlanningContextType | undefined
>(undefined);

export function RoutePlanningProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [currentLocation, setCurrentLocation] = useState<LocationDTO | null>(
    null,
  );
  const [destination, setDestination] = useState<LocationDTO | null>(null);
  const [routeResult, setRouteResult] = useState<NavigationRouteResult | null>(
    null,
  );
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [preferences, setPreferences] =
    useState<RoutingPreferenceWeights>(defaultPreferences);
  const [isRouting, setIsRouting] = useState(false);
  const [routingError, setRoutingError] = useState<string | null>(null);

  const updatePreference = useCallback(
    (key: keyof RoutingPreferenceWeights, value: number) => {
      const nextValue = Math.max(0, Math.min(100, Math.round(value)));
      setPreferences((previous) => ({ ...previous, [key]: nextValue }));
    },
    [],
  );

  const clearRoute = useCallback(() => {
    setRouteResult(null);
    setRoutingError(null);
    setSelectedRouteIndex(0);
  }, []);

  const computeRoute = useCallback(async () => {
    if (!currentLocation || !destination) {
      setRoutingError("Current location and destination are required.");
      return;
    }

    setIsRouting(true);
    setRoutingError(null);

    try {
      const result = await computeNavigationRoute({
        from: currentLocation,
        to: destination,
        preferences,
      });
      setRouteResult(result);
      setSelectedRouteIndex(0);
    } catch (error) {
      const fallbackMessage =
        "Unable to compute route right now. Please try again.";
      setRoutingError(error instanceof Error ? error.message : fallbackMessage);
      setRouteResult(null);
    } finally {
      setIsRouting(false);
    }
  }, [currentLocation, destination, preferences]);

  const routeOptions = useMemo(() => {
    if (!routeResult) {
      return [] as NavigationRouteResult[];
    }

    if (Array.isArray(routeResult.routes) && routeResult.routes.length > 0) {
      return routeResult.routes;
    }

    return [routeResult, ...(routeResult.alternatives ?? [])];
  }, [routeResult]);

  const selectedRoute = useMemo(() => {
    if (routeOptions.length === 0) {
      return null;
    }

    const safeIndex = Math.max(0, Math.min(selectedRouteIndex, routeOptions.length - 1));
    return routeOptions[safeIndex] ?? null;
  }, [routeOptions, selectedRouteIndex]);

  const value = useMemo(
    () => ({
      currentLocation,
      destination,
      routeResult,
      routeOptions,
      selectedRoute,
      selectedRouteIndex,
      preferences,
      isRouting,
      routingError,
      setCurrentLocation,
      setDestination,
      setSelectedRouteIndex,
      updatePreference,
      computeRoute,
      clearRoute,
    }),
    [
      currentLocation,
      destination,
      routeResult,
      routeOptions,
      selectedRoute,
      selectedRouteIndex,
      preferences,
      isRouting,
      routingError,
      updatePreference,
      computeRoute,
      clearRoute,
    ],
  );

  return (
    <RoutePlanningContext.Provider value={value}>
      {children}
    </RoutePlanningContext.Provider>
  );
}

export function useRoutePlanning() {
  const context = useContext(RoutePlanningContext);

  if (!context) {
    throw new Error(
      "useRoutePlanning must be used inside RoutePlanningProvider",
    );
  }

  return context;
}
