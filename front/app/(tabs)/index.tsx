import React, { useEffect, useMemo, useRef, useState } from "react";
import { isAxiosError } from "axios";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline, Region } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

import type { LocationDTO } from "../../../types/location";
import type {
  NavigationRouteRequestBody,
  NavigationRouteResult,
  RouteSegment,
} from "../../../types/navigation";
import { api } from "@/config/api";
import { Colors } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import {
  useBusFeedbackSummary,
  useRoutingPreferences,
  useSubmitBusFeedbackMutation,
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

function stepTitle(segment: RouteSegment): string {
  if (segment.mode === "walk") {
    return "Walk";
  }
  return `Take Bus ${segment.routeName ?? "Route"}`;
}

function stepDetails(segment: RouteSegment, index: number): string {
  const mins = Math.max(1, Math.round(segment.timeSeconds / 60));
  const meters = Math.round(segment.distanceM);

  const busNodes = (
    (
      segment as RouteSegment & {
        nodes?: { label?: string; lat?: number; lng?: number }[];
      }
    ).nodes ?? []
  )
    .map((node, nodeIndex) => node.label ?? pointName(index + nodeIndex + 1))
    .filter(Boolean);

  if (segment.mode === "bus" && busNodes.length > 0) {
    return `via ${busNodes.join(", ")} | ${mins} min | ${meters}m`;
  }

  return `${mins} min | ${meters}m`;
}

function pointId(lat: number, lng: number): string {
  return `${lat.toFixed(6)}:${lng.toFixed(6)}`;
}

function clampLevel(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}

function formatMetric(value: number | null | undefined, digits = 1): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }
  return value.toFixed(digits);
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
            | Array<{ field?: string; message?: string }>;
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
  const mapRef = useRef<MapView>(null);
  const sheetScrollRef = useRef<ScrollView>(null);
  const routingPreferencesQuery = useRoutingPreferences();
  const submitFeedbackMutation = useSubmitBusFeedbackMutation();

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
  const [error, setError] = useState<string | null>(null);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [selectedFeedbackRouteId, setSelectedFeedbackRouteId] = useState<
    number | null
  >(null);
  const [reportedPrice, setReportedPrice] = useState("");
  const [crowdingLevel, setCrowdingLevel] = useState(3);
  const [speedLevel, setSpeedLevel] = useState(3);
  const [slownessLevel, setSlownessLevel] = useState(3);
  const [feedbackComment, setFeedbackComment] = useState("");

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

  const feedbackRoutes = useMemo(() => {
    if (!routeResult) {
      return [] as Array<{ routeId: number; routeName: string }>;
    }

    const seen = new Set<number>();
    return routeResult.segments
      .filter(
        (segment) =>
          segment.mode === "bus" && typeof segment.routeId === "number",
      )
      .map((segment) => ({
        routeId: segment.routeId as number,
        routeName: segment.routeName ?? `Route ${segment.routeId as number}`,
      }))
      .filter((route) => {
        if (seen.has(route.routeId)) {
          return false;
        }
        seen.add(route.routeId);
        return true;
      });
  }, [routeResult]);

  const activeFeedbackRouteId =
    selectedFeedbackRouteId ?? feedbackRoutes[0]?.routeId;
  const feedbackSummaryQuery = useBusFeedbackSummary(activeFeedbackRouteId, 30);

  useEffect(() => {
    if (feedbackRoutes.length === 0) {
      setSelectedFeedbackRouteId(null);
      setIsFeedbackOpen(false);
      return;
    }

    setSelectedFeedbackRouteId((prev) => {
      if (prev && feedbackRoutes.some((route) => route.routeId === prev)) {
        return prev;
      }
      return feedbackRoutes[0]?.routeId ?? null;
    });
  }, [feedbackRoutes]);

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
    setIsFeedbackOpen(false);
    setSelectedFeedbackRouteId(null);
    setReportedPrice("");
    setCrowdingLevel(3);
    setSpeedLevel(3);
    setSlownessLevel(3);
    setFeedbackComment("");
  };

  const submitFeedback = async () => {
    if (!selectedFeedbackRouteId) {
      Alert.alert("Missing route", "Select a bus route to submit feedback.");
      return;
    }

    const parsedPrice =
      reportedPrice.trim().length > 0 ? Number(reportedPrice) : undefined;

    if (
      parsedPrice != null &&
      (!Number.isFinite(parsedPrice) || parsedPrice < 0)
    ) {
      Alert.alert("Invalid price", "Reported price must be 0 or greater.");
      return;
    }

    await submitFeedbackMutation.mutateAsync({
      routeId: selectedFeedbackRouteId,
      reportedPrice: parsedPrice,
      crowdingLevel: clampLevel(crowdingLevel),
      speedLevel: clampLevel(speedLevel),
      slownessLevel: clampLevel(slownessLevel),
      comment:
        feedbackComment.trim().length > 0 ? feedbackComment.trim() : undefined,
    });

    Alert.alert("Thanks", "Feedback submitted successfully.");
    setIsFeedbackOpen(false);
    setReportedPrice("");
    setCrowdingLevel(3);
    setSpeedLevel(3);
    setSlownessLevel(3);
    setFeedbackComment("");
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

        <View style={[styles.sheet, isSheetCollapsed && styles.sheetCollapsed]}>
          <ScrollView
            ref={sheetScrollRef}
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            scrollEnabled={!isSheetCollapsed}
          >
            <View style={styles.sheetHeaderRow}>
              <ThemedText type="defaultSemiBold" style={styles.title}>
                Route Planner
              </ThemedText>
              <TouchableOpacity
                style={styles.sheetToggleButton}
                onPress={() => setIsSheetCollapsed((prev) => !prev)}
              >
                <Ionicons
                  name={isSheetCollapsed ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={Colors.dark.text}
                />
              </TouchableOpacity>
            </View>

            <ThemedText style={styles.prefStatusText}>
              {routingPreferencesQuery.isLoading
                ? "Loading saved preferences..."
                : routingPreferencesQuery.data
                  ? "Using saved preferences"
                  : "Using server defaults"}
            </ThemedText>

            {!isSheetCollapsed ? (
              <>
                <ThemedText style={styles.metaText}>
                  Start:{" "}
                  {currentLocation?.label ?? "Detecting current location..."}
                </ThemedText>
                <ThemedText style={styles.metaText}>
                  Destination:{" "}
                  {destination?.label ?? "Tap map to select destination"}
                </ThemedText>
                <View style={styles.modeRow}>
                  <TouchableOpacity
                    style={[
                      styles.modeButton,
                      mapSelectionMode === "start" && styles.modeButtonActive,
                    ]}
                    onPress={() => setMapSelectionMode("start")}
                  >
                    <ThemedText
                      style={[
                        styles.modeButtonText,
                        mapSelectionMode === "start" &&
                          styles.modeButtonTextActive,
                      ]}
                    >
                      Tap Map: Set Start
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modeButton,
                      mapSelectionMode === "destination" &&
                        styles.modeButtonActive,
                    ]}
                    onPress={() => setMapSelectionMode("destination")}
                  >
                    <ThemedText
                      style={[
                        styles.modeButtonText,
                        mapSelectionMode === "destination" &&
                          styles.modeButtonTextActive,
                      ]}
                    >
                      Tap Map: Set Destination
                    </ThemedText>
                  </TouchableOpacity>
                </View>
                {routeResult ? (
                  <ThemedText style={styles.metaText}>
                    Route is locked. Press Clear to choose a new destination.
                  </ThemedText>
                ) : null}

                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => void requestRoute()}
                    disabled={isRouting}
                  >
                    {isRouting ? (
                      <ActivityIndicator
                        size="small"
                        color={Colors.dark.background}
                      />
                    ) : (
                      <>
                        <Ionicons
                          name="navigate"
                          size={16}
                          color={Colors.dark.background}
                        />
                        <ThemedText style={styles.primaryButtonText}>
                          Request Route
                        </ThemedText>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={clearRoute}
                  >
                    <ThemedText style={styles.secondaryButtonText}>
                      Clear
                    </ThemedText>
                  </TouchableOpacity>
                </View>

                {error ? (
                  <ThemedText style={styles.errorText}>{error}</ThemedText>
                ) : null}
              </>
            ) : null}

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

                {feedbackRoutes.length > 0 ? (
                  <View style={styles.feedbackWrap}>
                    <View style={styles.feedbackHeaderRow}>
                      <ThemedText style={styles.feedbackTitle}>
                        Route Feedback
                      </ThemedText>
                      <TouchableOpacity
                        style={styles.feedbackToggleButton}
                        onPress={() => {
                          setIsFeedbackOpen((prev) => {
                            const next = !prev;
                            if (next) {
                              setTimeout(() => {
                                sheetScrollRef.current?.scrollToEnd({
                                  animated: true,
                                });
                              }, 120);
                            }
                            return next;
                          });
                        }}
                        disabled={submitFeedbackMutation.isPending}
                      >
                        <ThemedText
                          style={styles.feedbackToggleButtonText}
                          numberOfLines={1}
                        >
                          {isFeedbackOpen ? "Hide" : "Give Feedback"}
                        </ThemedText>
                      </TouchableOpacity>
                    </View>

                    {isFeedbackOpen ? (
                      <View style={styles.feedbackForm}>
                        <ThemedText style={styles.feedbackLabel}>
                          Route
                        </ThemedText>
                        <View style={styles.feedbackRouteRow}>
                          {feedbackRoutes.map((route) => (
                            <TouchableOpacity
                              key={route.routeId}
                              style={[
                                styles.feedbackRouteChip,
                                selectedFeedbackRouteId === route.routeId &&
                                  styles.feedbackRouteChipActive,
                              ]}
                              onPress={() =>
                                setSelectedFeedbackRouteId(route.routeId)
                              }
                            >
                              <ThemedText
                                style={[
                                  styles.feedbackRouteChipText,
                                  selectedFeedbackRouteId === route.routeId &&
                                    styles.feedbackRouteChipTextActive,
                                ]}
                              >
                                {route.routeName}
                              </ThemedText>
                            </TouchableOpacity>
                          ))}
                        </View>

                        <View style={styles.feedbackSummaryBox}>
                          <ThemedText style={styles.feedbackSummaryTitle}>
                            Route Feedback Summary (30 days)
                          </ThemedText>
                          {feedbackSummaryQuery.isLoading ? (
                            <ThemedText style={styles.feedbackSummaryText}>
                              Loading summary...
                            </ThemedText>
                          ) : feedbackSummaryQuery.data ? (
                            <>
                              <ThemedText style={styles.feedbackSummaryText}>
                                Reports:{" "}
                                {feedbackSummaryQuery.data.reportsCount}
                              </ThemedText>
                              <ThemedText style={styles.feedbackSummaryText}>
                                Avg Price:{" "}
                                {formatMetric(
                                  feedbackSummaryQuery.data.avgPrice,
                                  2,
                                )}
                              </ThemedText>
                              <ThemedText style={styles.feedbackSummaryText}>
                                Avg Crowding:{" "}
                                {formatMetric(
                                  feedbackSummaryQuery.data.avgCrowdingLevel,
                                )}
                              </ThemedText>
                              <ThemedText style={styles.feedbackSummaryText}>
                                Avg Speed:{" "}
                                {formatMetric(
                                  feedbackSummaryQuery.data.avgSpeedLevel,
                                )}
                              </ThemedText>
                              <ThemedText style={styles.feedbackSummaryText}>
                                Avg Slowness:{" "}
                                {formatMetric(
                                  feedbackSummaryQuery.data.avgSlownessLevel,
                                )}
                              </ThemedText>
                              <ThemedText style={styles.feedbackSummaryText}>
                                Crowding Tendency:{" "}
                                {feedbackSummaryQuery.data.crowdingTendency ??
                                  "-"}
                              </ThemedText>
                              <ThemedText style={styles.feedbackSummaryText}>
                                Speed Suggestion:{" "}
                                {formatMetric(
                                  feedbackSummaryQuery.data
                                    .speedMultiplierSuggestion,
                                  2,
                                )}
                              </ThemedText>
                              <ThemedText style={styles.feedbackSummaryText}>
                                Last Report:{" "}
                                {feedbackSummaryQuery.data.lastReportAt ?? "-"}
                              </ThemedText>
                            </>
                          ) : (
                            <ThemedText style={styles.feedbackSummaryText}>
                              No summary available yet.
                            </ThemedText>
                          )}
                        </View>

                        <ThemedText style={styles.feedbackLabel}>
                          Reported Price
                        </ThemedText>
                        <TextInput
                          value={reportedPrice}
                          onChangeText={setReportedPrice}
                          placeholder="0"
                          placeholderTextColor={Colors.dark.icon}
                          keyboardType="numeric"
                          style={styles.feedbackInput}
                        />

                        <ThemedText style={styles.feedbackLabel}>
                          Crowding Level
                        </ThemedText>
                        <View style={styles.levelRow}>
                          {[1, 2, 3, 4, 5].map((level) => (
                            <TouchableOpacity
                              key={`crowding-${level}`}
                              style={[
                                styles.levelChip,
                                crowdingLevel === level &&
                                  styles.levelChipActive,
                              ]}
                              onPress={() => setCrowdingLevel(level)}
                            >
                              <ThemedText
                                style={[
                                  styles.levelChipText,
                                  crowdingLevel === level &&
                                    styles.levelChipTextActive,
                                ]}
                              >
                                {level}
                              </ThemedText>
                            </TouchableOpacity>
                          ))}
                        </View>

                        <ThemedText style={styles.feedbackLabel}>
                          Speed Level
                        </ThemedText>
                        <View style={styles.levelRow}>
                          {[1, 2, 3, 4, 5].map((level) => (
                            <TouchableOpacity
                              key={`speed-${level}`}
                              style={[
                                styles.levelChip,
                                speedLevel === level && styles.levelChipActive,
                              ]}
                              onPress={() => setSpeedLevel(level)}
                            >
                              <ThemedText
                                style={[
                                  styles.levelChipText,
                                  speedLevel === level &&
                                    styles.levelChipTextActive,
                                ]}
                              >
                                {level}
                              </ThemedText>
                            </TouchableOpacity>
                          ))}
                        </View>

                        <ThemedText style={styles.feedbackLabel}>
                          Slowness Level
                        </ThemedText>
                        <View style={styles.levelRow}>
                          {[1, 2, 3, 4, 5].map((level) => (
                            <TouchableOpacity
                              key={`slowness-${level}`}
                              style={[
                                styles.levelChip,
                                slownessLevel === level &&
                                  styles.levelChipActive,
                              ]}
                              onPress={() => setSlownessLevel(level)}
                            >
                              <ThemedText
                                style={[
                                  styles.levelChipText,
                                  slownessLevel === level &&
                                    styles.levelChipTextActive,
                                ]}
                              >
                                {level}
                              </ThemedText>
                            </TouchableOpacity>
                          ))}
                        </View>

                        <ThemedText style={styles.feedbackLabel}>
                          Comment (Optional)
                        </ThemedText>
                        <TextInput
                          value={feedbackComment}
                          onChangeText={setFeedbackComment}
                          placeholder="Share your experience"
                          placeholderTextColor={Colors.dark.icon}
                          style={[
                            styles.feedbackInput,
                            styles.feedbackCommentInput,
                          ]}
                          multiline
                          maxLength={300}
                        />

                        <View style={styles.feedbackActionRow}>
                          <TouchableOpacity
                            style={styles.feedbackSkipButton}
                            onPress={() => setIsFeedbackOpen(false)}
                            disabled={submitFeedbackMutation.isPending}
                          >
                            <ThemedText style={styles.feedbackSkipText}>
                              Skip
                            </ThemedText>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.feedbackSubmitButton}
                            onPress={() => void submitFeedback()}
                            disabled={submitFeedbackMutation.isPending}
                          >
                            {submitFeedbackMutation.isPending ? (
                              <ActivityIndicator
                                size="small"
                                color={Colors.dark.background}
                              />
                            ) : (
                              <ThemedText style={styles.feedbackSubmitText}>
                                Submit Feedback
                              </ThemedText>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.stepsWrap}>
                  {routeResult.segments.map((segment, index) => (
                    <View
                      key={`${segment.mode}-${index}`}
                      style={styles.stepCard}
                    >
                      {/** Keep step badges consistent as Point A/B/C... */}
                      <View style={styles.stepPointsRow}>
                        <View
                          style={[
                            styles.pointBadge,
                            {
                              backgroundColor:
                                pointColorByLabel[pointName(index)] ??
                                Colors.dark.primary,
                            },
                          ]}
                        >
                          <ThemedText style={styles.pointBadgeText}>
                            {pointName(index)}
                          </ThemedText>
                        </View>
                        <Ionicons
                          name="arrow-forward"
                          size={14}
                          color={Colors.dark.icon}
                        />
                        <View
                          style={[
                            styles.pointBadge,
                            {
                              backgroundColor:
                                pointColorByLabel[pointName(index + 1)] ??
                                Colors.dark.primary,
                            },
                          ]}
                        >
                          <ThemedText style={styles.pointBadgeText}>
                            {pointName(index + 1)}
                          </ThemedText>
                        </View>
                      </View>
                      <ThemedText style={styles.stepTitle}>
                        {stepTitle(segment)}
                      </ThemedText>
                      <ThemedText style={styles.stepSubtitle}>
                        {stepDetails(segment, index)}
                      </ThemedText>
                    </View>
                  ))}
                </View>
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
  title: {
    color: Colors.dark.text,
    fontSize: 16,
  },
  sheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetToggleButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.background,
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
    marginTop: 4,
  },
  summaryText: {
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: "600",
  },
  feedbackWrap: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 10,
    backgroundColor: Colors.dark.background,
    padding: 10,
    gap: 8,
  },
  feedbackHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  feedbackTitle: {
    flexShrink: 1,
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: "700",
  },
  feedbackToggleButton: {
    marginLeft: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    flexShrink: 0,
  },
  feedbackToggleButtonText: {
    color: Colors.dark.text,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "600",
  },
  feedbackForm: {
    gap: 8,
  },
  feedbackSummaryBox: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    padding: 8,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    gap: 3,
  },
  feedbackSummaryTitle: {
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 2,
  },
  feedbackSummaryText: {
    color: Colors.dark.icon,
    fontSize: 11,
  },
  feedbackLabel: {
    color: Colors.dark.icon,
    fontSize: 11,
    fontWeight: "600",
  },
  feedbackRouteRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  feedbackRouteChip: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.dark.surface,
  },
  feedbackRouteChipActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(45, 212, 191, 0.2)",
  },
  feedbackRouteChipText: {
    color: Colors.dark.text,
    fontSize: 11,
    fontWeight: "600",
  },
  feedbackRouteChipTextActive: {
    color: Colors.dark.text,
  },
  feedbackInput: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.surface,
    fontSize: 12,
  },
  feedbackCommentInput: {
    minHeight: 74,
    textAlignVertical: "top",
  },
  levelRow: {
    flexDirection: "row",
    gap: 6,
  },
  levelChip: {
    width: 34,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.surface,
  },
  levelChipActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(45, 212, 191, 0.22)",
  },
  levelChipText: {
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: "700",
  },
  levelChipTextActive: {
    color: Colors.dark.text,
  },
  feedbackActionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  feedbackSkipButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 38,
  },
  feedbackSkipText: {
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: "600",
  },
  feedbackSubmitButton: {
    flex: 2,
    backgroundColor: Colors.dark.primary,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 38,
  },
  feedbackSubmitText: {
    color: Colors.dark.background,
    fontSize: 12,
    fontWeight: "700",
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
});
