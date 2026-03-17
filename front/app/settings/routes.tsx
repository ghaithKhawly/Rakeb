import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import MapView, { Polyline, Region } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { Asset } from "expo-asset";
import JSZip from "jszip";
import { kml as kmlToGeoJson } from "@tmcw/togeojson";
import { DOMParser } from "@xmldom/xmldom";

import { Colors } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import publicRoutesKmz from "@/assets/map/public_routes.kmz";

type MapCoordinate = {
  latitude: number;
  longitude: number;
};

type RouteLine = {
  id: string;
  name: string;
  points: MapCoordinate[];
};

const ROUTE_COLORS = [
  "#2DD4BF",
  "#3B82F6",
  "#F59E0B",
  "#A78BFA",
  "#F43F5E",
  "#22C55E",
  "#06B6D4",
  "#F97316",
  "#EAB308",
  "#14B8A6",
  "#8B5CF6",
  "#10B981",
];

const defaultRegion: Region = {
  latitude: 33.5138,
  longitude: 36.2765,
  latitudeDelta: 0.2,
  longitudeDelta: 0.2,
};

function parseLineCoordinates(rawCoordinates: unknown): MapCoordinate[] {
  if (!Array.isArray(rawCoordinates)) return [];

  return rawCoordinates
    .map((coordinate) => {
      if (!Array.isArray(coordinate) || coordinate.length < 2) return null;

      const longitude = Number(coordinate[0]);
      const latitude = Number(coordinate[1]);

      if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;

      return { latitude, longitude };
    })
    .filter((coordinate): coordinate is MapCoordinate => coordinate !== null);
}

function extractFeatureLines(feature: any): MapCoordinate[][] {
  const geometryType = feature?.geometry?.type;
  const coordinates = feature?.geometry?.coordinates;

  if (!geometryType || !coordinates) return [];

  if (geometryType === "LineString") {
    return [parseLineCoordinates(coordinates)];
  }

  if (geometryType === "MultiLineString" && Array.isArray(coordinates)) {
    return coordinates.map((line) => parseLineCoordinates(line));
  }

  return [];
}

function resolveRouteName(feature: any, index: number): string {
  const properties = feature?.properties ?? {};

  const possibleNames = [
    properties.route,
    properties.route_name,
    properties.line,
    properties.name,
    properties.Name,
    properties.id,
  ];

  const firstValid = possibleNames.find(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
  return firstValid ?? `Route ${index + 1}`;
}

function deriveRegionFromPoints(points: MapCoordinate[]): Region {
  if (points.length === 0) return defaultRegion;

  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);

  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(0.05, (maxLat - minLat) * 1.4),
    longitudeDelta: Math.max(0.05, (maxLon - minLon) * 1.4),
  };
}

function getRouteColor(routeName: string): string {
  let hash = 0;

  for (let index = 0; index < routeName.length; index += 1) {
    hash = (hash << 5) - hash + routeName.charCodeAt(index);
    hash |= 0;
  }

  return ROUTE_COLORS[Math.abs(hash) % ROUTE_COLORS.length];
}

function withAlpha(hexColor: string, alpha: number): string {
  const normalized = hexColor.replace("#", "");

  if (normalized.length !== 6) {
    return hexColor;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  if ([red, green, blue].some(Number.isNaN)) {
    return hexColor;
  }

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export default function RoutesMapScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [routeLines, setRouteLines] = useState<RouteLine[]>([]);
  const [visibleRouteNames, setVisibleRouteNames] = useState<string[]>([]);
  const [selectedRouteName, setSelectedRouteName] = useState<string | null>(null);

  useEffect(() => {
    const loadKmz = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const kmzAsset = Asset.fromModule(publicRoutesKmz);
        await kmzAsset.downloadAsync();

        const kmzUri = kmzAsset.localUri ?? kmzAsset.uri;
        if (!kmzUri) throw new Error("Unable to resolve KMZ file URI.");

        const response = await fetch(kmzUri);
        const buffer = await response.arrayBuffer();

        const zip = await JSZip.loadAsync(buffer);
        const kmlEntry = Object.values(zip.files).find(
          (file) => !file.dir && file.name.toLowerCase().endsWith(".kml"),
        );

        if (!kmlEntry) {
          throw new Error("No KML file found inside KMZ.");
        }

        const kmlContent = await kmlEntry.async("text");
        const dom = new DOMParser().parseFromString(kmlContent, "text/xml");
        const geoJson = kmlToGeoJson(dom as unknown as Document) as any;

        const lines: RouteLine[] = [];

        if (Array.isArray(geoJson?.features)) {
          geoJson.features.forEach((feature: any, featureIndex: number) => {
            const routeName = resolveRouteName(feature, featureIndex);
            const featureLines = extractFeatureLines(feature);

            featureLines.forEach((linePoints, lineIndex) => {
              if (linePoints.length < 2) return;

              lines.push({
                id: `${featureIndex}-${lineIndex}`,
                name: routeName,
                points: linePoints,
              });
            });
          });
        }

        if (lines.length === 0) {
          throw new Error("No route polylines were found in the KMZ file.");
        }

        const names = Array.from(new Set(lines.map((line) => line.name))).sort(
          (a, b) => a.localeCompare(b),
        );

        setRouteLines(lines);
        setVisibleRouteNames(names);
      } catch (loadError) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : "Failed to load KMZ map.";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    void loadKmz();
  }, []);

  const routeNames = useMemo(
    () =>
      Array.from(new Set(routeLines.map((line) => line.name))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [routeLines],
  );

  const routeColorMap = useMemo(
    () =>
      routeNames.reduce<Record<string, string>>((accumulator, routeName) => {
        accumulator[routeName] = getRouteColor(routeName);
        return accumulator;
      }, {}),
    [routeNames],
  );

  const visibleLines = useMemo(
    () => routeLines.filter((line) => visibleRouteNames.includes(line.name)),
    [routeLines, visibleRouteNames],
  );

  const initialRegion = useMemo(
    () => deriveRegionFromPoints(routeLines.flatMap((line) => line.points)),
    [routeLines],
  );

  const fitToVisibleRoutes = useCallback(() => {
    const points = visibleLines.flatMap((line) => line.points);
    if (!mapRef.current || points.length === 0) return;

    mapRef.current.fitToCoordinates(points, {
      edgePadding: { top: 100, right: 40, bottom: 140, left: 40 },
      animated: true,
    });
  }, [visibleLines]);

  useEffect(() => {
    if (!isLoading && visibleLines.length > 0) {
      const timeout = setTimeout(() => {
        fitToVisibleRoutes();
      }, 300);

      return () => clearTimeout(timeout);
    }

    return undefined;
  }, [fitToVisibleRoutes, isLoading, visibleLines.length]);

  useEffect(() => {
    if (selectedRouteName && !visibleRouteNames.includes(selectedRouteName)) {
      setSelectedRouteName(null);
    }
  }, [selectedRouteName, visibleRouteNames]);

  const toggleRouteName = (name: string) => {
    setVisibleRouteNames((previous) =>
      previous.includes(name)
        ? previous.filter((routeName) => routeName !== name)
        : [...previous, name],
    );
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        mapType="standard"
        showsUserLocation
      >
        {visibleLines.map((line) => (
          (() => {
            const baseColor = routeColorMap[line.name] ?? Colors.dark.primary;
            const isSelected = selectedRouteName === line.name;
            const shouldDim = Boolean(selectedRouteName) && !isSelected;

            return (
              <Polyline
                key={line.id}
                coordinates={line.points}
                strokeColor={shouldDim ? withAlpha(baseColor, 0.22) : baseColor}
                strokeWidth={isSelected ? 6 : 4}
                tappable
                onPress={() => setSelectedRouteName(line.name)}
              />
            );
          })()
        ))}
      </MapView>

      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.topButton}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
        </TouchableOpacity>
        <ThemedText type="defaultSemiBold" style={styles.topTitle}>
          Routes Map
        </ThemedText>
        <TouchableOpacity
          style={styles.topButton}
          onPress={fitToVisibleRoutes}
          activeOpacity={0.8}
        >
          <Ionicons name="scan" size={20} color={Colors.dark.text} />
        </TouchableOpacity>
      </View>

      {selectedRouteName && (
        <View style={styles.selectedRouteBadge}>
          <View
            style={[
              styles.selectedRouteDot,
              { backgroundColor: routeColorMap[selectedRouteName] ?? Colors.dark.primary },
            ]}
          />
          <ThemedText type="defaultSemiBold" style={styles.selectedRouteText}>
            {selectedRouteName}
          </ThemedText>
          <TouchableOpacity
            style={styles.clearSelectionButton}
            onPress={() => setSelectedRouteName(null)}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={14} color={Colors.dark.icon} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.filterPanel}>
        <View style={styles.filterHeaderRow}>
          <ThemedText type="defaultSemiBold" style={styles.filterTitle}>
            Route Filters
          </ThemedText>
          <View style={styles.filterActions}>
            <TouchableOpacity
              onPress={() => setVisibleRouteNames(routeNames)}
              activeOpacity={0.8}
              style={styles.textAction}
            >
              <ThemedText style={styles.actionText}>Show all</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setVisibleRouteNames([])}
              activeOpacity={0.8}
              style={styles.textAction}
            >
              <ThemedText style={styles.actionText}>Hide all</ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={Colors.dark.primary} />
            <ThemedText style={styles.infoText}>
              Loading KMZ routes...
            </ThemedText>
          </View>
        ) : error ? (
          <View style={styles.loadingState}>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {routeNames.map((name) => {
              const isVisible = visibleRouteNames.includes(name);

              return (
                <TouchableOpacity
                  key={name}
                  style={[
                    styles.routeChip,
                    isVisible && {
                      borderColor: routeColorMap[name] ?? Colors.dark.primary,
                    },
                  ]}
                  activeOpacity={0.8}
                  onPress={() => toggleRouteName(name)}
                >
                  <View
                    style={[
                      styles.routeColorDot,
                      { backgroundColor: routeColorMap[name] ?? Colors.dark.primary },
                    ]}
                  />
                  <ThemedText
                    style={[
                      styles.routeChipText,
                      isVisible && styles.routeChipTextActive,
                    ]}
                  >
                    {name}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  topBar: {
    position: "absolute",
    top: 52,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    color: Colors.dark.text,
    fontSize: 16,
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  selectedRouteBadge: {
    position: "absolute",
    top: 104,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectedRouteDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  selectedRouteText: {
    color: Colors.dark.text,
    fontSize: 12,
  },
  clearSelectionButton: {
    marginLeft: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  filterPanel: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 20,
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 12,
    gap: 10,
  },
  filterHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  filterTitle: {
    color: Colors.dark.text,
    fontSize: 14,
  },
  filterActions: {
    flexDirection: "row",
    gap: 8,
  },
  textAction: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionText: {
    color: Colors.dark.primary,
    fontSize: 12,
  },
  chipsRow: {
    gap: 8,
    paddingRight: 4,
  },
  routeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.background,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  routeColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeChipText: {
    color: Colors.dark.icon,
    fontSize: 12,
  },
  routeChipTextActive: {
    color: Colors.dark.text,
  },
  loadingState: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoText: {
    color: Colors.dark.icon,
    fontSize: 13,
  },
  errorText: {
    color: Colors.dark.icon,
    fontSize: 13,
  },
});
