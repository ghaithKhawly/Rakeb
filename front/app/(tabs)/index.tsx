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
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline, Region } from "react-native-maps";
import * as Location from "expo-location";

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
}

export default function HomeScreen() {
  const mapRef = useRef<MapView>(null);
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
      coordinates: [
        { latitude: segment.from.lat, longitude: segment.from.lng },
        { latitude: segment.to.lat, longitude: segment.to.lng },
      ],
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
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
              title="Destination"
              description={destination.label}
            />
          ) : null}

          {routePolylines.map((line) => (
            <Polyline
              key={line.id}
              coordinates={line.coordinates}
              strokeColor={line.color}
              strokeWidth={line.width}
            />
          ))}
        </MapView>

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
                </ThemedText>
              </View>
            </View>

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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
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
  },
});
