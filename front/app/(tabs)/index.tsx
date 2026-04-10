import React, { useEffect, useMemo, useRef, useState } from "react";
import { isAxiosError } from "axios";
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import MapView, { Marker, Polyline, Region } from "react-native-maps";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { LocationDTO } from "../../../types/location";
import type {
  NavigationRouteRequestBody,
  NavigationRouteResult,
} from "../../../types/navigation";
import { api } from "@/config/api";
import { Colors } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { MapSearchControl } from "@/components/MapSearchControl";
import { RouteFeedbackPanel } from "@/components/home/RouteFeedbackPanel";
import { RoutePlannerControls } from "@/components/home/RoutePlannerControls";
import { RouteStepsList } from "@/components/home/RouteStepsList";
import { useRoutingPreferences } from "@/hooks/useBusApi";

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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const topOverlayInset = Math.max(insets.top, 10) + 8;
  const topMapControlInset = Math.max(topOverlayInset - 9, 0);
  const mapRef = useRef<MapView>(null);
  const sheetScrollRef = useRef<ScrollView>(null);
  const routingPreferencesQuery = useRoutingPreferences();

  const [currentLocation, setCurrentLocation] = useState<LocationDTO | null>(
    null,
  );
  const [destination, setDestination] = useState<LocationDTO | null>(null);
  const [routeResult, setRouteResult] = useState<NavigationRouteResult | null>(
    null,
  );
  const [mapSelectionMode, setMapSelectionMode] = useState<
    "start" | "destination"
  >("destination");
  const [isRouting, setIsRouting] = useState(false);
  const [isSearchingPlace, setIsSearchingPlace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState(false);

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
    if (!routeResult) {
      return [];
    }

    return routeResult.segments.map((segment, idx) => ({
      id: `${segment.mode}-${segment.routeId ?? "walk"}-${idx}`,
      color: segment.mode === "walk" ? "#F97316" : Colors.dark.primary,
      width: segment.mode === "walk" ? 4 : 6,
      coordinates: [
        { latitude: segment.from.lat, longitude: segment.from.lng },
        { latitude: segment.to.lat, longitude: segment.to.lng },
      ],
    }));
  }, [routeResult]);

  const routePoints = useMemo(() => {
    if (!routeResult) {
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

    pushUniquePoint(routeResult.from.lat, routeResult.from.lng, pointName(0));

    routeResult.segments.forEach((segment, index) => {
      pushUniquePoint(segment.to.lat, segment.to.lng, pointName(index + 1));
    });

    return points;
  }, [routeResult]);

  const pointColorByLabel = useMemo(() => {
    return routePoints.reduce<Record<string, string>>((acc, point) => {
      acc[point.label] = point.color;
      return acc;
    }, {});
  }, [routePoints]);

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

    try {
      const savedPrefs = routingPreferencesQuery.data;

      const payload: NavigationRouteRequestBody = {
        from: currentLocation,
        to: destination,
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

      setRouteResult(response.data);

      if (__DEV__) {
        console.log("[Route] response summary", {
          walkingDistanceM: response.data.walkingDistanceM,
          transferCount: response.data.transferCount,
          usedConfig: response.data.usedConfig,
        });
      }

      const coords = response.data.segments.flatMap((segment) => [
        { latitude: segment.from.lat, longitude: segment.from.lng },
        { latitude: segment.to.lat, longitude: segment.to.lng },
      ]);

      if (coords.length >= 2) {
        mapRef.current?.fitToCoordinates(coords, {
          edgePadding: { top: 80, right: 40, bottom: 220, left: 40 },
          animated: true,
        });
      }
    } catch (err) {
      const message = extractApiErrorMessage(err);
      setError(message);
      setRouteResult(null);
      Alert.alert("Route request failed", message);
    } finally {
      setIsRouting(false);
    }
  };

  const clearRoute = () => {
    setRouteResult(null);
    setError(null);
  };

  const searchPlace = async (query: string) => {
    const searchText = query.trim();
    if (!searchText) {
      return;
    }

    setIsSearchingPlace(true);
    try {
      const matches = await Location.geocodeAsync(query);
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
          mapPadding={{ top: topMapControlInset, right: 0, bottom: 0, left: 0 }}
          onPress={(event) => {
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

        <View style={[styles.sheet, isSheetCollapsed && styles.sheetCollapsed]}>
          <ScrollView
            ref={sheetScrollRef}
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
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
              onClearRoute={clearRoute}
              errorMessage={error}
            />

            {routeResult && !isSheetCollapsed ? (
              <>
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryText}>
                    ETA: {Math.max(1, Math.round(routeResult.etaSeconds / 60))}{" "}
                    min
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
  sheet: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    maxHeight: "72%",
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 14,
    padding: 12,
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
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  summaryText: {
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: "600",
  },
});
