import React, { useEffect, useMemo, useRef, useState } from "react";
import { isAxiosError } from "axios";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import MapView, { Marker, Polyline } from "@/components/maps/MapViewCompat";
import type { Region } from "@/components/maps/MapViewCompat";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { LocationDTO } from "../../../types/location";
import type {
  NavigationRouteRequestBody,
  NavigationRouteResult,
  ParseNavigationTextResponse,
  RouteSegment,
} from "../../../types/navigation";
import { api } from "@/config/api";
import { Colors } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { MapSearchControl } from "@/components/MapSearchControl";
import { RouteFeedbackPanel } from "@/components/home/RouteFeedbackPanel";
import { RoutePlannerControls } from "@/components/home/RoutePlannerControls";
import { RouteStepsList } from "@/components/home/RouteStepsList";
import {
  useParseNavigationTextMutation,
  useRoutingPreferences,
} from "@/hooks/useBusApi";

const INITIAL_REGION: Region = {
  latitude: 33.5138,
  longitude: 36.2765,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
};

const POINT_COLORS = [
  "#22C55E",
  "#0EA5E9",
  "#F97316",
  "#A855F7",
  "#EAB308",
  "#EF4444",
  "#14B8A6",
];

function pointName(index: number): string {
  const base = "A".charCodeAt(0);
  return `Point ${String.fromCharCode(base + (index % 26))}`;
}

function pointId(lat: number, lng: number): string {
  return `${lat.toFixed(6)}:${lng.toFixed(6)}`;
}

function approxDistanceM(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const latScaleM = 111_320;
  const avgLatRad = ((a.latitude + b.latitude) / 2) * (Math.PI / 180);
  const lngScaleM = 111_320 * Math.cos(avgLatRad);
  const dLatM = (b.latitude - a.latitude) * latScaleM;
  const dLngM = (b.longitude - a.longitude) * lngScaleM;
  return Math.hypot(dLatM, dLngM);
}

function sanitizeMapCoordinates(
  points: { latitude: number; longitude: number }[],
): { latitude: number; longitude: number }[] {
  if (points.length < 3) {
    return points;
  }

  // Pass 1: drop near-duplicate jitter points.
  const deduped: { latitude: number; longitude: number }[] = [
    points[0] as { latitude: number; longitude: number },
  ];
  for (let i = 1; i < points.length; i += 1) {
    const candidate = points[i] as { latitude: number; longitude: number };
    const prev = deduped[deduped.length - 1] as {
      latitude: number;
      longitude: number;
    };
    if (approxDistanceM(prev, candidate) >= 3) {
      deduped.push(candidate);
    }
  }

  if (deduped.length < 3) {
    return deduped;
  }

  // Pass 2: remove tiny "out-and-back" spikes that look like branches.
  const cleaned: { latitude: number; longitude: number }[] = [
    deduped[0] as { latitude: number; longitude: number },
  ];
  for (let i = 1; i < deduped.length - 1; i += 1) {
    const a = cleaned[cleaned.length - 1] as {
      latitude: number;
      longitude: number;
    };
    const b = deduped[i] as { latitude: number; longitude: number };
    const c = deduped[i + 1] as { latitude: number; longitude: number };

    const ab = approxDistanceM(a, b);
    const bc = approxDistanceM(b, c);
    const ac = approxDistanceM(a, c);

    const v1x = b.longitude - a.longitude;
    const v1y = b.latitude - a.latitude;
    const v2x = c.longitude - b.longitude;
    const v2y = c.latitude - b.latitude;
    const v1Len = Math.hypot(v1x, v1y);
    const v2Len = Math.hypot(v2x, v2y);

    let cosine = 1;
    if (v1Len > 0 && v2Len > 0) {
      cosine = (v1x * v2x + v1y * v2y) / (v1Len * v2Len);
    }

    const isTinySpike = cosine < -0.7 && ab < 120 && bc < 120 && ac < 45;
    if (!isTinySpike) {
      cleaned.push(b);
    }
  }

  cleaned.push(
    deduped[deduped.length - 1] as { latitude: number; longitude: number },
  );
  return cleaned;
}

function toMapCoordinates(
  segment: RouteSegment,
): { latitude: number; longitude: number }[] {
  const geometry = segment.coordinates
    ?.filter(
      (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
    )
    .map((point) => ({ latitude: point.lat, longitude: point.lng }));

  if (geometry && geometry.length >= 2) {
    return sanitizeMapCoordinates(geometry);
  }

  // Fallback for older/cached payloads that may not include detailed geometry
  return [
    { latitude: segment.from.lat, longitude: segment.from.lng },
    { latitude: segment.to.lat, longitude: segment.to.lng },
  ];
}

function getSelectedRoute(
  routeResult: NavigationRouteResult | null,
  selectedRouteIndex: number,
): NavigationRouteResult | null {
  if (!routeResult) {
    return null;
  }

  const routeChoices =
    Array.isArray(routeResult.routes) && routeResult.routes.length > 0
      ? routeResult.routes
      : [routeResult, ...(routeResult.alternatives ?? [])];

  if (selectedRouteIndex >= 0 && selectedRouteIndex < routeChoices.length) {
    return routeChoices[selectedRouteIndex] as NavigationRouteResult;
  }

  return routeResult;
}

function extractApiErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as
      | {
          error?: string;
          message?: string;
          details?:
            | string
            | { message?: string }
            | { field?: string; message?: string }[];
        }
      | string
      | undefined;

    if (typeof data === "string" && data.trim().length > 0) {
      return data;
    }

    if (data && typeof data === "object") {
      if (typeof data.details === "string" && data.details.trim().length > 0) {
        return data.details;
      }

      if (
        data.details &&
        typeof data.details === "object" &&
        !Array.isArray(data.details) &&
        typeof data.details.message === "string" &&
        data.details.message.trim().length > 0
      ) {
        return data.details.message;
      }

      const details = Array.isArray(data.details)
        ? data.details
            .map((item) => {
              if (!item) {
                return "";
              }
              const field = item.field ? `${item.field}: ` : "";
              return `${field}${item.message ?? "Invalid value"}`;
            })
            .filter(Boolean)
        : [];

      if (details.length > 0) {
        return details.join("\n");
      }

      if (typeof data.error === "string" && data.error.trim().length > 0) {
        return data.error;
      }

      if (typeof data.message === "string" && data.message.trim().length > 0) {
        return data.message;
      }
    }

    if (error.message) {
      return error.message;
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Failed to compute route.";
}

function isNavigationRouteResult(
  value: unknown,
): value is NavigationRouteResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { segments?: unknown; etaSeconds?: unknown };
  return (
    Array.isArray(candidate.segments) &&
    typeof candidate.etaSeconds === "number"
  );
}

function buildNaturalRouteFallbackMessage(
  response: ParseNavigationTextResponse,
): string {
  if (response.message && response.message.trim().length > 0) {
    return response.message;
  }

  switch (response.reason) {
    case "feature_disabled":
      return "Text route parsing is currently disabled on the server (NLP_ENABLED is off).";
    case "parse_failed":
      return "Could not parse that request. Try clearer start/destination names or choose points on the map.";
    case "unknown_landmark":
      return "Could not recognize one of the places. Try another wording or pick points on the map.";
    case "empty_or_invalid_input":
      return "Please enter a route request first.";
    default:
      return "Could not parse your text request. Please pick points on the map.";
  }
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const topOverlayInset = Math.max(insets.top, 10) + 8;
  const mapRef = useRef<any>(null);
  const sheetScrollRef = useRef<ScrollView>(null);
  const routingPreferencesQuery = useRoutingPreferences();
  const parseNavigationTextMutation = useParseNavigationTextMutation();

  const [currentLocation, setCurrentLocation] = useState<LocationDTO | null>(
    null,
  );
  const [destination, setDestination] = useState<LocationDTO | null>(null);
  const [routeResult, setRouteResult] = useState<NavigationRouteResult | null>(
    null,
  );
  const [selectedAlternativeIndex, setSelectedAlternativeIndex] = useState(0);
  const [mapSelectionMode, setMapSelectionMode] = useState<
    "start" | "destination"
  >("destination");
  const [isRouting, setIsRouting] = useState(false);
  const [isSearchingPlace, setIsSearchingPlace] = useState(false);
  const [naturalRouteText, setNaturalRouteText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState(false);

  const selectedRoute = useMemo(
    () => getSelectedRoute(routeResult, selectedAlternativeIndex),
    [routeResult, selectedAlternativeIndex],
  );

  useEffect(() => {
    const detect = async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError("Location permission not granted.");
        return;
      }

      const found = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const point: LocationDTO = {
        lat: found.coords.latitude,
        lng: found.coords.longitude,
        label: "Current Location",
      };

      setCurrentLocation(point);
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

  const polylines = useMemo(() => {
    if (!selectedRoute) {
      return [];
    }

    return selectedRoute.segments.map((segment, idx) => ({
      id: `${segment.mode}-${segment.routeId ?? "walk"}-${idx}`,
      color: segment.mode === "walk" ? "#F97316" : Colors.dark.primary,
      width: segment.mode === "walk" ? 4 : 6,
      coordinates: toMapCoordinates(segment),
    }));
  }, [selectedRoute]);

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

  const pointColorByLabel = useMemo(() => {
    return routePoints.reduce<Record<string, string>>((acc, point) => {
      acc[point.label] = point.color;
      return acc;
    }, {});
  }, [routePoints]);

  const requestRouteForPoints = async (
    from: LocationDTO,
    to: LocationDTO,
  ): Promise<NavigationRouteResult> => {
    const savedPrefs = routingPreferencesQuery.data;

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

  const requestRoute = async () => {
    if (!currentLocation || !destination) {
      Alert.alert(
        "Missing points",
        "Current location and destination are required.",
      );
      return;
    }

    setIsRouting(true);
    setError(null);
    setSelectedAlternativeIndex(0);

    try {
      const result = await requestRouteForPoints(currentLocation, destination);
      setRouteResult(result);
      applyRouteToMap(result);
    } catch (err) {
      const message = extractApiErrorMessage(err);
      setError(message);
      setRouteResult(null);
      Alert.alert("Route request failed", message);
    } finally {
      setIsRouting(false);
    }
  };

  const handleNaturalAction = async (response: ParseNavigationTextResponse) => {
    switch (response.action) {
      case "preview_points": {
        if (!response.from || !response.to) {
          setError("NLP response did not include valid route points.");
          return;
        }

        setCurrentLocation(response.from);
        setDestination(response.to);
        setMapSelectionMode("destination");
        setError(null);

        const result = await requestRouteForPoints(response.from, response.to);
        setRouteResult(result);
        applyRouteToMap(result);
        setNaturalRouteText("");
        return;
      }
      case "route_result": {
        if (!isNavigationRouteResult(response.route)) {
          setError("NLP route result was returned in an unsupported format.");
          return;
        }

        setCurrentLocation(response.route.from);
        setDestination(response.route.to);
        setRouteResult(response.route);
        setError(null);
        applyRouteToMap(response.route);
        setNaturalRouteText("");
        return;
      }
      case "ask_clarification": {
        const message =
          response.question ?? "Please clarify your route request.";
        setError(message);
        Alert.alert("Clarification needed", message);
        return;
      }
      case "not_a_trip_request":
      case "show_map_picker": {
        const message = buildNaturalRouteFallbackMessage(response);
        setError(message);
        Alert.alert("Text route", message);
        return;
      }
      case "show_route_info": {
        Alert.alert(
          "Route info",
          "This request returned route information only. Use map points to compute a trip.",
        );
        return;
      }
      default: {
        setError("Unexpected NLP response action.");
      }
    }
  };

  const submitNaturalRouteText = async () => {
    const text = naturalRouteText.trim();
    if (!text) {
      Alert.alert("Missing text", "Type a route request first.");
      return;
    }

    setError(null);

    try {
      const response = await parseNavigationTextMutation.mutateAsync({
        text,
      });
      await handleNaturalAction(response);
    } catch (err) {
      const message = extractApiErrorMessage(err);
      setError(message);
      Alert.alert("Text route failed", message);
    }
  };

  const clearRoute = () => {
    setRouteResult(null);
    setCurrentLocation(null);
    setDestination(null);
    setNaturalRouteText("");
    setMapSelectionMode("destination");
    setError(null);
    setSelectedAlternativeIndex(0);
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
        Alert.alert("No place found", "Try a more specific place name.");
        return;
      }

      const first = matches[0];
      const point: LocationDTO = {
        lat: first.latitude,
        lng: first.longitude,
        label: searchText,
      };

      setDestination(point);
      setRouteResult(null);
      setMapSelectionMode("destination");

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
      Alert.alert("Search failed", "Could not search places right now.");
    } finally {
      setIsSearchingPlace(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          initialRegion={INITIAL_REGION}
          showsUserLocation
          onPress={(event) => {
            Keyboard.dismiss();
            if (routeResult) {
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
                label: `Destination (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
              });
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
              title="Start"
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
              title="Destination"
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
              description={index === 0 ? "Journey start" : "Route point"}
              pinColor={point.color}
            />
          ))}

          {polylines.map((line) => (
            <Polyline
              key={line.id}
              coordinates={line.coordinates}
              strokeColor={line.color}
              strokeWidth={line.width}
            />
          ))}
        </MapView>

        <MapSearchControl
          topInset={topOverlayInset}
          isSearching={isSearchingPlace}
          onSearch={searchPlace}
        />

        <KeyboardAvoidingView
          style={styles.keyboardAvoiding}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={
            Platform.OS === "ios" ? insets.bottom + 12 : 20
          }
          pointerEvents="box-none"
        >
          <View
            style={[styles.sheet, isSheetCollapsed && styles.sheetCollapsed]}
          >
            <ScrollView
              ref={sheetScrollRef}
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              scrollEnabled={!isSheetCollapsed}
            >
              <RoutePlannerControls
                isCollapsed={isSheetCollapsed}
                onToggleCollapsed={() => setIsSheetCollapsed((prev) => !prev)}
                isPreferencesLoading={routingPreferencesQuery.isLoading}
                hasSavedPreferences={Boolean(routingPreferencesQuery.data)}
                startLabel={
                  currentLocation?.label ?? "Detecting current location..."
                }
                destinationLabel={
                  destination?.label ?? "Tap map to select destination"
                }
                mapSelectionMode={mapSelectionMode}
                onChangeMapSelectionMode={setMapSelectionMode}
                routeLocked={Boolean(routeResult)}
                onRequestRoute={() => void requestRoute()}
                isRouting={isRouting}
                naturalRouteText={naturalRouteText}
                onChangeNaturalRouteText={setNaturalRouteText}
                onSubmitNaturalRouteText={() => void submitNaturalRouteText()}
                isParsingNaturalRoute={parseNavigationTextMutation.isPending}
                onClearRoute={clearRoute}
                errorMessage={error}
              />

              {routeResult && !isSheetCollapsed ? (
                <>
                  <View style={styles.summaryRow}>
                    <ThemedText style={styles.summaryText}>
                      ETA:{" "}
                      {Math.max(1, Math.round(routeResult.etaSeconds / 60))} min
                    </ThemedText>
                    <ThemedText style={styles.summaryText}>
                      Transfers: {routeResult.transferCount}
                    </ThemedText>
                    <ThemedText style={styles.summaryText}>
                      Walk: {Math.round(routeResult.walkingDistanceM)}m
                    </ThemedText>
                  </View>

                  <RouteFeedbackPanel
                    routeResult={routeResult}
                    onOpen={() => {
                      sheetScrollRef.current?.scrollToEnd({ animated: true });
                    }}
                  />

                  <RouteStepsList
                    routeResult={routeResult}
                    pointColorByLabel={pointColorByLabel}
                  />
                </>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  keyboardAvoiding: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    maxHeight: "62%",
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 14,
    padding: 12,
    gap: 8,
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
    backgroundColor: "#F3F6FF",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  summaryText: {
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: "600",
  },
  stepsWrap: {
    flex: 1,
    marginTop: 4,
  },
  stepsContent: {
    paddingBottom: 10,
  },
  stepCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.background,
    padding: 10,
    marginBottom: 8,
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
