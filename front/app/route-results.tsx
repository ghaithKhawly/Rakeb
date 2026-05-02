import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet from '@gorhom/bottom-sheet';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Ionicons } from '@expo/vector-icons';

import { Kinetic, TransitTheme } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { RouteStepsList } from '@/components/home/RouteStepsList';
import { HintBanner } from '@/components/ui/HintBanner';
import MapView, { Marker, Polyline } from '@/components/maps/MapViewCompat';
import { getSegmentColor } from '@/utils/routeColors';
import { useRoutePlanning } from '@/hooks/RoutePlanningContext';
import { goHome } from '@/utils/navigation';
import { hapticSelection } from '@/utils/haptics';
import type { NavigationRouteResult, RouteSegment } from '../../types/navigation';

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const DAMASCUS_CENTER: Region = {
  latitude: 33.5138,
  longitude: 36.2765,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

function toCoordinates(segment: RouteSegment) {
  const points = Array.isArray(segment.coordinates) ? segment.coordinates : [];
  if (points.length > 0) {
    return points
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
      .map((point) => ({ latitude: point.lat, longitude: point.lng }));
  }

  return [
    { latitude: segment.from.lat, longitude: segment.from.lng },
    { latitude: segment.to.lat, longitude: segment.to.lng },
  ];
}

function getRouteLineColor(segment: RouteSegment, index: number) {
  if (segment.mode === 'walk') {
    return TransitTheme.route.walking;
  }

  return getSegmentColor(segment.routeName ?? 'Route', index);
}

function getSegmentLabelCoordinate(segment: RouteSegment) {
  const points = toCoordinates(segment);

  if (points.length === 0) {
    return null;
  }

  const middleIndex = Math.floor((points.length - 1) / 2);
  return points[middleIndex] ?? points[0] ?? null;
}

export default function RouteResultsScreen() {
  const params = useLocalSearchParams<{ from?: string; to?: string; route?: string }>();
  const {
    routeResult,
    selectedRouteIndex,
    setSelectedRouteIndex,
  } = useRoutePlanning();

  const routeFromParams = useMemo<NavigationRouteResult | null>(() => {
    if (!params.route) {
      return null;
    }

    try {
      return JSON.parse(decodeURIComponent(params.route)) as NavigationRouteResult;
    } catch {
      return null;
    }
  }, [params.route]);

  const activeRouteSource = routeResult ?? routeFromParams;
  const routeOptions = useMemo<NavigationRouteResult[]>(() => {
    if (!activeRouteSource) {
      return [];
    }

    if (Array.isArray(activeRouteSource.routes) && activeRouteSource.routes.length > 0) {
      return activeRouteSource.routes;
    }

    return [activeRouteSource, ...(activeRouteSource.alternatives ?? [])];
  }, [activeRouteSource]);

  const selectedRoute = useMemo(() => {
    if (routeOptions.length === 0) {
      return null;
    }

    const safeIndex = Math.max(0, Math.min(selectedRouteIndex, routeOptions.length - 1));
    return routeOptions[safeIndex] ?? null;
  }, [routeOptions, selectedRouteIndex]);

  const activeRoute = selectedRoute ?? activeRouteSource;
  const routeSegments = useMemo(() => (activeRoute?.segments ?? []) as RouteSegment[], [activeRoute]);
  const routeSegmentsWithColor = useMemo(
    () =>
      routeSegments.map((segment, index) => ({
        id: `${segment.mode}-${segment.routeName ?? segment.routeId ?? index}`,
        coordinates: toCoordinates(segment),
        color: getRouteLineColor(segment, index),
      })),
    [routeSegments],
  );
  const busLabels = useMemo(
    () =>
      routeSegments.reduce<
        Array<{ id: string; coordinate: { latitude: number; longitude: number }; label: string; color: string }>
      >((accumulator, segment, index) => {
        if (segment.mode !== 'bus' || !segment.routeName) {
          return accumulator;
        }

        const coordinate = getSegmentLabelCoordinate(segment);

        if (!coordinate) {
          return accumulator;
        }

        accumulator.push({
          id: `${segment.mode}-label-${segment.routeName}-${index}`,
          coordinate,
          label: segment.routeName,
          color: getRouteLineColor(segment, index),
        });

        return accumulator;
      }, []),
    [routeSegments],
  );
  const sheetAnimation = useRef(new Animated.Value(0)).current;
  const lastSheetIndexRef = useRef<number | null>(null);

  useEffect(() => {
    sheetAnimation.setValue(0);
    Animated.timing(sheetAnimation, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [activeRoute?.routeLabel, activeRoute?.etaSeconds, selectedRouteIndex, sheetAnimation]);

  const routePoints = useMemo(() => {
    if (!activeRoute) {
      return [] as Array<{ id: string; latitude: number; longitude: number; title: string; color: string }>;
    }

    const start = activeRoute.from;
    const end = activeRoute.to;
    return [
      { id: 'start', latitude: start.lat, longitude: start.lng, title: params.from ?? 'Start', color: '#22C55E' },
      { id: 'end', latitude: end.lat, longitude: end.lng, title: params.to ?? 'Destination', color: '#EF4444' },
    ];
  }, [activeRoute, params.from, params.to]);

  if (!activeRoute) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <ThemedText style={styles.centerTitle}>No route yet</ThemedText>
        <ThemedText style={styles.centerText}>
          Waiting for the backend route result.
        </ThemedText>
        <TouchableOpacity style={styles.retryButton} onPress={() => goHome(router)}>
          <ThemedText style={styles.retryButtonText}>Back to map</ThemedText>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.mapWrap}>
        <MapView style={styles.map} initialRegion={DAMASCUS_CENTER} showsUserLocation>
          {routeSegmentsWithColor.map((segment) =>
            segment.coordinates.length >= 2 ? (
              <Polyline
                key={segment.id}
                coordinates={segment.coordinates}
                strokeColor={segment.color}
                strokeWidth={5}
              />
            ) : null,
          )}

          {busLabels.map((label) => (
            <Marker
              key={label.id}
              coordinate={label.coordinate}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={[styles.busLabelBubble, { backgroundColor: label.color }]}>
                <Ionicons name="bus" size={12} color="#ff0000" />
                <ThemedText style={styles.busLabelText} numberOfLines={1}>
                  {label.label}
                </ThemedText>
              </View>
            </Marker>
          ))}

          {routePoints.map((point) => (
            <Marker
              key={point.id}
              coordinate={{ latitude: point.latitude, longitude: point.longitude }}
              title={point.title}
              pinColor={point.color}
            />
          ))}
        </MapView>

        <View style={styles.topRouteCard}>
          <View style={styles.topRouteMeta}>
            <ThemedText style={styles.topRouteLabel}>Route result</ThemedText>
            <ThemedText style={styles.topRouteTitle} numberOfLines={1}>
              {activeRoute.routeLabel ?? 'Computed route'}
            </ThemedText>
            <ThemedText style={styles.topRouteSubtitle} numberOfLines={1}>
              {activeRoute.from.label ?? 'Start'} → {activeRoute.to.label ?? 'Destination'}
            </ThemedText>
          </View>
          <View style={styles.topRouteActions}>
            <TouchableOpacity style={styles.topRouteActionButton} onPress={() => router.back()}>
              <Feather name="arrow-left" size={18} color={Kinetic.onSurface} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.topRouteActionButton} onPress={() => goHome(router)}>
              <Feather name="home" size={18} color={Kinetic.onSurface} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <BottomSheet
        index={1}
        snapPoints={['34%', '72%', '95%']}
        enableContentPanningGesture={false}
        enableHandlePanningGesture
        onChange={(nextIndex) => {
          if (lastSheetIndexRef.current !== null && lastSheetIndexRef.current !== nextIndex) {
            hapticSelection();
          }
          lastSheetIndexRef.current = nextIndex;
        }}
        backgroundStyle={styles.sheetBackground}
        handleStyle={styles.sheetHandle}
        handleIndicatorStyle={styles.sheetIndicator}
      >
        <Animated.View style={[styles.sheetAnimatedBody, {
          opacity: sheetAnimation,
          transform: [{
            translateY: sheetAnimation.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
          }],
        }]}>
        <View style={styles.sheetHeader}>
          <View>
            <ThemedText style={styles.sheetTitle}>{Math.max(1, Math.round(activeRoute.etaSeconds / 60))} min</ThemedText>
            <ThemedText style={styles.sheetSubtitle}>
              Transfers: {activeRoute.transferCount} • Walk {Math.round(activeRoute.walkingDistanceM)}m
            </ThemedText>
          </View>
          <View style={styles.sheetActionRow}>
            <TouchableOpacity style={styles.sheetActionButton} onPress={() => { hapticSelection(); router.push('/trip-options'); }}>
              <Feather name="sliders" size={16} color={Kinetic.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetActionButton} onPress={() => { hapticSelection(); goHome(router); }}>
              <Feather name="home" size={16} color={Kinetic.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.routeSelectorRow}>
          {routeOptions.map((option, index) => {
            const active = index === selectedRouteIndex;
            return (
              <TouchableOpacity
                key={`${option.routeLabel ?? 'route'}-${index}`}
                onPress={() => {
                  hapticSelection();
                  setSelectedRouteIndex(index);
                }}
                style={[styles.routeSelectorChip, active && styles.routeSelectorChipActive]}
              >
                <ThemedText style={[styles.routeSelectorText, active && styles.routeSelectorTextActive]}>
                  {Math.max(1, Math.round(option.etaSeconds / 60))} min
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.hintWrap}>
          <HintBanner
            title="Timeline view"
            message="Route options stay available above, but the route sheet now reads as a step-by-step journey."
            compact
          />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.routeOverviewCard}>
            <View style={styles.routeOverviewHeader}>
              <View style={styles.routeOverviewHeaderLeft}>
                <ThemedText style={styles.routeOverviewKicker}>Route overview</ThemedText>
                <ThemedText style={styles.routeOverviewTitle} numberOfLines={1}>
                  {activeRoute.routeLabel ?? 'Computed route'}
                </ThemedText>
                <ThemedText style={styles.routeOverviewSubtitle} numberOfLines={1}>
                  {activeRoute.from.label ?? 'Start'} → {activeRoute.to.label ?? 'Destination'}
                </ThemedText>
              </View>
              <View style={styles.routeOverviewStats}>
                <ThemedText style={styles.routeOverviewEta}>{Math.max(1, Math.round(activeRoute.etaSeconds / 60))} min</ThemedText>
                <ThemedText style={styles.routeOverviewMeta}>Transfers: {activeRoute.transferCount}</ThemedText>
                <ThemedText style={styles.routeOverviewMeta}>Walk {Math.round(activeRoute.walkingDistanceM)}m</ThemedText>
              </View>
            </View>

            <RouteStepsList routeResult={activeRoute} />
          </View>
        </ScrollView>
        </Animated.View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Kinetic.surfaceLow,
  },
  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: Kinetic.surfaceLow,
    paddingHorizontal: 24,
  },
  centerTitle: {
    color: Kinetic.onSurface,
    fontSize: 24,
    fontWeight: '700',
  },
  centerText: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Kinetic.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  mapWrap: {
    flex: 0.53,
    backgroundColor: Kinetic.surfaceLow,
  },
  map: {
    flex: 1,
  },
  topRouteCard: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 10,
    borderRadius: 16,
    backgroundColor: TransitTheme.map.overlayBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: TransitTheme.map.overlayBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  topRouteMeta: {
    flex: 1,
  },
  topRouteLabel: {
    color: Kinetic.primary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  topRouteTitle: {
    color: Kinetic.onSurface,
    fontSize: 19,
    fontWeight: '700',
    marginTop: 2,
  },
  topRouteSubtitle: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 13,
    marginTop: 2,
  },
  topRouteActions: {
    flexDirection: 'row',
    gap: 8,
  },
  busLabelBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 4,
    maxWidth: 140,
  },
  busLabelText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1,
  },
  topRouteActionButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: TransitTheme.panel.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TransitTheme.map.overlayBorder,
  },
  sheetBackground: {
    backgroundColor: TransitTheme.panel.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  sheetHandle: {
    minHeight: 40,
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 8,
  },
  sheetIndicator: {
    backgroundColor: Kinetic.onSurfaceVariant,
    width: 48,
  },
  sheetHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sheetTitle: {
    color: Kinetic.onSurface,
    fontSize: 30,
    fontWeight: '700',
  },
  sheetSubtitle: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 13,
    marginTop: 2,
  },
  sheetActionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: TransitTheme.panel.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
  },
  sheetActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  routeSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexWrap: 'wrap',
  },
  routeSelectorChip: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: TransitTheme.panel.cardBg,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeSelectorChipActive: {
    backgroundColor: TransitTheme.panel.cardBgActive,
    borderWidth: 1,
    borderColor: Kinetic.primary,
  },
  routeSelectorText: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '700',
  },
  routeSelectorTextActive: {
    color: Kinetic.primary,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  hintWrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sheetAnimatedBody: {
    flex: 1,
  },
  routeOverviewCard: {
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 24,
    backgroundColor: TransitTheme.panel.cardBg,
    gap: 12,
  },
  routeOverviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  routeOverviewHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  routeOverviewKicker: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  routeOverviewTitle: {
    color: Kinetic.onSurface,
    fontSize: 20,
    fontWeight: '900',
  },
  routeOverviewSubtitle: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 13,
    lineHeight: 18,
  },
  routeOverviewStats: {
    alignItems: 'flex-end',
    gap: 2,
  },
  routeOverviewEta: {
    color: Kinetic.primary,
    fontSize: 24,
    fontWeight: '900',
  },
  routeOverviewMeta: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '700',
  },
});
