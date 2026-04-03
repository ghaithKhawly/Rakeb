<<<<<<< HEAD
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  TextInput,
=======
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
>>>>>>> 250ad29 (testing api in app)
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline, Region } from "react-native-maps";
import * as Location from "expo-location";
<<<<<<< HEAD

import { Kinetic } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { useRoutePlanning } from "@/hooks/RoutePlanningContext";

type LocationDTO = {
  lat: number;
  lng: number;
  label?: string;
};

const defaultRegion: Region = {
  latitude: 33.5138,
  longitude: 36.2765,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

function formatLatLngLabel(point: LocationDTO | null): string {
  if (!point) return "Tap map to select destination";
  if (point.label?.trim()) return point.label;
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
=======
import { Ionicons } from "@expo/vector-icons";

import type { LocationDTO } from "@types/location";
import type { NavigationRouteResult, RouteSegment } from "@types/navigation";
import { api } from "@/config/api";
import { Colors } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";

const INITIAL_REGION: Region = {
  latitude: 33.5138,
  longitude: 36.2765,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
};

function pointName(index: number): string {
  const base = "A".charCodeAt(0);
  return `Point ${String.fromCharCode(base + (index % 26))}`;
}

function stepTitle(segment: RouteSegment): string {
  if (segment.mode === "walk") {
    return "Walk";
  }
  return `Take Bus ${segment.routeName ?? "Route"}`;
}

function stepDetails(segment: RouteSegment, index: number): string {
  const fromName = segment.from.label ?? pointName(index);
  const toName = segment.to.label ?? pointName(index + 1);
  const mins = Math.max(1, Math.round(segment.timeSeconds / 60));
  const meters = Math.round(segment.distanceM);

  const busNodes = (
    (segment as RouteSegment & { nodes?: Array<{ label?: string; lat?: number; lng?: number }> }).nodes
    ?? []
  )
    .map((node, nodeIndex) => node.label ?? pointName(index + nodeIndex + 1))
    .filter(Boolean);

  if (segment.mode === "bus" && busNodes.length > 0) {
    return `${fromName} -> ${toName} | via ${busNodes.join(", ")} | ${mins} min | ${meters}m`;
  }

  return `${fromName} -> ${toName} | ${mins} min | ${meters}m`;
>>>>>>> 250ad29 (testing api in app)
}

export default function HomeScreen() {
  const mapRef = useRef<MapView>(null);
<<<<<<< HEAD
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => [190, "66%"], []);

  const {
    currentLocation,
    destination,
    routeResult,
    isRouting,
    routingError,
    setCurrentLocation,
    setDestination,
    computeRoute,
    clearRoute,
  } = useRoutePlanning();

  const routePolylines = useMemo(() => {
    if (!routeResult) return [];

    return routeResult.segments.map((segment, index) => ({
      id: `${segment.mode}-${index}`,
=======

  const [currentLocation, setCurrentLocation] = useState<LocationDTO | null>(null);
  const [destination, setDestination] = useState<LocationDTO | null>(null);
  const [routeResult, setRouteResult] = useState<NavigationRouteResult | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
>>>>>>> 250ad29 (testing api in app)
      coordinates: [
        { latitude: segment.from.lat, longitude: segment.from.lng },
        { latitude: segment.to.lat, longitude: segment.to.lng },
      ],
<<<<<<< HEAD
      color: segment.mode === "walk" ? Kinetic.tertiary : Kinetic.primary,
      width: segment.mode === "walk" ? 4 : 6,
    }));
  }, [routeResult]);

  useEffect(() => {
    const initializeLocation = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") return;

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const point = {
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          label: "Current Location",
        };

        setCurrentLocation(point);

        mapRef.current?.animateToRegion(
          {
            latitude: point.lat,
            longitude: point.lng,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          },
          450,
        );
      } catch {
        // Keep fallback region when location is unavailable.
      }
    };

    void initializeLocation();
  }, [setCurrentLocation]);

  useEffect(() => {
    if (!routeResult) return;

    bottomSheetRef.current?.snapToIndex(1);

    const coords = routePolylines.flatMap((line) => line.coordinates);
    if (coords.length > 1) {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 120, right: 60, bottom: 260, left: 60 },
        animated: true,
      });
    }
  }, [routeResult, routePolylines]);

  const handleFindRoute = async () => {
    if (!destination) {
      Alert.alert("Destination required", "Tap on the map to set destination.");
      return;
    }

    await computeRoute();
  };

  const handleMapPress = (event: {
    nativeEvent: { coordinate: { latitude: number; longitude: number } };
  }) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setDestination({
      lat: latitude,
      lng: longitude,
      label: `Destination (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
    });
  };

  const etaMinutes = routeResult
    ? Math.max(1, Math.round(routeResult.etaSeconds / 60))
    : null;
=======
    }));
  }, [routeResult]);

  const requestRoute = async () => {
    if (!currentLocation || !destination) {
      Alert.alert("Missing points", "Current location and destination are required.");
      return;
    }

    setIsRouting(true);
    setError(null);

    try {
      const response = await api.post<NavigationRouteResult>("/api/busses/navigation/route", {
        from: currentLocation,
        to: destination,
      });

      setRouteResult(response.data);

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
      const message = err instanceof Error ? err.message : "Failed to compute route.";
      setError(message);
      setRouteResult(null);
    } finally {
      setIsRouting(false);
    }
  };

  const clearRoute = () => {
    setRouteResult(null);
    setError(null);
  };
>>>>>>> 250ad29 (testing api in app)

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
<<<<<<< HEAD
          initialRegion={defaultRegion}
          showsUserLocation
          onPress={handleMapPress}
        >
          {destination ? (
            <Marker
              coordinate={{
                latitude: destination.lat,
                longitude: destination.lng,
              }}
=======
          initialRegion={INITIAL_REGION}
          showsUserLocation
          onPress={(event) => {
            const { latitude, longitude } = event.nativeEvent.coordinate;
            setDestination({
              lat: latitude,
              lng: longitude,
              label: `Destination (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
            });
            setRouteResult(null);
          }}
        >
          {destination ? (
            <Marker
              coordinate={{ latitude: destination.lat, longitude: destination.lng }}
>>>>>>> 250ad29 (testing api in app)
              title="Destination"
              description={destination.label}
            />
          ) : null}

<<<<<<< HEAD
          {routePolylines.map((line) => (
=======
          {polylines.map((line) => (
>>>>>>> 250ad29 (testing api in app)
            <Polyline
              key={line.id}
              coordinates={line.coordinates}
              strokeColor={line.color}
              strokeWidth={line.width}
            />
          ))}
        </MapView>

<<<<<<< HEAD
        <TouchableOpacity
          style={styles.recenterButton}
          activeOpacity={0.85}
          onPress={() => {
            if (!currentLocation) return;
            mapRef.current?.animateToRegion(
              {
                latitude: currentLocation.lat,
                longitude: currentLocation.lng,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              },
              380,
            );
          }}
        >
          <Ionicons name="locate" size={22} color={Kinetic.primary} />
        </TouchableOpacity>

        <BottomSheet
          ref={bottomSheetRef}
          index={0}
          snapPoints={snapPoints}
          enablePanDownToClose={false}
          handleIndicatorStyle={styles.handleIndicator}
          backgroundStyle={styles.sheetBackground}
        >
          <BottomSheetScrollView
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.sectionBlock}>
              <ThemedText style={styles.label}>Journey Start</ThemedText>
              <View style={styles.infoRow}>
                <Ionicons name="location" size={18} color={Kinetic.primary} />
                <ThemedText style={styles.infoText}>
                  {currentLocation?.label ?? "Detecting your location..."}
=======
        <View style={styles.sheet}>
          <ThemedText type="defaultSemiBold" style={styles.title}>
            Route Planner
          </ThemedText>

          <ThemedText style={styles.metaText}>
            Start: {currentLocation?.label ?? "Detecting current location..."}
          </ThemedText>
          <ThemedText style={styles.metaText}>
            Destination: {destination?.label ?? "Tap map to select destination"}
          </ThemedText>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => void requestRoute()}
              disabled={isRouting}
            >
              {isRouting ? (
                <ActivityIndicator size="small" color={Colors.dark.background} />
              ) : (
                <>
                  <Ionicons name="navigate" size={16} color={Colors.dark.background} />
                  <ThemedText style={styles.primaryButtonText}>Request Route</ThemedText>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={clearRoute}>
              <ThemedText style={styles.secondaryButtonText}>Clear</ThemedText>
            </TouchableOpacity>
          </View>

          {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}

          {routeResult ? (
            <>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryText}>
                  ETA: {Math.max(1, Math.round(routeResult.etaSeconds / 60))} min
                </ThemedText>
                <ThemedText style={styles.summaryText}>
                  Transfers: {routeResult.transferCount}
                </ThemedText>
                <ThemedText style={styles.summaryText}>
                  Walk: {Math.round(routeResult.walkingDistanceM)}m
>>>>>>> 250ad29 (testing api in app)
                </ThemedText>
              </View>
            </View>

<<<<<<< HEAD
            <View style={styles.sectionBlock}>
              <ThemedText style={styles.label}>Destination</ThemedText>
              <View style={styles.searchRow}>
                <Ionicons
                  name="search"
                  size={18}
                  color={Kinetic.onSurfaceVariant}
                />
                <TextInput
                  value={formatLatLngLabel(destination)}
                  editable={false}
                  style={styles.searchInput}
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.ctaButton}
              activeOpacity={0.9}
              onPress={handleFindRoute}
              disabled={isRouting}
            >
              {isRouting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <ThemedText style={styles.ctaText}>Find Route</ThemedText>
                  <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                </>
              )}
            </TouchableOpacity>

            {routingError ? (
              <ThemedText style={styles.errorText}>{routingError}</ThemedText>
            ) : null}

            {routeResult ? (
              <>
                <View style={styles.resultHeader}>
                  <View>
                    <ThemedText style={styles.etaText}>
                      {etaMinutes} MIN
                    </ThemedText>
                    <ThemedText style={styles.resultSubText}>
                      {routeResult.transferCount} transfers •{" "}
                      {Math.round(routeResult.walkingDistanceM)}m walk
                    </ThemedText>
                  </View>
                  <Pressable onPress={clearRoute} style={styles.clearPill}>
                    <Ionicons
                      name="close"
                      size={16}
                      color={Kinetic.onSurfaceVariant}
                    />
                    <ThemedText style={styles.clearText}>Clear</ThemedText>
                  </Pressable>
                </View>

                <View style={styles.stepsList}>
                  {routeResult.segments.map((segment, index) => (
                    <View
                      key={`${segment.mode}-${index}`}
                      style={styles.stepItem}
                    >
                      <View
                        style={[
                          styles.stepIcon,
                          {
                            backgroundColor:
                              segment.mode === "walk" ? "#ffdbca" : "#dde1ff",
                          },
                        ]}
                      >
                        <Ionicons
                          name={segment.mode === "walk" ? "walk" : "bus"}
                          size={18}
                          color={
                            segment.mode === "walk"
                              ? Kinetic.tertiary
                              : Kinetic.primary
                          }
                        />
                      </View>
                      <View style={styles.stepTextWrap}>
                        <ThemedText style={styles.stepTitle}>
                          {segment.mode === "walk"
                            ? "Walk"
                            : `Take ${segment.routeName ?? "Bus"}`}
                        </ThemedText>
                        <ThemedText style={styles.stepMeta}>
                          {Math.round(segment.timeSeconds / 60)} min •{" "}
                          {Math.round(segment.distanceM)}m
                        </ThemedText>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </BottomSheetScrollView>
        </BottomSheet>
=======
              <ScrollView style={styles.stepsWrap} showsVerticalScrollIndicator={false}>
                {routeResult.segments.map((segment, index) => (
                  <View key={`${segment.mode}-${index}`} style={styles.stepCard}>
                    <ThemedText style={styles.stepTitle}>{stepTitle(segment)}</ThemedText>
                    <ThemedText style={styles.stepSubtitle}>
                      {stepDetails(segment, index)}
                    </ThemedText>
                  </View>
                ))}
              </ScrollView>
            </>
          ) : null}
        </View>
>>>>>>> 250ad29 (testing api in app)
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
<<<<<<< HEAD
    flex: 1,
    backgroundColor: Kinetic.surfaceLow,
  },
  container: {
    flex: 1,
    backgroundColor: Kinetic.surfaceLow,
  },
  recenterButton: {
    position: "absolute",
    right: 22,
    bottom: 230,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  handleIndicator: {
    backgroundColor: "rgba(195, 197, 217, 0.8)",
    width: 44,
    height: 5,
  },
  sheetBackground: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  sheetContent: {
    paddingHorizontal: 24,
    paddingBottom: 42,
    gap: 18,
  },
  sectionBlock: {
    gap: 6,
  },
  label: {
    textTransform: "uppercase",
    fontSize: 11,
    letterSpacing: 1.1,
    color: Kinetic.onSurfaceVariant,
    fontWeight: "700",
  },
  infoRow: {
    height: 56,
    borderRadius: 16,
    backgroundColor: Kinetic.surfaceContainer,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  infoText: {
    color: Kinetic.onSurface,
    fontWeight: "700",
    fontSize: 15,
  },
  searchRow: {
    height: 58,
    borderRadius: 16,
    backgroundColor: Kinetic.surfaceContainerHigh,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    color: Kinetic.onSurface,
    fontSize: 16,
    fontWeight: "700",
  },
  ctaButton: {
    height: 64,
    borderRadius: 20,
    backgroundColor: Kinetic.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  resultHeader: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  etaText: {
    fontSize: 44,
    fontWeight: "900",
    letterSpacing: -1,
    color: Kinetic.onSurface,
  },
  resultSubText: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 13,
    fontWeight: "600",
    marginTop: -4,
  },
  clearPill: {
    borderRadius: 999,
    backgroundColor: Kinetic.surfaceContainer,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  clearText: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 12,
    fontWeight: "700",
  },
  stepsList: {
    gap: 14,
  },
  stepItem: {
    backgroundColor: Kinetic.surfaceLow,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  stepTextWrap: {
    flex: 1,
    gap: 2,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Kinetic.onSurface,
  },
  stepMeta: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 13,
    fontWeight: "500",
  },
  errorText: {
    color: "#BA1A1A",
    fontSize: 13,
=======
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
    maxHeight: "52%",
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 16,
  },
  metaText: {
    color: Colors.dark.icon,
    fontSize: 12,
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
    marginTop: 4,
  },
  summaryText: {
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: "600",
  },
  stepsWrap: {
    marginTop: 4,
  },
  stepCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.background,
    padding: 10,
    marginBottom: 8,
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
>>>>>>> 250ad29 (testing api in app)
  },
});
