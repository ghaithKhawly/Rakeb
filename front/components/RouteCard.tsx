import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { LayoutAnimation, Platform, StyleSheet, TouchableOpacity, UIManager, View } from "react-native";

import { RouteStepsList } from "@/components/home/RouteStepsList";
import { ThemedText } from "@/components/themed-text";
import { Kinetic, TransitTheme } from "@/constants/theme";
import { hapticSelection, hapticSuccess } from "@/utils/haptics";
import { getRouteTransferCount } from "@/utils/homeScreenUtils";

import type { NavigationRouteResult } from "../../types/navigation";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type RouteCardProps = {
  route: NavigationRouteResult;
  expanded?: boolean;
  onToggle?: () => void;
  onStartNavigation?: () => void;
  showNavigationButton?: boolean;
  testID?: string;
};

export function RouteCard({
  route,
  expanded: controlledExpanded,
  onToggle,
  onStartNavigation,
  showNavigationButton = true,
}: RouteCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded ?? internalExpanded;

  const totalMinutes = Math.max(1, Math.round(route.etaSeconds / 60));
  const transferCount = getRouteTransferCount(route);

  const summaryChips = useMemo(
    () => [
      { label: "ETA", value: `${totalMinutes} min` },
      { label: "Transfers", value: `${transferCount}` },
      { label: "Walking", value: `${Math.round(route.walkingDistanceM)} m` },
    ],
    [route.walkingDistanceM, totalMinutes, transferCount],
  );

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    hapticSelection();

    if (onToggle) {
      onToggle();
      return;
    }

    setInternalExpanded((current) => !current);
  };

  const handleStartNavigation = () => {
    hapticSuccess();
    onStartNavigation?.();
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <ThemedText style={styles.kicker}>Route overview</ThemedText>
          <ThemedText style={styles.title} numberOfLines={1}>
            {route.routeLabel ?? "Computed route"}
          </ThemedText>
          <ThemedText style={styles.subtitle} numberOfLines={1}>
            {route.from.label ?? "Start"} → {route.to.label ?? "Destination"}
          </ThemedText>
        </View>

        <View style={styles.headerRight}>
          <ThemedText style={styles.etaValue}>{totalMinutes} min</ThemedText>
          <TouchableOpacity style={styles.expandButton} onPress={toggleExpanded} activeOpacity={0.82}>
            <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color={Kinetic.onSurface} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.chipRow}>
        {summaryChips.map((chip) => (
          <View key={chip.label} style={styles.statBox}>
            <ThemedText style={styles.statValue}>{chip.value}</ThemedText>
            <ThemedText style={styles.statLabel}>{chip.label}</ThemedText>
          </View>
        ))}
      </View>

      {isExpanded ? (
        <View style={styles.timelineSection}>
          <RouteStepsList routeResult={route} />
        </View>
      ) : null}

      {showNavigationButton ? (
        <TouchableOpacity style={styles.startButton} onPress={handleStartNavigation} activeOpacity={0.88}>
          <Ionicons name="navigate" size={18} color="#FFFFFF" />
          <ThemedText style={styles.startButtonText}>Start navigation</ThemedText>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    backgroundColor: TransitTheme.panel.cardBg,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    padding: 14,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    gap: 4,
  },
  kicker: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    color: Kinetic.onSurface,
    fontSize: 22,
    fontWeight: "900",
  },
  subtitle: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 13,
    lineHeight: 18,
  },
  headerRight: {
    alignItems: "flex-end",
    gap: 8,
  },
  etaValue: {
    color: Kinetic.primary,
    fontSize: 28,
    fontWeight: "900",
  },
  expandButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: TransitTheme.panel.cardBgActive,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: Kinetic.surfaceLow,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    color: Kinetic.onSurface,
    fontSize: 16,
    fontWeight: "900",
  },
  statLabel: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  timelineSection: {
    paddingTop: 4,
  },
  startButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: Kinetic.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
  },
  startButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
});