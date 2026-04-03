import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline, Region } from "react-native-maps";
import * as Location from "expo-location";
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
}

export default function HomeScreen() {
  const mapRef = useRef<MapView>(null);

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
      coordinates: [
        { latitude: segment.from.lat, longitude: segment.from.lng },
        { latitude: segment.to.lat, longitude: segment.to.lng },
      ],
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
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
              title="Destination"
              description={destination.label}
            />
          ) : null}

          {polylines.map((line) => (
            <Polyline
              key={line.id}
              coordinates={line.coordinates}
              strokeColor={line.color}
              strokeWidth={line.width}
            />
          ))}
        </MapView>

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
                </ThemedText>
              </View>

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
  },
});

