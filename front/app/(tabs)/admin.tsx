import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  GestureResponderEvent,
  PanResponder,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Path as SvgPath } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import MapView, { Marker, Polyline } from "@/components/maps/MapViewCompat";
import type { Region } from "@/components/maps/MapViewCompat";
import { ThemedText } from "@/components/themed-text";
import { Kinetic } from "@/constants/theme";
import { useAuth } from "@/hooks/AuthContext";
import {
  useBusses,
  useCreateAdminRouteMutation,
  useDeleteBusByIdMutation,
  useGraphCacheStatus,
  useRouteLiveMetrics,
  useSnapAdminRouteMutation,
} from "@/hooks/useBusApi";
import type { RouteDrawCoordinate, TransitRouteType } from "../../../types/bus";

type MapCoordinate = {
  latitude: number;
  longitude: number;
};

type ScreenPoint = {
  x: number;
  y: number;
};

type MapViewRef = {
  coordinateForPoint?: (point: ScreenPoint) => Promise<MapCoordinate>;
};

const initialRegion: Region = {
  latitude: 33.5138,
  longitude: 36.2765,
  latitudeDelta: 0.14,
  longitudeDelta: 0.14,
};

const DRAW_SAMPLE_MIN_DISTANCE_PX = 6;
const DRAW_SIMPLIFY_TOLERANCE_PX = 10;
const DRAW_MAX_CONTROL_POINTS = 90;
const DRAW_MAX_FREEHAND_PREVIEW_POINTS = 240;

function toMapCoordinate(point: RouteDrawCoordinate): MapCoordinate {
  return {
    latitude: point.lat,
    longitude: point.lng,
  };
}

function extractMapPressCoordinate(event: unknown): RouteDrawCoordinate | null {
  const coordinate = (event as {
    nativeEvent?: { coordinate?: { latitude?: number; longitude?: number } };
  })?.nativeEvent?.coordinate;

  if (
    !coordinate ||
    typeof coordinate.latitude !== "number" ||
    typeof coordinate.longitude !== "number"
  ) {
    return null;
  }

  return {
    lat: coordinate.latitude,
    lng: coordinate.longitude,
  };
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatNumber(value: number | null | undefined, suffix = "") {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }

  return `${Number(value.toFixed(1))}${suffix}`;
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }

  return `${Math.round(value * 100)}%`;
}

function distancePx(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function haversineDistanceM(a: RouteDrawCoordinate, b: RouteDrawCoordinate): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

function appendRouteCoordinates(
  existing: RouteDrawCoordinate[],
  incoming: RouteDrawCoordinate[],
): RouteDrawCoordinate[] {
  if (existing.length === 0) {
    return incoming;
  }

  if (incoming.length === 0) {
    return existing;
  }

  const lastExisting = existing[existing.length - 1] as RouteDrawCoordinate;
  const firstIncoming = incoming[0] as RouteDrawCoordinate;
  const incomingTail = haversineDistanceM(lastExisting, firstIncoming) < 8
    ? incoming.slice(1)
    : incoming;

  return [...existing, ...incomingTail];
}

function perpendicularDistancePx(point: ScreenPoint, start: ScreenPoint, end: ScreenPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return distancePx(point, start);
  }

  const ratio = Math.max(0, Math.min(1, (((point.x - start.x) * dx) + ((point.y - start.y) * dy)) / ((dx * dx) + (dy * dy))));
  const projected = {
    x: start.x + (ratio * dx),
    y: start.y + (ratio * dy),
  };
  return distancePx(point, projected);
}

function simplifyStrokeRdp(points: ScreenPoint[], tolerancePx: number): ScreenPoint[] {
  if (points.length <= 2) {
    return points;
  }

  let maxDistance = 0;
  let maxIndex = 0;
  const first = points[0] as ScreenPoint;
  const last = points[points.length - 1] as ScreenPoint;

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularDistancePx(points[index] as ScreenPoint, first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = index;
    }
  }

  if (maxDistance <= tolerancePx) {
    return [first, last];
  }

  const left = simplifyStrokeRdp(points.slice(0, maxIndex + 1), tolerancePx);
  const right = simplifyStrokeRdp(points.slice(maxIndex), tolerancePx);
  return [...left.slice(0, -1), ...right];
}

function limitStrokePoints(points: ScreenPoint[], maxPoints: number): ScreenPoint[] {
  if (points.length <= maxPoints) {
    return points;
  }

  const limited: ScreenPoint[] = [];
  const lastIndex = points.length - 1;
  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round((index / (maxPoints - 1)) * lastIndex);
    limited.push(points[sourceIndex] as ScreenPoint);
  }
  return limited;
}

function strokeToSmoothSvgPath(points: ScreenPoint[]): string {
  if (points.length === 0) {
    return "";
  }

  const first = points[0] as ScreenPoint;
  if (points.length === 1) {
    return `M ${first.x} ${first.y}`;
  }

  const commands = [`M ${first.x} ${first.y}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index] as ScreenPoint;
    const next = points[index + 1] as ScreenPoint;
    const mid = {
      x: (current.x + next.x) / 2,
      y: (current.y + next.y) / 2,
    };
    commands.push(`Q ${current.x} ${current.y} ${mid.x} ${mid.y}`);
  }

  const last = points[points.length - 1] as ScreenPoint;
  commands.push(`L ${last.x} ${last.y}`);
  return commands.join(" ");
}

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const bussesQuery = useBusses({ limit: 500, offset: 0 });
  const graphQuery = useGraphCacheStatus();
  const metricsQuery = useRouteLiveMetrics({ refresh: true });
  const createRouteMutation = useCreateAdminRouteMutation();
  const snapRouteMutation = useSnapAdminRouteMutation();
  const deleteRouteMutation = useDeleteBusByIdMutation();

  const [routeName, setRouteName] = useState("");
  const [transportType, setTransportType] = useState<TransitRouteType>("microbus");
  const [basePrice, setBasePrice] = useState("3000");
  const [avgSpeedKmh, setAvgSpeedKmh] = useState("25");
  const [maxActiveBuses, setMaxActiveBuses] = useState("1");
  const [controlPoints, setControlPoints] = useState<RouteDrawCoordinate[]>([]);
  const [previewPoints, setPreviewPoints] = useState<RouteDrawCoordinate[]>([]);
  const [isRoadSnapped, setIsRoadSnapped] = useState(false);
  const [snapFallbackReason, setSnapFallbackReason] = useState<string | null>(null);
  const [isPencilMode, setIsPencilMode] = useState(false);
  const [strokePoints, setStrokePoints] = useState<ScreenPoint[]>([]);
  const [search, setSearch] = useState("");
  const mapRef = useRef<MapViewRef | null>(null);
  const strokePointsRef = useRef<ScreenPoint[]>([]);
  const snapRequestIdRef = useRef(0);

  const routes = bussesQuery.data?.busses ?? [];
  const metrics = metricsQuery.data?.metrics ?? [];

  const metricByRouteId = useMemo(
    () => new Map(metrics.map((metric) => [metric.routeId, metric])),
    [metrics],
  );

  const filteredRoutes = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) {
      return routes;
    }

    return routes.filter((route) => route.name.toLocaleLowerCase().includes(query));
  }, [routes, search]);

  const stats = useMemo(() => {
    const activeVehicles = metrics.reduce((sum, metric) => sum + metric.activeDriverCount, 0);
    const feedbackReports = metrics.reduce((sum, metric) => sum + metric.reportsCount, 0);
    const availability = metrics.length > 0
      ? metrics.reduce((sum, metric) => sum + metric.availabilityRatio, 0) / metrics.length
      : 0;

    return {
      routeCount: routes.length,
      activeVehicles,
      feedbackReports,
      availability,
      graphNodes: graphQuery.data?.counts?.nodes ?? 0,
      graphEdges: graphQuery.data?.counts?.edges ?? 0,
    };
  }, [graphQuery.data?.counts?.edges, graphQuery.data?.counts?.nodes, metrics, routes.length]);

  const resetRouteForm = () => {
    setRouteName("");
    setTransportType("microbus");
    setBasePrice("3000");
    setAvgSpeedKmh("25");
    setMaxActiveBuses("1");
    setControlPoints([]);
    setPreviewPoints([]);
    setIsRoadSnapped(false);
    setSnapFallbackReason(null);
    setStrokePoints([]);
    strokePointsRef.current = [];
  };

  const setDrawnControlPoints = (nextPoints: RouteDrawCoordinate[]) => {
    setControlPoints(nextPoints);
    setPreviewPoints(nextPoints);
    setIsRoadSnapped(false);
    setSnapFallbackReason(null);
  };

  const appendStrokePoint = useCallback((point: ScreenPoint) => {
    const previous = strokePointsRef.current;
    const last = previous[previous.length - 1];
    if (last && distancePx(last, point) < DRAW_SAMPLE_MIN_DISTANCE_PX) {
      return;
    }

    const next = [...previous, point];
    strokePointsRef.current = next;
    setStrokePoints(next);
  }, []);

  const eventToScreenPoint = useCallback((event: GestureResponderEvent): ScreenPoint => ({
    x: event.nativeEvent.locationX,
    y: event.nativeEvent.locationY,
  }), []);

  const commitPencilStroke = useCallback(async () => {
    const rawStroke = strokePointsRef.current;
    const map = mapRef.current;
    if (rawStroke.length < 2 || !map?.coordinateForPoint) {
      setStrokePoints([]);
      strokePointsRef.current = [];
      return;
    }

    const controlStroke = limitStrokePoints(
      simplifyStrokeRdp(rawStroke, DRAW_SIMPLIFY_TOLERANCE_PX),
      DRAW_MAX_CONTROL_POINTS,
    );
    const previewStroke = limitStrokePoints(rawStroke, DRAW_MAX_FREEHAND_PREVIEW_POINTS);

    try {
      const [controlMapCoordinates, previewMapCoordinates] = await Promise.all([
        Promise.all(controlStroke.map((point) => map.coordinateForPoint?.(point))),
        Promise.all(previewStroke.map((point) => map.coordinateForPoint?.(point))),
      ]);
      const routeCoordinates = controlMapCoordinates
        .filter((coordinate): coordinate is MapCoordinate => Boolean(coordinate))
        .map((coordinate) => ({
          lat: coordinate.latitude,
          lng: coordinate.longitude,
        }));
      const freehandPreviewCoordinates = previewMapCoordinates
        .filter((coordinate): coordinate is MapCoordinate => Boolean(coordinate))
        .map((coordinate) => ({
          lat: coordinate.latitude,
          lng: coordinate.longitude,
        }));

      if (routeCoordinates.length >= 2) {
        const freehandOrControlPreview = freehandPreviewCoordinates.length >= 2
          ? freehandPreviewCoordinates
          : routeCoordinates;

        setControlPoints((previous) => appendRouteCoordinates(previous, routeCoordinates));
        setPreviewPoints((previous) =>
          appendRouteCoordinates(previous, freehandOrControlPreview),
        );
        setIsRoadSnapped(false);
        setSnapFallbackReason(null);
      }
    } catch {
      Alert.alert("Could not draw route", "Try zooming in and drawing again.");
    } finally {
      setStrokePoints([]);
      strokePointsRef.current = [];
    }
  }, []);

  const pencilPanResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => isPencilMode,
      onMoveShouldSetPanResponder: () => isPencilMode,
      onPanResponderGrant: (event) => {
        strokePointsRef.current = [];
        const point = eventToScreenPoint(event);
        strokePointsRef.current = [point];
        setStrokePoints([point]);
      },
      onPanResponderMove: (event) => {
        appendStrokePoint(eventToScreenPoint(event));
      },
      onPanResponderRelease: () => {
        void commitPencilStroke();
      },
      onPanResponderTerminate: () => {
        void commitPencilStroke();
      },
    }),
    [appendStrokePoint, commitPencilStroke, eventToScreenPoint, isPencilMode],
  );

  useEffect(() => {
    if (controlPoints.length < 2) {
      snapRequestIdRef.current += 1;
      return;
    }

    const requestId = snapRequestIdRef.current + 1;
    snapRequestIdRef.current = requestId;
    const timer = setTimeout(() => {
      snapRouteMutation.mutate(
        { coordinates: controlPoints },
        {
          onSuccess: (result) => {
            if (snapRequestIdRef.current !== requestId) {
              return;
            }
            const snapped = result.source !== "drawn";
            if (snapped) {
              setPreviewPoints(result.coordinates);
            }
            setIsRoadSnapped(snapped);
            setSnapFallbackReason(result.fallbackReason ?? null);
          },
          onError: () => {
            if (snapRequestIdRef.current !== requestId) {
              return;
            }
            setPreviewPoints(controlPoints);
            setIsRoadSnapped(false);
            setSnapFallbackReason("Backend snap request failed.");
          },
        },
      );
    }, 550);

    return () => clearTimeout(timer);
  }, [controlPoints]);

  const saveRoute = async () => {
    const name = routeName.trim();
    if (!name) {
      Alert.alert("Route name required", "Add a name before saving.");
      return;
    }

    if (controlPoints.length < 2) {
      Alert.alert("Draw more points", "Tap at least two points on the map.");
      return;
    }

    try {
      const canSavePreviewGeometry = isRoadSnapped && previewPoints.length <= 500;
      const result = await createRouteMutation.mutateAsync({
        name,
        transportType,
        basePrice: parseOptionalNumber(basePrice),
        avgSpeedKmh: parseOptionalNumber(avgSpeedKmh),
        maxActiveBuses: Math.max(1, Math.round(parseOptionalNumber(maxActiveBuses) ?? 1)),
        snapToRoads: !canSavePreviewGeometry,
        coordinates: canSavePreviewGeometry ? previewPoints : controlPoints,
      });

      Alert.alert("Route saved", `${result.route.name} is now in the routing graph.`);
      resetRouteForm();
    } catch (error) {
      Alert.alert("Could not save route", error instanceof Error ? error.message : "Try again.");
    }
  };

  const deleteRoute = (routeId: number, name: string) => {
    Alert.alert("Delete route", `Delete ${name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteRouteMutation.mutateAsync({ id: routeId, invalidateGraph: true });
          } catch (error) {
            Alert.alert("Could not delete route", error instanceof Error ? error.message : "Try again.");
          }
        },
      },
    ]);
  };

  if (!isAdmin) {
    return (
      <View style={[styles.centerState, { paddingTop: insets.top + 24 }]}>
        <Ionicons name="lock-closed" size={34} color={Kinetic.primary} />
        <ThemedText style={styles.centerTitle}>Admin only</ThemedText>
        <ThemedText style={styles.centerText}>
          This tab is available for company admin accounts.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 12) + 12,
            paddingBottom: Math.max(insets.bottom, 20) + 110,
          },
        ]}
      >
        <View style={styles.hero}>
          <ThemedText style={styles.heroLabel}>Company Control</ThemedText>
          <ThemedText style={styles.heroTitle}>Admin</ThemedText>
          <ThemedText style={styles.heroSubtitle}>
            Manage routes, live capacity, and graph health.
          </ThemedText>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <ThemedText style={styles.statLabel}>Routes</ThemedText>
            <ThemedText style={styles.statValue}>{stats.routeCount}</ThemedText>
          </View>
          <View style={styles.statCard}>
            <ThemedText style={styles.statLabel}>Active</ThemedText>
            <ThemedText style={styles.statValue}>{stats.activeVehicles}</ThemedText>
          </View>
          <View style={styles.statCard}>
            <ThemedText style={styles.statLabel}>Avail.</ThemedText>
            <ThemedText style={styles.statValue}>{formatPercent(stats.availability)}</ThemedText>
          </View>
          <View style={styles.statCard}>
            <ThemedText style={styles.statLabel}>Reports</ThemedText>
            <ThemedText style={styles.statValue}>{stats.feedbackReports}</ThemedText>
          </View>
        </View>

        <View style={styles.graphCard}>
          <Ionicons name="git-network-outline" size={22} color={Kinetic.primary} />
          <View style={styles.graphTextBlock}>
            <ThemedText style={styles.cardTitle}>Routing graph</ThemedText>
            <ThemedText style={styles.cardSubtitle}>
              {graphQuery.data?.isLoaded ? "Loaded" : "Not loaded"} - {stats.graphNodes} nodes - {stats.graphEdges} edges
            </ThemedText>
          </View>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => {
              void graphQuery.refetch();
              void bussesQuery.refetch();
              void metricsQuery.refetch();
            }}
          >
            <Ionicons name="refresh" size={18} color={Kinetic.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.editorCard}>
          <View style={styles.sectionHeader}>
            <View>
              <ThemedText style={styles.cardTitle}>Add route</ThemedText>
              <ThemedText style={styles.cardSubtitle}>
                {isPencilMode ? "Finger pencil" : isRoadSnapped ? "Road-snapped line" : "Drawn transit line"}
              </ThemedText>
            </View>
            <View style={styles.badgeStack}>
              <View style={styles.pointBadge}>
                <ThemedText style={styles.pointBadgeText}>{controlPoints.length} pts</ThemedText>
              </View>
              {controlPoints.length >= 2 && (
                <View style={styles.snapBadge}>
                  {snapRouteMutation.isPending ? (
                    <ActivityIndicator size="small" color={Kinetic.primary} />
                  ) : (
                    <Ionicons
                      name={isRoadSnapped ? "git-branch-outline" : "remove-outline"}
                      size={14}
                      color={isRoadSnapped ? Kinetic.primary : Kinetic.onSurfaceVariant}
                    />
                  )}
                  <ThemedText style={styles.snapBadgeText}>
                    {snapRouteMutation.isPending
                      ? "Snapping"
                      : isRoadSnapped
                        ? "Roads"
                        : snapFallbackReason
                          ? "OSRM issue"
                          : "Drawn"}
                  </ThemedText>
                </View>
              )}
            </View>
          </View>

          <View style={styles.modeSwitch}>
            <TouchableOpacity
              style={[styles.modeButton, !isPencilMode && styles.modeButtonActive]}
              onPress={() => setIsPencilMode(false)}
            >
              <Ionicons
                name="hand-left-outline"
                size={17}
                color={!isPencilMode ? "#FFFFFF" : Kinetic.primary}
              />
              <ThemedText style={[styles.modeButtonText, !isPencilMode && styles.modeButtonTextActive]}>
                Move
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, isPencilMode && styles.modeButtonActive]}
              onPress={() => setIsPencilMode(true)}
            >
              <Ionicons
                name="pencil"
                size={17}
                color={isPencilMode ? "#FFFFFF" : Kinetic.primary}
              />
              <ThemedText style={[styles.modeButtonText, isPencilMode && styles.modeButtonTextActive]}>
                Draw
              </ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.mapFrame}>
            <MapView
              ref={(ref) => {
                mapRef.current = ref as unknown as MapViewRef | null;
              }}
              style={StyleSheet.absoluteFillObject}
              initialRegion={initialRegion}
              mapType="standard"
              scrollEnabled={!isPencilMode}
              zoomEnabled={!isPencilMode}
              rotateEnabled={!isPencilMode}
              pitchEnabled={!isPencilMode}
              onPress={(event) => {
                if (isPencilMode) {
                  return;
                }
                const coordinate = extractMapPressCoordinate(event);
                if (coordinate) {
                  setDrawnControlPoints([...controlPoints, coordinate]);
                }
              }}
            >
              {previewPoints.length >= 2 && (
                <Polyline
                  coordinates={previewPoints.map(toMapCoordinate)}
                  strokeColor={Kinetic.primary}
                  strokeWidth={5}
                />
              )}
              {controlPoints.map((point, index) => (
                <Marker
                  key={`${point.lat}-${point.lng}-${index}`}
                  coordinate={toMapCoordinate(point)}
                />
              ))}
            </MapView>
            {isPencilMode && (
              <View style={styles.drawOverlay} {...pencilPanResponder.panHandlers}>
                <Svg style={StyleSheet.absoluteFillObject}>
                  {strokePoints.length >= 2 && (
                    <SvgPath
                      d={strokeToSmoothSvgPath(strokePoints)}
                      fill="none"
                      stroke={Kinetic.primary}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={6}
                    />
                  )}
                </Svg>
              </View>
            )}
          </View>

          <View style={styles.drawActions}>
            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={() => setDrawnControlPoints(controlPoints.slice(0, -1))}
              disabled={controlPoints.length === 0}
            >
              <Ionicons name="arrow-undo" size={18} color={Kinetic.primary} />
              <ThemedText style={styles.secondaryActionText}>Undo</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={() => setDrawnControlPoints([])}
              disabled={controlPoints.length === 0}
            >
              <Ionicons name="trash-outline" size={18} color="#BA1A1A" />
              <ThemedText style={styles.dangerText}>Clear</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.field}>
            <ThemedText style={styles.fieldLabel}>Route name</ThemedText>
            <TextInput
              style={styles.input}
              value={routeName}
              onChangeText={setRouteName}
              placeholder="Microbus line name"
              placeholderTextColor="#7A869A"
            />
          </View>

          <View style={styles.segmented}>
            {(["microbus", "bus"] as TransitRouteType[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.segment, transportType === type && styles.segmentActive]}
                onPress={() => setTransportType(type)}
              >
                <ThemedText
                  style={[
                    styles.segmentText,
                    transportType === type && styles.segmentTextActive,
                  ]}
                >
                  {type === "microbus" ? "Microbus" : "Bus"}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.inlineFields}>
            <View style={[styles.field, styles.inlineField]}>
              <ThemedText style={styles.fieldLabel}>Price</ThemedText>
              <TextInput
                style={styles.input}
                value={basePrice}
                onChangeText={setBasePrice}
                keyboardType="numeric"
              />
            </View>
            <View style={[styles.field, styles.inlineField]}>
              <ThemedText style={styles.fieldLabel}>Speed</ThemedText>
              <TextInput
                style={styles.input}
                value={avgSpeedKmh}
                onChangeText={setAvgSpeedKmh}
                keyboardType="numeric"
              />
            </View>
            <View style={[styles.field, styles.inlineField]}>
              <ThemedText style={styles.fieldLabel}>Fleet</ThemedText>
              <TextInput
                style={styles.input}
                value={maxActiveBuses}
                onChangeText={setMaxActiveBuses}
                keyboardType="numeric"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.primaryAction,
              (controlPoints.length < 2 || createRouteMutation.isPending) && styles.disabledAction,
            ]}
            disabled={controlPoints.length < 2 || createRouteMutation.isPending}
            onPress={() => void saveRoute()}
          >
            {createRouteMutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Ionicons name="save-outline" size={18} color="#FFFFFF" />
            )}
            <ThemedText style={styles.primaryActionText}>Save route</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.routesCard}>
          <View style={styles.sectionHeader}>
            <View>
              <ThemedText style={styles.cardTitle}>Routes</ThemedText>
              <ThemedText style={styles.cardSubtitle}>{filteredRoutes.length} visible</ThemedText>
            </View>
          </View>

          <TextInput
            style={styles.input}
            value={search}
            onChangeText={setSearch}
            placeholder="Search routes"
            placeholderTextColor="#7A869A"
          />

          {bussesQuery.isLoading || metricsQuery.isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={Kinetic.primary} />
            </View>
          ) : (
            <View style={styles.routeList}>
              {filteredRoutes.map((route) => {
                const metric = metricByRouteId.get(route.id);
                return (
                  <View key={route.id} style={styles.routeRow}>
                    <View style={styles.routeIcon}>
                      <Ionicons name="bus" size={18} color={Kinetic.primary} />
                    </View>
                    <View style={styles.routeInfo}>
                      <ThemedText style={styles.routeName}>{route.name}</ThemedText>
                      <ThemedText style={styles.routeMeta}>
                        {route.type} - {formatNumber(route.base_price)} SYP - {formatNumber(route.avg_speed_kmh, " km/h")}
                      </ThemedText>
                      <ThemedText style={styles.routeMeta}>
                        Active {metric ? `${metric.activeDriverCount}/${metric.maxActiveBuses}` : "-"} - Availability {formatPercent(metric?.availabilityRatio)}
                      </ThemedText>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => deleteRoute(route.id, route.name)}
                      disabled={deleteRouteMutation.isPending}
                    >
                      <Ionicons name="trash-outline" size={18} color="#BA1A1A" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Kinetic.surfaceLow,
  },
  content: {
    paddingHorizontal: 20,
    gap: 16,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Kinetic.surfaceLow,
    paddingHorizontal: 28,
    gap: 10,
  },
  centerTitle: {
    color: Kinetic.onSurface,
    fontSize: 28,
    fontWeight: "900",
  },
  centerText: {
    color: Kinetic.onSurfaceVariant,
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
  },
  hero: {
    gap: 4,
  },
  heroLabel: {
    color: Kinetic.primary,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  heroTitle: {
    color: Kinetic.onSurface,
    fontSize: 42,
    lineHeight: 48,
    fontWeight: "900",
  },
  heroSubtitle: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 15,
    fontWeight: "600",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 92,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    padding: 16,
    justifyContent: "space-between",
  },
  statLabel: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  statValue: {
    color: Kinetic.onSurface,
    fontSize: 28,
    fontWeight: "900",
  },
  graphCard: {
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  graphTextBlock: {
    flex: 1,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF1FF",
  },
  editorCard: {
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    padding: 16,
    gap: 14,
  },
  routesCard: {
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    padding: 16,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  cardTitle: {
    color: Kinetic.onSurface,
    fontSize: 20,
    fontWeight: "900",
  },
  cardSubtitle: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 13,
    marginTop: 2,
  },
  pointBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#EAF1FF",
  },
  badgeStack: {
    alignItems: "flex-end",
    gap: 6,
  },
  pointBadgeText: {
    color: Kinetic.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  snapBadge: {
    minHeight: 28,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: "#F5F8FF",
    borderWidth: 1,
    borderColor: Kinetic.outlineVariant,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  snapBadgeText: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 11,
    fontWeight: "900",
  },
  modeSwitch: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#EAF1FF",
    borderRadius: 18,
    padding: 4,
  },
  modeButton: {
    flex: 1,
    height: 40,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  modeButtonActive: {
    backgroundColor: Kinetic.primary,
  },
  modeButtonText: {
    color: Kinetic.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  modeButtonTextActive: {
    color: "#FFFFFF",
  },
  mapFrame: {
    height: 320,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#DDE8FF",
  },
  drawOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  drawActions: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryAction: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#EAF1FF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryActionText: {
    color: Kinetic.primary,
    fontWeight: "900",
  },
  dangerText: {
    color: "#BA1A1A",
    fontWeight: "900",
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 12,
    fontWeight: "900",
  },
  input: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Kinetic.outlineVariant,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    color: Kinetic.onSurface,
    fontSize: 14,
    fontWeight: "700",
  },
  segmented: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#EAF1FF",
    borderRadius: 18,
    padding: 4,
  },
  segment: {
    flex: 1,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: {
    backgroundColor: Kinetic.primary,
  },
  segmentText: {
    color: Kinetic.onSurfaceVariant,
    fontWeight: "900",
  },
  segmentTextActive: {
    color: "#FFFFFF",
  },
  inlineFields: {
    flexDirection: "row",
    gap: 8,
  },
  inlineField: {
    flex: 1,
  },
  primaryAction: {
    height: 48,
    borderRadius: 16,
    backgroundColor: Kinetic.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  disabledAction: {
    opacity: 0.55,
  },
  primaryActionText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  loadingState: {
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  routeList: {
    gap: 10,
  },
  routeRow: {
    minHeight: 86,
    borderRadius: 18,
    backgroundColor: "#F5F8FF",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  routeIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#DDE8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  routeInfo: {
    flex: 1,
    gap: 2,
  },
  routeName: {
    color: Kinetic.onSurface,
    fontSize: 15,
    fontWeight: "900",
  },
  routeMeta: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 12,
    fontWeight: "600",
  },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF1F1",
  },
});
