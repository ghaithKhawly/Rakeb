import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  SafeAreaView,
  Share,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import MapView, { Marker, Polyline } from "@/components/maps/MapViewCompat";
import type { Region } from "@/components/maps/MapViewCompat";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { LocationDTO } from "../../../types/location";
import type {
  NavigationRouteRequestBody,
  NavigationRouteResult,
  RouteSegment,
} from "../../../types/navigation";
import { api } from "@/config/api";
import { Colors, Kinetic, TransitTheme } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { HintBanner } from "@/components/ui/HintBanner";
import { MapSearchControl } from "@/components/MapSearchControl";
import { RoutePlannerControls } from "@/components/home/RoutePlannerControls";
import { RoutePreferencesModal } from "@/components/home/RoutePreferencesModal";
import { RouteStepsList } from "@/components/home/RouteStepsList";
import { getSegmentColor } from "@/utils/routeColors";
import {
  useRoutingPreferences,
  useSetRoutingPreferencesMutation,
} from "@/hooks/useBusApi";
import { useLanguage } from "@/hooks/LanguageContext";
import { hapticLight, hapticMedium, hapticSelection, hapticSuccess } from "@/utils/haptics";
import {
  extractApiErrorMessage,
  getSelectedRoute,
  INITIAL_REGION,
  POINT_COLORS,
  pointId,
  pointName,
  toMapCoordinates,
} from "@/utils/homeScreenUtils";

type RouteFilterValue =
  | "balanced"
  | "fastest"
  | "fewestTransfers"
  | "lessWalking"
  | "cheapest"
  | "lessCrowded";

const ROUTE_FILTER_WEIGHTS: Record<
  RouteFilterValue,
  { speed: number; crowding: number; price: number; transfer: number; walking: number }
> = {
  balanced: { speed: 1, crowding: 1, price: 1, transfer: 1, walking: 1 },
  fastest: { speed: 2, crowding: 0.8, price: 0.8, transfer: 1.2, walking: 0.8 },
  fewestTransfers: { speed: 1.1, crowding: 0.8, price: 0.8, transfer: 2, walking: 1.1 },
  lessWalking: { speed: 1, crowding: 0.8, price: 0.8, transfer: 1.3, walking: 2 },
  cheapest: { speed: 0.9, crowding: 0.8, price: 2, transfer: 1, walking: 1 },
  lessCrowded: { speed: 1, crowding: 2, price: 0.8, transfer: 1, walking: 1 },
};

const UNIVERSAL_LINK_BASE = "https://jr-routing.app/route-share";
const FAVORITE_ORIGINS_STORAGE_KEY = "favorite_origins";

type FavoriteOrigin = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  updatedAt: number;
};

function normalizePreferenceWeights(weights: {
  speed: number;
  crowding: number;
  price: number;
  transfer: number;
  walking: number;
}) {
  const sum =
    Math.max(0, weights.speed) +
    Math.max(0, weights.crowding) +
    Math.max(0, weights.price) +
    Math.max(0, weights.transfer) +
    Math.max(0, weights.walking);

  if (sum <= 0) {
    return { speed: 0.2, crowding: 0.2, price: 0.2, transfer: 0.2, walking: 0.2 };
  }

  return {
    speed: Math.max(0, weights.speed) / sum,
    crowding: Math.max(0, weights.crowding) / sum,
    price: Math.max(0, weights.price) / sum,
    transfer: Math.max(0, weights.transfer) / sum,
    walking: Math.max(0, weights.walking) / sum,
  };
}

function nearestRouteFilter(weights: {
  speed: number;
  crowding: number;
  price: number;
  transfer: number;
  walking: number;
}): RouteFilterValue {
  const normalizedInput = normalizePreferenceWeights(weights);
  const entries = Object.entries(ROUTE_FILTER_WEIGHTS) as Array<
    [RouteFilterValue, (typeof ROUTE_FILTER_WEIGHTS)[RouteFilterValue]]
  >;
  let bestFilter: RouteFilterValue = "balanced";
  let bestScore = Number.POSITIVE_INFINITY;

  for (const [filterName, target] of entries) {
    const normalizedTarget = normalizePreferenceWeights(target);
    const score =
      Math.abs(normalizedTarget.speed - normalizedInput.speed) +
      Math.abs(normalizedTarget.crowding - normalizedInput.crowding) +
      Math.abs(normalizedTarget.price - normalizedInput.price) +
      Math.abs(normalizedTarget.transfer - normalizedInput.transfer) +
      Math.abs(normalizedTarget.walking - normalizedInput.walking);

    if (score < bestScore) {
      bestScore = score;
      bestFilter = filterName;
    }
  }

  return bestFilter;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { isRTL, t } = useLanguage();
  const sharedParams = useLocalSearchParams<{
    fromLat?: string;
    fromLng?: string;
    fromLabel?: string;
    toLat?: string;
    toLng?: string;
    toLabel?: string;
  }>();
  const topOverlayInset = Math.max(insets.top, 10) + 8;
  const topMapControlInset = Math.max(topOverlayInset - 2, 0);
  const sheetBottomOffset = Math.max(insets.bottom + 6, 10);
  const mapRef = useRef<any>(null);
  const sheetScrollRef = useRef<ScrollView>(null);
  const routingPreferencesQuery = useRoutingPreferences();
  const setRoutingPreferencesMutation = useSetRoutingPreferencesMutation();
  const [mapType, setMapType] = useState<"standard" | "satellite">("standard");

  const [currentLocation, setCurrentLocation] = useState<LocationDTO | null>(
    null,
  );
  const [destination, setDestination] = useState<LocationDTO | null>(null);
  const [routeResult, setRouteResult] = useState<NavigationRouteResult | null>(
    null,
  );
  const [selectedAlternativeIndex, setSelectedAlternativeIndex] = useState(0);
  const [expandedRouteIndex, setExpandedRouteIndex] = useState<number | null>(null);
  const [focusedStepIndex, setFocusedStepIndex] = useState<number | null>(null);
  const [mapSelectionMode, setMapSelectionMode] = useState<
    "start" | "destination"
  >("destination");
  const [selectionPhase, setSelectionPhase] = useState<
    "destination" | "origin_menu" | "origin_map" | "ready"
  >("destination");
  const [originMenuOpen, setOriginMenuOpen] = useState(false);
  const [originPanelAnchor, setOriginPanelAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const originPanelAnim = useRef(new Animated.Value(0)).current;
  const [originSearchText, setOriginSearchText] = useState(t("map.startFallback"));
  const [mapCenterPoint, setMapCenterPoint] = useState<LocationDTO | null>(null);
  const [favoriteOrigins, setFavoriteOrigins] = useState<FavoriteOrigin[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [isRouting, setIsRouting] = useState(false);
  const [isSearchingPlace, setIsSearchingPlace] = useState(false);
  const [destinationSearchText, setDestinationSearchText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState(true);
  const [mapSegmentHint, setMapSegmentHint] = useState<{
    label: string;
    color: string;
  } | null>(null);
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<RouteFilterValue>("balanced");
  const lastHandledSharedRouteRef = useRef<string | null>(null);

  const formatTransferText = (count: number) => {
    if (count === 1) {
      return `1 ${t("route.transfer")}`;
    }

    return `${count} ${t("route.transfers")}`;
  };

  const isCrosshairMode = selectionPhase === "origin_map";
  const selectedRoute = useMemo(
    () => getSelectedRoute(routeResult, selectedAlternativeIndex),
    [routeResult, selectedAlternativeIndex],
  );

  const routeChoices = useMemo(() => {
    if (!routeResult) {
      return [] as NavigationRouteResult[];
    }

    if (Array.isArray(routeResult.routes) && routeResult.routes.length > 0) {
      return routeResult.routes;
    }

    return [routeResult, ...(routeResult.alternatives ?? [])];
  }, [routeResult]);

  const expandedRoute =
    expandedRouteIndex !== null ? routeChoices[expandedRouteIndex] ?? null : null;

  useEffect(() => {
    const detect = async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError(t("home.error.locationPermission"));
        return;
      }

      const found = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const point: LocationDTO = {
        lat: found.coords.latitude,
        lng: found.coords.longitude,
        label: t("map.startFallback"),
      };

      setCurrentLocation(point);
      setOriginSearchText(point.label ?? t("map.startFallback"));
      setMapCenterPoint(point);
      mapRef.current?.animateToRegion(
        {
          latitude: point.lat,
          longitude: point.lng,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        },
        350,
      );
    };

    void detect();
  }, []);

  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const stored = await SecureStore.getItemAsync(FAVORITE_ORIGINS_STORAGE_KEY);
        if (!stored) {
          setFavoritesLoaded(true);
          return;
        }

        const parsed = JSON.parse(stored) as FavoriteOrigin[];
        if (Array.isArray(parsed)) {
          setFavoriteOrigins(
            parsed.filter(
              (item) =>
                item &&
                typeof item.id === "string" &&
                typeof item.label === "string" &&
                Number.isFinite(item.lat) &&
                Number.isFinite(item.lng),
            ),
          );
        }
      } catch {
        // Ignore invalid cache and continue with empty favorites.
      } finally {
        setFavoritesLoaded(true);
      }
    };

    void loadFavorites();
  }, []);

  useEffect(() => {
    if (!favoritesLoaded) {
      return;
    }

    void SecureStore.setItemAsync(
      FAVORITE_ORIGINS_STORAGE_KEY,
      JSON.stringify(favoriteOrigins),
    );
  }, [favoriteOrigins, favoritesLoaded]);

  useEffect(() => {
    const fromLat = Number.parseFloat(sharedParams.fromLat ?? "");
    const fromLng = Number.parseFloat(sharedParams.fromLng ?? "");
    const toLat = Number.parseFloat(sharedParams.toLat ?? "");
    const toLng = Number.parseFloat(sharedParams.toLng ?? "");

    if (
      !Number.isFinite(fromLat) ||
      !Number.isFinite(fromLng) ||
      !Number.isFinite(toLat) ||
      !Number.isFinite(toLng)
    ) {
      return;
    }

    const key = `${fromLat}:${fromLng}:${toLat}:${toLng}`;
    if (lastHandledSharedRouteRef.current === key) {
      return;
    }
    lastHandledSharedRouteRef.current = key;

    const fromPoint: LocationDTO = {
      lat: fromLat,
      lng: fromLng,
      label:
        typeof sharedParams.fromLabel === "string" && sharedParams.fromLabel.trim().length > 0
          ? sharedParams.fromLabel
          : t("route.share.start"),
    };
    const toPoint: LocationDTO = {
      lat: toLat,
      lng: toLng,
      label:
        typeof sharedParams.toLabel === "string" && sharedParams.toLabel.trim().length > 0
          ? sharedParams.toLabel
          : t("route.share.destination"),
    };

    setCurrentLocation(fromPoint);
    setDestination(toPoint);
    setOriginSearchText(fromPoint.label ?? t("map.startFallback"));
    setDestinationSearchText(toPoint.label ?? t("map.destinationFallback"));
    setSelectionPhase("ready");
    setMapSelectionMode("destination");

    mapRef.current?.fitToCoordinates(
      [
        { latitude: fromPoint.lat, longitude: fromPoint.lng },
        { latitude: toPoint.lat, longitude: toPoint.lng },
      ],
      {
        edgePadding: { top: 110, right: 40, bottom: 260, left: 40 },
        animated: true,
      },
    );

    void requestRoute(fromPoint, toPoint);
  }, [
    sharedParams.fromLat,
    sharedParams.fromLng,
    sharedParams.toLat,
    sharedParams.toLng,
    sharedParams.fromLabel,
    sharedParams.toLabel,
    t,
  ]);

  useEffect(() => {
    const data = routingPreferencesQuery.data;
    if (!data) {
      return;
    }

    setActiveFilter(nearestRouteFilter(data.preferences));
  }, [routingPreferencesQuery.data]);

  const polylines = useMemo(() => {
    if (!selectedRoute) {
      return [];
    }

    return selectedRoute.segments.map((segment, idx) => ({
      id: `${segment.mode}-${segment.routeId ?? "walk"}-${idx}`,
      mode: segment.mode,
      label:
        segment.mode === "bus"
          ? segment.routeName ?? `${t("steps.routeFallback")} ${idx + 1}`
          : t("steps.walk"),
      color:
        segment.mode === "walk"
          ? TransitTheme.route.walking
          : getSegmentColor(segment.routeName ?? t("steps.routeFallback"), idx),
      width: segment.mode === "walk" ? 3 : 6,
      casingColor: segment.mode === "walk" ? "rgba(15, 23, 42, 0.6)" : "#FFFFFF",
      casingWidth: segment.mode === "walk" ? 5 : 10,
      coordinates: toMapCoordinates(segment),
    }));
  }, [selectedRoute]);

  const segmentModeBadges = useMemo(() => {
    if (!selectedRoute) {
      return [] as {
        id: string;
        latitude: number;
        longitude: number;
        iconName: React.ComponentProps<typeof Ionicons>["name"];
        backgroundColor: string;
        label?: string;
      }[];
    }

    return selectedRoute.segments.map((segment, index) => {
      const coordinates = toMapCoordinates(segment);
      const midpoint =
        coordinates[Math.floor(coordinates.length / 2)] ?? {
          latitude: segment.from.lat,
          longitude: segment.from.lng,
        };

      const iconName: React.ComponentProps<typeof Ionicons>["name"] =
        segment.mode === "walk"
          ? "walk-outline"
          : segment.mode === "bus"
            ? "bus-outline"
            : segment.mode === "rail"
              ? "train-outline"
              : segment.mode === "car"
                ? "car-outline"
                : "navigate-outline";

      const backgroundColor =
        segment.mode === "walk"
          ? TransitTheme.panel.chipWalkBg
          : segment.mode === "bus"
            ? getSegmentColor(segment.routeName ?? t("steps.routeFallback"), index)
            : "#475569";

      return {
        id: `segment-badge-${segment.mode}-${segment.routeId ?? "step"}-${index}`,
        latitude: midpoint.latitude,
        longitude: midpoint.longitude,
        iconName,
        backgroundColor,
        label: segment.mode === "bus" ? (segment.routeName ?? `${t("steps.routeFallback")} ${index + 1}`) : undefined,
      };
    });
  }, [selectedRoute, t]);

  const segmentNodes = useMemo(() => {
    if (!selectedRoute) {
      return [] as {
        id: string;
        latitude: number;
        longitude: number;
        variant: "walk" | "segment";
        color: string;
        borderColor: string;
      }[];
    }

    const nodes: {
      id: string;
      latitude: number;
      longitude: number;
      variant: "walk" | "segment";
      color: string;
      borderColor: string;
    }[] = [];
    const seen = new Set<string>();

    const pushNode = (
      latitude: number,
      longitude: number,
      variant: "walk" | "segment",
      color: string,
      borderColor: string,
    ) => {
      const id = `${pointId(latitude, longitude)}-${variant}`;
      if (seen.has(id)) {
        return;
      }
      seen.add(id);
      nodes.push({ id, latitude, longitude, variant, color, borderColor });
    };

    selectedRoute.segments.forEach((segment, index) => {
      const coordinates = toMapCoordinates(segment);
      if (coordinates.length === 0) {
        return;
      }

      const segmentColor =
        segment.mode === "walk"
          ? TransitTheme.route.walking
          : getSegmentColor(segment.routeName ?? t("steps.routeFallback"), index);

      if (segment.mode === "walk") {
        const step = Math.max(1, Math.floor(coordinates.length / 7));
        coordinates.forEach((coord, coordIndex) => {
          if (coordIndex % step === 0 || coordIndex === coordinates.length - 1) {
            pushNode(
              coord.latitude,
              coord.longitude,
              "walk",
              segmentColor,
              "rgba(15, 23, 42, 0.35)",
            );
          }
        });
        return;
      }

      const first = coordinates[0];
      const last = coordinates[coordinates.length - 1];
      if (first) {
        pushNode(
          first.latitude,
          first.longitude,
          "segment",
          segmentColor,
          TransitTheme.route.nodeBorder,
        );
      }
      if (last) {
        pushNode(
          last.latitude,
          last.longitude,
          "segment",
          segmentColor,
          TransitTheme.route.nodeBorder,
        );
      }
    });

    return nodes;
  }, [selectedRoute, t]);

  const shareRoute = async () => {
    if (!selectedRoute) {
      return;
    }

    const originLabel = selectedRoute.from.label ?? t("route.share.start");
    const destinationLabel = selectedRoute.to.label ?? t("route.share.destination");
    const googleMapsLink = `https://www.google.com/maps/dir/?api=1&origin=${selectedRoute.from.lat},${selectedRoute.from.lng}&destination=${selectedRoute.to.lat},${selectedRoute.to.lng}&travelmode=transit`;
    const universalLink = `${UNIVERSAL_LINK_BASE}?fromLat=${selectedRoute.from.lat}&fromLng=${selectedRoute.from.lng}&fromLabel=${encodeURIComponent(originLabel)}&toLat=${selectedRoute.to.lat}&toLng=${selectedRoute.to.lng}&toLabel=${encodeURIComponent(destinationLabel)}&googleMaps=${encodeURIComponent(googleMapsLink)}`;

    const lines = selectedRoute.segments.map((segment, index) => {
      const modeLabel = segment.mode === "walk" ? t("steps.walk") : `${t("steps.takeBus")} ${segment.routeName ?? `${t("steps.routeFallback")} ${index + 1}`}`;
      const minutes = Math.max(1, Math.round(segment.timeSeconds / 60));
      return `${index + 1}. ${modeLabel} - ${minutes} ${t("route.min")}`;
    });

    const summary = [
      `${t("route.share.title")}`,
      `${originLabel} -> ${destinationLabel}`,
      `${Math.max(1, Math.round(selectedRoute.etaSeconds / 60))} ${t("route.min")} - ${formatTransferText(selectedRoute.transferCount)} - ${Math.round(selectedRoute.walkingDistanceM)}m ${t("route.walk")}`,
      "",
      `${t("route.share.universalLinkLabel")}: ${universalLink}`,
      "",
      ...lines,
    ].join("\n");

    try {
      await Share.share({
        title: t("route.share.title"),
        message: summary,
        url: universalLink,
      });
    } catch {
      Alert.alert(t("route.share.failedTitle"), t("route.share.failedBody"));
    }
  };

  useEffect(() => {
    if (!mapSegmentHint) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setMapSegmentHint(null);
    }, 2200);

    return () => clearTimeout(timeoutId);
  }, [mapSegmentHint]);

  const routePoints = useMemo(() => {
    if (!selectedRoute) {
      return [] as {
        id: string;
        label: string;
        latitude: number;
        longitude: number;
        color: string;
      }[];
    }

    const points: {
      id: string;
      label: string;
      latitude: number;
      longitude: number;
      color: string;
    }[] = [];

    const pushUniquePoint = (lat: number, lng: number, label: string) => {
      const id = pointId(lat, lng);
      if (!points.some((point) => point.id === id)) {
        points.push({
          id,
          label,
          latitude: lat,
          longitude: lng,
          color: POINT_COLORS[points.length % POINT_COLORS.length],
        });
      }
    };

    pushUniquePoint(
      selectedRoute.from.lat,
      selectedRoute.from.lng,
      pointName(0),
    );

    selectedRoute.segments.forEach((segment, index) => {
      pushUniquePoint(segment.to.lat, segment.to.lng, pointName(index + 1));
    });

    return points;
  }, [selectedRoute]);

  const focusRouteSegment = (segment: RouteSegment, segmentIndex: number) => {
    hapticLight();
    const coordinates = toMapCoordinates(segment);
    if (coordinates.length > 0) {
      mapRef.current?.fitToCoordinates(coordinates, {
        edgePadding: { top: 110, right: 40, bottom: 260, left: 40 },
        animated: true,
      });
    }

    setIsSheetCollapsed(true);
    setFocusedStepIndex(segmentIndex);
  };

  const toggleMapType = () => {
    hapticSelection();
    setMapType((currentType) =>
      currentType === "standard" ? "satellite" : "standard",
    );
  };

  const recenterToCurrentLocation = async () => {
    hapticSelection();

    if (!currentLocation) {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          Alert.alert(
            t("home.error.locationPermission"),
            t("home.error.locationPermission"),
          );
          return;
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const point: LocationDTO = {
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          label: t("map.startFallback"),
        };

        setCurrentLocation(point);
        mapRef.current?.animateToRegion(
          {
            latitude: point.lat,
            longitude: point.lng,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          },
          350,
        );
        return;
      } catch {
        Alert.alert(
          t("home.error.locationPermission"),
          t("home.error.locationPermission"),
        );
        return;
      }
    }

    mapRef.current?.animateToRegion(
      {
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      350,
    );
  };

  const fitSelectedRouteToMap = () => {
    hapticLight();

    if (selectedRoute) {
      applyRouteToMap(selectedRoute);
      return;
    }

    if (currentLocation && destination) {
      mapRef.current?.fitToCoordinates(
        [
          { latitude: currentLocation.lat, longitude: currentLocation.lng },
          { latitude: destination.lat, longitude: destination.lng },
        ],
        {
          edgePadding: { top: 80, right: 40, bottom: 180, left: 40 },
          animated: true,
        },
      );
    }
  };

  const sheetSwipeResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > 8 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > 22 && !isSheetCollapsed) {
            hapticMedium();
            setIsSheetCollapsed(true);
            Keyboard.dismiss();
            return;
          }

          if (gestureState.dy < -22 && isSheetCollapsed) {
            hapticMedium();
            setIsSheetCollapsed(false);
          }
        },
      }),
    [isSheetCollapsed],
  );

  const requestRouteForPoints = async (
    from: LocationDTO,
    to: LocationDTO,
  ): Promise<NavigationRouteResult> => {
    let savedPrefs = routingPreferencesQuery.data;

    try {
      const latestPreferenceSnapshot = await routingPreferencesQuery.refetch();
      savedPrefs = latestPreferenceSnapshot.data ?? savedPrefs;
    } catch {
      // Keep routing available even if preferences refresh fails.
    }

    const payload: NavigationRouteRequestBody = {
      from,
      to,
      ...(savedPrefs
        ? {
            preferences: savedPrefs.preferences,
            options: savedPrefs.options,
          }
        : {}),
    };

    if (__DEV__) {
      console.log("[Route] request payload", payload);
    }

    const response = await api.post<NavigationRouteResult>(
      "/api/busses/navigation/route",
      payload,
    );

    if (__DEV__) {
      console.log("[Route] response summary", {
        walkingDistanceM: response.data.walkingDistanceM,
        transferCount: response.data.transferCount,
        usedConfig: response.data.usedConfig,
      });
    }

    return response.data;
  };

  const applyRouteToMap = (result: NavigationRouteResult) => {
    const coords = result.segments.flatMap((segment) => [
      { latitude: segment.from.lat, longitude: segment.from.lng },
      { latitude: segment.to.lat, longitude: segment.to.lng },
    ]);

    if (coords.length >= 2) {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 40, bottom: 220, left: 40 },
        animated: true,
      });
    }
  };

  const requestRoute = async (
    from = currentLocation,
    to = destination,
  ) => {
    if (!from || !to) {
      Alert.alert(
        t("home.error.missingPointsTitle"),
        t("home.error.missingPointsBody"),
      );
      return;
    }

    setIsRouting(true);
    hapticMedium();
    setError(null);
    setSelectedAlternativeIndex(0);
    setExpandedRouteIndex(null);
    setFocusedStepIndex(null);

    try {
      const result = await requestRouteForPoints(from, to);
      setRouteResult(result);
      setExpandedRouteIndex(null);
      setFocusedStepIndex(null);
      applyRouteToMap(result);
      setIsSheetCollapsed(false);
      hapticSuccess();
    } catch (err) {
      const message = extractApiErrorMessage(err);
      setError(message);
      setRouteResult(null);
      Alert.alert(t("home.error.routeFailedTitle"), message);
    } finally {
      setIsRouting(false);
    }
  };

  const applyRouteFilter = async (value: RouteFilterValue) => {
    const previousFilter = activeFilter;
    setActiveFilter(value);

    try {
      await setRoutingPreferencesMutation.mutateAsync({
        preferences: ROUTE_FILTER_WEIGHTS[value],
      });

      await routingPreferencesQuery.refetch();

      // Recompute immediately so selected filter changes route results without extra taps.
      if (currentLocation && destination) {
        await requestRoute(currentLocation, destination);
      }
    } catch (err) {
      setActiveFilter(previousFilter);
      const message = extractApiErrorMessage(err);
      setError(message);
      Alert.alert(t("home.filterUpdateFailedTitle"), message);
    }
  };

  const clearRoute = () => {
    hapticSelection();
    setRouteResult(null);
    setCurrentLocation(null);
    setDestination(null);
    setSelectionPhase("destination");
    setIsSheetCollapsed(true);
    setOriginMenuOpen(false);
    setMapSelectionMode("destination");
    setDestinationSearchText("");
    setError(null);
    setSelectedAlternativeIndex(0);
    setExpandedRouteIndex(null);
    setFocusedStepIndex(null);
  };

  const openOriginSelectionPanel = () => {
    setOriginSearchText(currentLocation?.label ?? t("map.startFallback"));
    setOriginMenuOpen(true);
    originPanelAnim.setValue(0);
    Animated.spring(originPanelAnim, {
      toValue: 1,
      damping: 18,
      stiffness: 180,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  };

  const promptOriginSelectionAfterDestination = () => {
    setSelectionPhase("origin_menu");
    openOriginSelectionPanel();
  };

  const closeOriginSelectionPanel = () => {
    Animated.timing(originPanelAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setOriginMenuOpen(false);
      }
    });
  };

  const openOriginSelectionMenu = () => {
    hapticSelection();
    promptOriginSelectionAfterDestination();
  };

  const beginOriginMapSelection = () => {
    hapticLight();
    closeOriginSelectionPanel();
    setSelectionPhase("origin_map");
    setMapSelectionMode("start");
    setIsSheetCollapsed(true);
    setOriginMenuOpen(false);
  };

  const confirmOriginFromMapCenter = () => {
    if (!mapCenterPoint) {
      return;
    }
    const point: LocationDTO = {
      lat: mapCenterPoint.lat,
      lng: mapCenterPoint.lng,
      label: `Start (${mapCenterPoint.lat.toFixed(4)}, ${mapCenterPoint.lng.toFixed(4)})`,
    };
    setCurrentLocation(point);
    hapticSelection();
    setOriginSearchText(point.label ?? t("map.startFallback"));
    setSelectionPhase("ready");
    setMapSelectionMode("destination");
    setIsSheetCollapsed(false);
    setRouteResult(null);
    setExpandedRouteIndex(null);
    setFocusedStepIndex(null);
  };

  const useCurrentLocationAsOrigin = () => {
    if (!currentLocation) {
      return;
    }

    closeOriginSelectionPanel();
    hapticSelection();
    setSelectionPhase("ready");
    setIsSheetCollapsed(false);
    setRouteResult(null);
    setExpandedRouteIndex(null);
    setFocusedStepIndex(null);
  };

  const saveCurrentLocationToFavorites = () => {
    if (!currentLocation) {
      return;
    }

    const favorite: FavoriteOrigin = {
      id: pointId(currentLocation.lat, currentLocation.lng),
      label: currentLocation.label ?? `${t("planner.start")} ${favoriteOrigins.length + 1}`,
      lat: currentLocation.lat,
      lng: currentLocation.lng,
      updatedAt: Date.now(),
    };

    setFavoriteOrigins((prev) => [
      favorite,
      ...prev.filter((item) => item.id !== favorite.id),
    ].slice(0, 8));
    hapticSuccess();
  };

  const useFavoriteAsOrigin = (favorite: FavoriteOrigin) => {
    const point: LocationDTO = {
      lat: favorite.lat,
      lng: favorite.lng,
      label: favorite.label,
    };
    setCurrentLocation(point);
    setOriginSearchText(point.label ?? t("map.startFallback"));
    setSelectionPhase("ready");
    setMapSelectionMode("destination");
    setRouteResult(null);
    setExpandedRouteIndex(null);
    setFocusedStepIndex(null);
    closeOriginSelectionPanel();
    hapticSelection();
  };

  const searchPlace = async (query: string) => {
    const searchText = query.trim();
    if (!searchText) {
      return;
    }

    setIsSearchingPlace(true);
    try {
      const matches = await Location.geocodeAsync(searchText);
      if (matches.length === 0) {
        Alert.alert(
          t("home.error.searchNoPlaceTitle"),
          t("home.error.searchNoPlaceBody"),
        );
        return;
      }

      const first = matches[0];
      const point: LocationDTO = {
        lat: first.latitude,
        lng: first.longitude,
        label: searchText,
      };

      setDestination(point);
      setDestinationSearchText(searchText);
      setRouteResult(null);
      setMapSelectionMode("destination");
      hapticMedium();
      promptOriginSelectionAfterDestination();

      mapRef.current?.animateToRegion(
        {
          latitude: point.lat,
          longitude: point.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        350,
      );
    } catch {
      Alert.alert(
        t("home.error.searchFailedTitle"),
        t("home.error.searchFailedBody"),
      );
    } finally {
      setIsSearchingPlace(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, isRTL && styles.safeAreaRtl]}>
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          initialRegion={INITIAL_REGION}
          mapType={mapType}
          showsUserLocation
          mapPadding={{ top: topMapControlInset, right: 0, bottom: 0, left: 0 }}
          onRegionChangeComplete={(region) => {
            setMapCenterPoint({
              lat: region.latitude,
              lng: region.longitude,
              label: `Pinned (${region.latitude.toFixed(4)}, ${region.longitude.toFixed(4)})`,
            });
          }}
          onPress={(event) => {
            Keyboard.dismiss();
            if (isCrosshairMode) {
              return;
            }
            const { latitude, longitude } = event.nativeEvent.coordinate;
            if (mapSelectionMode === "start") {
              setCurrentLocation({
                lat: latitude,
                lng: longitude,
                label: `Start (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
              });
            } else {
              setDestination({
                lat: latitude,
                lng: longitude,
                label: `${t("map.destinationPin")} (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
              });
              setDestinationSearchText(
                `${t("map.destinationPin")} (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
              );
              hapticMedium();
              promptOriginSelectionAfterDestination();
            }
            setRouteResult(null);
          }}
        >
          {currentLocation && !routeResult ? (
            <Marker
              coordinate={{
                latitude: currentLocation.lat,
                longitude: currentLocation.lng,
              }}
              title={t("planner.start")}
              description={currentLocation.label}
              pinColor="#22C55E"
            />
          ) : null}

          {destination && !routeResult ? (
            <Marker
              coordinate={{
                latitude: destination.lat,
                longitude: destination.lng,
              }}
              title={t("planner.destination")}
              description={destination.label}
            />
          ) : null}

          {routePoints.map((point, index) => (
            <Marker
              key={point.id}
              coordinate={{
                latitude: point.latitude,
                longitude: point.longitude,
              }}
              title={point.label}
              description={index === 0 ? t("route.share.start") : t("routePoint")}
              pinColor={point.color}
            />
          ))}

          {polylines.map((line) => (
            <Polyline
              key={`${line.id}-casing`}
              coordinates={line.coordinates}
              strokeColor={line.casingColor}
              strokeWidth={line.casingWidth}
              lineDashPattern={line.mode === "walk" ? [1, 9] : undefined}
            />
          ))}

          {polylines.map((line) => (
            <Polyline
              key={`${line.id}-hit`}
              coordinates={line.coordinates}
              strokeColor="rgba(0, 0, 0, 0)"
              strokeWidth={line.mode === "walk" ? 42 : 58}
              lineDashPattern={line.mode === "walk" ? [1, 9] : undefined}
              onPress={() => {
                if (line.mode === "bus") {
                  hapticSelection();
                }
                setMapSegmentHint({
                  label: line.label,
                  color: line.color,
                });
              }}
            />
          ))}

          {polylines.map((line) => (
            <Polyline
              key={line.id}
              coordinates={line.coordinates}
              strokeColor={line.color}
              strokeWidth={line.width}
              lineDashPattern={line.mode === "walk" ? [1, 9] : undefined}
              onPress={() => {
                if (line.mode === "bus") {
                  hapticSelection();
                }
                setMapSegmentHint({
                  label: line.label,
                  color: line.color,
                });
              }}
            />
          ))}

          {segmentNodes.map((node) => (
            <Marker
              key={node.id}
              coordinate={{
                latitude: node.latitude,
                longitude: node.longitude,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View
                style={[
                  styles.segmentNodeDot,
                  node.variant === "walk" && styles.segmentNodeDotWalk,
                  {
                    backgroundColor: node.color,
                    borderColor: node.borderColor,
                  },
                ]}
              />
            </Marker>
          ))}

          {segmentModeBadges.map((badge) => (
            <Marker
              key={badge.id}
              coordinate={{
                latitude: badge.latitude,
                longitude: badge.longitude,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              onPress={() => {
                if (badge.label) {
                  hapticSelection();
                  setMapSegmentHint({
                    label: badge.label,
                    color: badge.backgroundColor,
                  });
                }
              }}
            >
              <View
                style={[
                  styles.mapSegmentModeBadge,
                  { backgroundColor: badge.backgroundColor },
                ]}
              >
                <Ionicons name={badge.iconName} size={12} color="#FFFFFF" />
              </View>
            </Marker>
          ))}
        </MapView>

        {mapSegmentHint ? (
          <View style={[styles.mapSegmentHintBanner, { backgroundColor: mapSegmentHint.color }]} pointerEvents="none">
            <ThemedText style={styles.mapSegmentHintText} numberOfLines={1}>
              {mapSegmentHint.label}
            </ThemedText>
          </View>
        ) : null}

      

        <MapSearchControl
          topInset={topOverlayInset}
          searchQuery={destinationSearchText}
          onSearchQueryChange={setDestinationSearchText}
          onSearchSubmit={() => searchPlace(destinationSearchText)}
          onOpenOriginMenu={openOriginSelectionMenu}
          onPanelAnchorLayout={setOriginPanelAnchor}
          onFocusDestinationOnMap={() => {
            setMapSelectionMode("destination");
          }}
          onUseMapPin={() => {
            Keyboard.dismiss();
            setMapSelectionMode("destination");
            setRouteResult(null);
            setExpandedRouteIndex(null);
            setFocusedStepIndex(null);
          }}
          onSwapLocations={() => {
            if (!currentLocation || !destination) {
              return;
            }

            hapticSelection();
            const previousCurrent = currentLocation;
            const previousDestination = destination;
            setCurrentLocation(previousDestination);
            setDestination(previousCurrent);
            setDestinationSearchText(previousCurrent.label ?? "");
            setRouteResult(null);
            setExpandedRouteIndex(null);
            setFocusedStepIndex(null);
            setSelectionPhase("ready");
            setMapSelectionMode("destination");
          }}
          startLabel={currentLocation?.label}
          destinationLabel={destination?.label}
        />
        {isRouting ? (
          <View style={styles.mapLoadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color={Kinetic.primary} />
          </View>
        ) : null}
        <View style={styles.mapFabStack}>
          <TouchableOpacity
            style={styles.mapFabButton}
            activeOpacity={0.85}
            onPress={toggleMapType}
          >
            <Ionicons name="layers-outline" size={18} color={Colors.dark.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mapFabButton, styles.mapFabButtonActive]}
            activeOpacity={0.85}
            onPress={recenterToCurrentLocation}
          >
            <Ionicons name="locate" size={18} color={Colors.dark.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mapFabButtonAccent}
            activeOpacity={0.85}
            onPress={fitSelectedRouteToMap}
          >
            <Ionicons name="navigate" size={17} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {isCrosshairMode ? (
          <>
            <View style={styles.crosshairHeaderCard}>
              <View style={styles.crosshairHeaderTextWrap}>
                <ThemedText style={styles.crosshairHeaderTitle}>Choose start location</ThemedText>
                <ThemedText style={styles.crosshairHeaderTitle}>{t("home.crosshair.title")}</ThemedText>
                <ThemedText style={styles.crosshairHeaderSubtitle}>{t("home.crosshair.subtitle")}</ThemedText>
              </View>
              <TouchableOpacity
                style={styles.crosshairCloseButton}
                onPress={() => {
                  hapticSelection();
                  promptOriginSelectionAfterDestination();
                }}
              >
                <Ionicons name="close" size={16} color={Colors.dark.text} />
              </TouchableOpacity>
            </View>

            <View pointerEvents="none" style={styles.fixedCrosshairWrap}>
              <Ionicons name="location" size={42} color="#EF4444" style={styles.fixedPinIcon} />
              <Ionicons name="close" size={14} color={Colors.dark.text} />
            </View>

            <View style={styles.crosshairFooter}>
              <TouchableOpacity style={styles.crosshairSetButton} onPress={confirmOriginFromMapCenter}>
                <ThemedText style={styles.crosshairSetButtonText}>{t("home.crosshair.set")}</ThemedText>
              </TouchableOpacity>
            </View>
          </>
        ) : null}

        {originMenuOpen ? (
          <Animated.View
            style={[
              styles.originPanelBackdrop,
              {
                opacity: originPanelAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
              },
            ]}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={closeOriginSelectionPanel}
            />

            <Animated.View
              style={[
                styles.originPanel,
                originPanelAnchor
                  ? {
                      top: originPanelAnchor.y + originPanelAnchor.height + 8,
                      left: 12,
                      right: 12,
                    }
                  : { top: topOverlayInset + 96, left: 12, right: 12 },
                {
                  opacity: originPanelAnim,
                  transform: [
                    {
                      translateY: originPanelAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-18, 0],
                      }),
                    },
                    {
                      scale: originPanelAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.92, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.originPanelBridge} />

              <View style={styles.originPanelSearchStack}>
                <View style={styles.originPanelSearchRow}>
                  <Ionicons name="ellipse-outline" size={14} color="#60A5FA" />
                  <ThemedText numberOfLines={1} style={styles.originPanelSearchText}>
                    {currentLocation?.label ?? t("map.startFallback")}
                  </ThemedText>
                </View>
                <View style={styles.originPanelSearchDivider} />
                <View style={styles.originPanelSearchRow}>
                  <Ionicons name="location-outline" size={15} color="#EF4444" />
                  <ThemedText numberOfLines={1} style={styles.originPanelSearchText}>
                    {destination?.label ?? (destinationSearchText || t("map.destinationFallback"))}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.originPanelHeader}>
                <View style={styles.originPanelTitleWrap}>
                  <ThemedText style={styles.originPanelTitle}>{t("home.origin.header")}</ThemedText>
                  <ThemedText style={styles.originPanelSubtitle}>{originSearchText}</ThemedText>
                </View>
                <TouchableOpacity style={styles.originPanelClose} onPress={closeOriginSelectionPanel}>
                  <Ionicons name="close" size={18} color={Kinetic.onSurface} />
                </TouchableOpacity>
              </View>

              <View style={styles.originActionsRow}>
                <TouchableOpacity style={styles.originActionButton} onPress={beginOriginMapSelection}>
                  <Ionicons name="map-outline" size={14} color="#60A5FA" />
                  <ThemedText style={styles.originActionText}>{t("home.origin.chooseFromMap")}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.originActionButton, !currentLocation && styles.originActionButtonDisabled]}
                  onPress={useCurrentLocationAsOrigin}
                  disabled={!currentLocation}
                >
                  <Ionicons name="locate-outline" size={14} color="#60A5FA" />
                  <ThemedText style={styles.originActionText}>{t("home.origin.useCurrent")}</ThemedText>
                </TouchableOpacity>
              </View>

              <View style={styles.originFavoritesSection}>
                <ThemedText style={styles.originFavoritesTitle}>{t("home.origin.favorites")}</ThemedText>
                {favoriteOrigins.length === 0 ? (
                  <TouchableOpacity
                    style={styles.originFavoriteEmpty}
                    onPress={saveCurrentLocationToFavorites}
                    disabled={!currentLocation}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="heart-outline" size={14} color={TransitTheme.panel.caption} />
                    <ThemedText style={styles.originFavoriteEmptyText}>
                      {t("home.origin.saveCurrentFavorite")}
                    </ThemedText>
                  </TouchableOpacity>
                ) : (
                  favoriteOrigins.map((favorite) => (
                    <TouchableOpacity
                      key={favorite.id}
                      style={styles.originFavoriteRow}
                      onPress={() => useFavoriteAsOrigin(favorite)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="heart" size={14} color={Colors.dark.primary} />
                      <View style={styles.originFavoriteCopy}>
                        <ThemedText style={styles.originFavoriteLabel}>{favorite.label}</ThemedText>
                        <ThemedText style={styles.originFavoriteMeta}>{favorite.lat.toFixed(4)}, {favorite.lng.toFixed(4)}</ThemedText>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </Animated.View>
          </Animated.View>
        ) : null}

        <KeyboardAvoidingView
          style={styles.keyboardAvoiding}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={
            Platform.OS === "ios" ? insets.bottom + 12 : 20
          }
          pointerEvents="box-none"
        >
          {!isCrosshairMode ? (
          <View
            style={[
              styles.sheet,
              { bottom: sheetBottomOffset },
              isSheetCollapsed && styles.sheetCollapsed,
            ]}
          >
            <View style={styles.sheetDragHandleWrap} {...sheetSwipeResponder.panHandlers}>
              <View style={styles.sheetDragHandle} />
            </View>
            <ScrollView
              ref={sheetScrollRef}
              style={styles.sheetScroll}
              contentContainerStyle={[
                styles.sheetContent,
                { paddingBottom: Math.max(insets.bottom, 14) + 20 },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              scrollEnabled={!isSheetCollapsed}
            >
              <RoutePlannerControls
                isCollapsed={isSheetCollapsed}
                onToggleCollapsed={() => setIsSheetCollapsed((prev) => !prev)}
                onOpenPreferences={() => setIsPreferencesModalOpen(true)}
                activeFilter={activeFilter}
                onChangeFilter={(value) => {
                  void applyRouteFilter(value);
                }}
                isUpdatingFilter={setRoutingPreferencesMutation.isPending}
                onRequestRoute={() => void requestRoute()}
                isRouting={isRouting}
                onClearRoute={clearRoute}
                errorMessage={error}
                showActionButtons={!routeResult}
              >
                {!routeResult ? (
                  <HintBanner
                    title={t("home.startHereTitle")}
                    message={t("home.startHereBody")}
                    compact
                  />
                ) : (
                  <View style={styles.resultsPanel}>
                    <View style={styles.resultsTopRow}>
                      <View>
                        <ThemedText style={styles.resultsPanelTitle}>{t("home.results.publicTransport")}</ThemedText>
                        <ThemedText style={styles.resultsPanelSubtitle}>
                          {t("home.results.tapToExpand")}
                        </ThemedText>
                      </View>
                      <View style={styles.resultsActionsCompactRow}>
                        <TouchableOpacity
                          style={styles.resultsClearCompactButton}
                          onPress={() => {
                            hapticSelection();
                            void shareRoute();
                          }}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="share-social-outline" size={15} color={TransitTheme.panel.title} />
                          <ThemedText style={styles.resultsClearCompactText}>{t("route.share.action")}</ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.resultsClearCompactButton}
                          onPress={() => {
                            hapticSelection();
                            clearRoute();
                          }}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="close-outline" size={15} color={TransitTheme.panel.title} />
                          <ThemedText style={styles.resultsClearCompactText}>{t("planner.clear")}</ThemedText>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {expandedRoute ? (
                      <View style={styles.expandedRoutePanel}>
                        <TouchableOpacity
                          style={styles.expandedRouteHeader}
                          onPress={() => {
                            hapticMedium();
                            setExpandedRouteIndex(null);
                            setFocusedStepIndex(null);
                          }}
                          activeOpacity={0.85}
                        >
                          <View>
                            <ThemedText style={styles.resultsPanelTitle}>{t("home.results.routeDetails")}</ThemedText>
                            <ThemedText style={styles.resultsPanelSubtitle}>
                              {Math.max(1, Math.round(expandedRoute.etaSeconds / 60))} {t("route.min")} • {formatTransferText(expandedRoute.transferCount)}
                            </ThemedText>
                          </View>
                          <Feather name="chevron-down" size={18} color={Colors.dark.text} />
                        </TouchableOpacity>

                        <View style={styles.expandedMetricRow}>
                          <View style={styles.expandedMetricPill}>
                            <ThemedText style={styles.expandedMetricValue}>{Math.max(1, Math.round(expandedRoute.etaSeconds / 60))} min</ThemedText>
                            <ThemedText style={styles.expandedMetricLabel}>{t("route.eta")}</ThemedText>
                          </View>
                          <View style={styles.expandedMetricPill}>
                            <ThemedText style={styles.expandedMetricValue}>{expandedRoute.transferCount}</ThemedText>
                            <ThemedText style={styles.expandedMetricLabel}>{t("route.transfers")}</ThemedText>
                          </View>
                          <View style={styles.expandedMetricPill}>
                            <ThemedText style={styles.expandedMetricValue}>{Math.round(expandedRoute.walkingDistanceM)} m</ThemedText>
                            <ThemedText style={styles.expandedMetricLabel}>{t("route.walk")}</ThemedText>
                          </View>
                        </View>

                        <View style={styles.resultsListBlock}>
                          <RouteStepsList
                            routeResult={expandedRoute}
                            activeStepIndex={focusedStepIndex}
                            onStepPress={(segment, segmentIndex) =>
                              focusRouteSegment(segment, segmentIndex)
                            }
                          />
                        </View>
                      </View>
                    ) : (
                      <View style={styles.resultsListBlock}>
                        {routeChoices.map((choice, index) => {
                          const active = index === selectedAlternativeIndex;
                          const walkCount = choice.segments.filter((segment) => segment.mode === "walk").length;
                          const busNames = choice.segments
                            .filter((segment) => segment.mode === "bus" && segment.routeName)
                            .map((segment) => segment.routeName as string);

                          return (
                            <TouchableOpacity
                              key={`${choice.routeLabel ?? "choice"}-${index}`}
                              style={[styles.routeCard, active && styles.routeCardActive]}
                              onPress={() => {
                                hapticSelection();
                                setSelectedAlternativeIndex(index);
                                setExpandedRouteIndex(index);
                                setFocusedStepIndex(null);
                              }}
                              activeOpacity={0.85}
                            >
                              <View style={styles.routeCardTopRow}>
                                <View style={styles.routePathRow}>
                                  <View style={styles.modeChipWalk}>
                                    <Ionicons name="walk-outline" size={12} color="#FFFFFF" />
                                    <ThemedText style={styles.modeChipText}>{walkCount}</ThemedText>
                                  </View>
                                  {busNames.map((name, busIndex) => (
                                    <React.Fragment key={`${choice.routeLabel ?? "choice"}-${name}-${busIndex}`}>
                                      <Ionicons name="chevron-forward" size={12} color={Colors.dark.icon} />
                                      <View style={styles.modeChipBus}>
                                        <Ionicons name="bus-outline" size={12} color="#FFFFFF" />
                                        <ThemedText style={styles.modeChipText}>{name}</ThemedText>
                                      </View>
                                    </React.Fragment>
                                  ))}
                                </View>
                                <ThemedText style={styles.routeDurationText}>
                                  {Math.max(1, Math.round(choice.etaSeconds / 60))} {t("route.min")}
                                </ThemedText>
                              </View>

                              <ThemedText style={styles.routeWindowText}>
                                {formatTransferText(choice.transferCount)} • {Math.round(choice.walkingDistanceM)} m {t("route.walk")}
                              </ThemedText>
                              <ThemedText style={styles.routeSubtitleText}>
                                {choice.bestEffort ? t("home.results.liveFallback") : t("home.results.live")}
                              </ThemedText>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}
              </RoutePlannerControls>

            </ScrollView>
          </View>
          ) : null}
        </KeyboardAvoidingView>

        <RoutePreferencesModal
          visible={isPreferencesModalOpen}
          onClose={() => setIsPreferencesModalOpen(false)}
          onSaved={() => {
            void routingPreferencesQuery.refetch();
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  safeAreaRtl: {
    direction: "rtl",
  },
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  mapFabStack: {
    position: "absolute",
    right: 14,
    top: 152,
    gap: 10,
  },
  mapFabButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: TransitTheme.map.overlayBorder,
    backgroundColor: TransitTheme.map.fabBg,
    alignItems: "center",
    justifyContent: "center",
  },
  mapFabButtonActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: TransitTheme.map.fabActiveBg,
  },
  mapFabButtonAccent: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: TransitTheme.map.fabAccentBg,
    alignItems: "center",
    justifyContent: "center",
  },
  mapSegmentModeBadge: {
    minWidth: 84,
    minHeight: 28,
    borderRadius: 11,
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.65)",
    flexDirection: "row",
    gap: 4,
    maxWidth: 120,
  },
  mapSegmentHintBanner: {
    position: "absolute",
    left: 18,
    right: 18,
    top: 142,
    zIndex: 15,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  mapSegmentHintText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  mapLoadingOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  segmentNodeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: TransitTheme.route.node,
    borderWidth: 1,
    borderColor: TransitTheme.route.nodeBorder,
  },
  segmentNodeDotWalk: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderColor: "rgba(15, 23, 42, 0.35)",
  },
  crosshairHeaderCard: {
    position: "absolute",
    left: 18,
    right: 18,
    top: 126,
    height: 68,
    borderRadius: 16,
    backgroundColor: TransitTheme.map.overlayBg,
    borderWidth: 1,
    borderColor: TransitTheme.map.overlayBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  crosshairHeaderTextWrap: {
    gap: 2,
  },
  crosshairHeaderTitle: {
    color: TransitTheme.map.overlayText,
    fontSize: 15,
    fontWeight: "700",
  },
  crosshairHeaderSubtitle: {
    color: TransitTheme.map.overlaySubtext,
    fontSize: 12,
  },
  crosshairCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  fixedCrosshairWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "46%",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 7,
  },
  fixedPinIcon: {
    marginBottom: -8,
  },
  crosshairFooter: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 78,
    zIndex: 9,
  },
  originPanelBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 24,
    backgroundColor: "rgba(15, 23, 42, 0.08)",
  },
  originPanel: {
    position: "absolute",
    zIndex: 25,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.bg,
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  originPanelBridge: {
    position: "absolute",
    top: -8,
    left: 30,
    width: 18,
    height: 18,
    borderTopLeftRadius: 4,
    backgroundColor: TransitTheme.panel.bg,
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: TransitTheme.panel.border,
    transform: [{ rotate: "45deg" }],
  },
  originPanelSearchStack: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.cardBg,
    overflow: "hidden",
  },
  originPanelSearchRow: {
    minHeight: 36,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  originPanelSearchText: {
    flex: 1,
    color: TransitTheme.panel.title,
    fontSize: 13,
    fontWeight: "600",
  },
  originPanelSearchDivider: {
    borderTopWidth: 1,
    borderTopColor: TransitTheme.panel.border,
  },
  originPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  originPanelTitleWrap: {
    flex: 1,
    gap: 2,
  },
  originPanelTitle: {
    color: TransitTheme.panel.title,
    fontSize: 17,
    fontWeight: "800",
  },
  originPanelSubtitle: {
    color: TransitTheme.panel.caption,
    fontSize: 12,
  },
  originPanelClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: TransitTheme.panel.cardBg,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
  },
  crosshairSetButton: {
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  crosshairSetButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  originModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.14)",
    justifyContent: "flex-end",
  },
  originModalPanel: {
    minHeight: "76%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.bg,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 26,
    gap: 14,
  },
  originModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  originModalBackButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: TransitTheme.panel.iconButtonBg,
  },
  originInputWrap: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.cardBg,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  originInputText: {
    color: TransitTheme.panel.title,
    fontSize: 14,
    fontWeight: "600",
  },
  originActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  originActionButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.cardBg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
  },
  originActionButtonDisabled: {
    opacity: 0.45,
  },
  originActionText: {
    color: TransitTheme.panel.body,
    fontSize: 12,
    fontWeight: "600",
  },
  originFavoritesSection: {
    gap: 8,
  },
  originFavoritesTitle: {
    color: TransitTheme.panel.caption,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  originFavoriteEmpty: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.cardBg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  originFavoriteEmptyText: {
    color: TransitTheme.panel.caption,
    fontSize: 12,
    fontWeight: "600",
  },
  originFavoriteRow: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.cardBg,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  originFavoriteCopy: {
    flex: 1,
    gap: 2,
  },
  originFavoriteLabel: {
    color: TransitTheme.panel.title,
    fontSize: 13,
    fontWeight: "700",
  },
  originFavoriteMeta: {
    color: TransitTheme.panel.caption,
    fontSize: 11,
  },
  originRecentHeader: {
    color: TransitTheme.panel.caption,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  originRecentList: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.cardBg,
  },
  originRecentRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  originRecentRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: TransitTheme.panel.border,
  },
  originRecentIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: TransitTheme.panel.iconButtonBg,
    alignItems: "center",
    justifyContent: "center",
  },
  originRecentTextWrap: {
    flex: 1,
    gap: 2,
  },
  originRecentTitle: {
    color: TransitTheme.panel.title,
    fontSize: 14,
    fontWeight: "600",
  },
  originRecentSubtitle: {
    color: TransitTheme.panel.caption,
    fontSize: 12,
  },
  keyboardAvoiding: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 10,
    maxHeight: "62%",
    backgroundColor: TransitTheme.panel.bg,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  sheetDragHandleWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 44,
    marginTop: -4,
    marginBottom: -2,
  },
  sheetDragHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: TransitTheme.panel.border,
  },
  sheetExpanded: {
    maxHeight: "76%",
  },
  sheetCollapsed: {
    maxHeight: 122,
    minHeight: 94,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetContent: {
    gap: 8,
    paddingBottom: 8,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 16,
  },
  metaText: {
    color: Colors.dark.icon,
    fontSize: 12,
  },
  prefStatusText: {
    color: Colors.dark.primary,
    fontSize: 11,
    fontWeight: "600",
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.background,
  },
  modeButtonActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(45, 212, 191, 0.15)",
  },
  modeButtonText: {
    color: Colors.dark.icon,
    fontSize: 11,
    fontWeight: "600",
  },
  modeButtonTextActive: {
    color: Colors.dark.text,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  primaryButton: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonText: {
    color: Colors.dark.background,
    fontSize: 13,
    fontWeight: "700",
  },
  secondaryButton: {
    width: 88,
    height: 42,
    borderRadius: 10,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: "600",
  },
  errorText: {
    color: "#F87171",
    fontSize: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    backgroundColor: TransitTheme.panel.cardBgActive,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  summaryText: {
    color: TransitTheme.panel.body,
    fontSize: 12,
    fontWeight: "600",
  },
  resultsPanel: {
    gap: 10,
  },
  resultsTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  resultsActionsCompactRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  resultsClearCompactButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    borderRadius: 999,
    backgroundColor: TransitTheme.panel.cardBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  resultsClearCompactText: {
    color: TransitTheme.panel.title,
    fontSize: 12,
    fontWeight: "700",
  },
  resultsPanelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  resultsPanelTitle: {
    color: TransitTheme.panel.title,
    fontSize: 24,
    fontWeight: "700",
  },
  resultsPanelSubtitle: {
    color: TransitTheme.panel.caption,
    fontSize: 13,
    marginTop: 2,
  },
  resultsPanelActions: {
    flexDirection: "row",
    gap: 8,
  },
  resultsIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: TransitTheme.panel.iconButtonBg,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    alignItems: "center",
    justifyContent: "center",
  },
  routeSummaryTabs: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 2,
  },
  routeSummaryTab: {
    minWidth: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.cardBg,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  routeSummaryTabActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: TransitTheme.panel.cardBgActive,
  },
  routeSummaryTabText: {
    color: TransitTheme.panel.title,
    fontSize: 14,
    fontWeight: "700",
  },
  routeSummaryTabTextActive: {
    color: Colors.dark.primary,
  },
  routeSummaryTabMeta: {
    color: TransitTheme.panel.caption,
    fontSize: 11,
    marginTop: 2,
  },
  routeSummaryTabMetaActive: {
    color: TransitTheme.panel.body,
  },
  resultsListBlock: {
    gap: 12,
  },
  resultsListContent: {
    gap: 12,
    paddingBottom: 6,
  },
  expandedRoutePanel: {
    gap: 12,
  },
  expandedRouteHeader: {
    borderBottomWidth: 1,
    borderBottomColor: TransitTheme.panel.border,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  expandedMetricRow: {
    flexDirection: "row",
    gap: 8,
  },
  expandedMetricPill: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.cardBg,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  expandedMetricValue: {
    color: TransitTheme.panel.title,
    fontSize: 15,
    fontWeight: "700",
  },
  expandedMetricLabel: {
    color: TransitTheme.panel.caption,
    fontSize: 11,
    marginTop: 2,
  },
  routeCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.cardBg,
    padding: 12,
  },
  routeCardActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: TransitTheme.panel.cardBgActive,
  },
  routeCardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  routePathRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  modeChipWalk: {
    borderRadius: 999,
    backgroundColor: TransitTheme.panel.chipWalkBg,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  modeChipBus: {
    borderRadius: 999,
    backgroundColor: "#16A34A",
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  modeChipText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  routeDurationText: {
    color: TransitTheme.panel.title,
    fontSize: 24,
    fontWeight: "700",
  },
  routeWindowText: {
    color: TransitTheme.panel.body,
    fontSize: 13,
    marginTop: 8,
  },
  routeSubtitleText: {
    color: TransitTheme.panel.caption,
    fontSize: 12,
    marginTop: 3,
  },
  stepCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.cardBg,
    padding: 12,
  },
  stepCardActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: TransitTheme.panel.cardBgActive,
  },
  stepCardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  stepCardIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCardIconBus: {
    backgroundColor: "#16A34A",
  },
  stepCardIconWalk: {
    backgroundColor: TransitTheme.panel.chipWalkBg,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
  },
  stepCardBody: {
    flex: 1,
    gap: 2,
  },
  stepCardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  stepCardTitle: {
    color: TransitTheme.panel.title,
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  stepCardTime: {
    color: TransitTheme.panel.body,
    fontSize: 12,
    fontWeight: "700",
  },
  stepCardSubtitle: {
    color: TransitTheme.panel.caption,
    fontSize: 12,
  },
  stepsWrap: {
    flex: 1,
    marginTop: 4,
  },
  stepsContent: {
    paddingBottom: 10,
  },
  stepPointsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  pointBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pointBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  stepTitle: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: "700",
  },
  stepSubtitle: {
    color: Colors.dark.icon,
    fontSize: 12,
    marginTop: 4,
  },
  alternativesContainer: {
    marginTop: 8,
    marginBottom: 4,
  },
  alternativesLabel: {
    color: Colors.dark.icon,
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 6,
  },
  alternativesScroll: {
    marginHorizontal: -12,
    paddingHorizontal: 12,
  },
  alternativesContent: {
    gap: 6,
  },
  alternativeCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.background,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 104,
  },
  alternativeCardActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(45, 212, 191, 0.15)",
  },
  altCardLabel: {
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  altCardLabelActive: {
    color: Colors.dark.primary,
  },
  altCardMetric: {
    color: Colors.dark.icon,
    fontSize: 11,
    marginVertical: 2,
  },
  altCardMetricActive: {
    color: Colors.dark.text,
  },
});
