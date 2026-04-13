import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import type {
  NavigationRouteResult,
  RouteSegment,
} from "../../../types/navigation";
import { Colors } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { useLanguage } from "@/hooks/LanguageContext";

type RouteStepsListProps = {
  routeResult: NavigationRouteResult;
  pointColorByLabel: Record<string, string>;
};

function pointName(index: number): string {
  const base = "A".charCodeAt(0);
  return `Point ${String.fromCharCode(base + (index % 26))}`;
}

function stepTitle(
  segment: RouteSegment,
  takeBusLabel: string,
  routeFallback: string,
  walkLabel: string,
): string {
  if (segment.mode === "walk") {
    return walkLabel;
  }
  return `${takeBusLabel} ${segment.routeName ?? routeFallback}`;
}

function stepDetails(
  segment: RouteSegment,
  index: number,
  viaLabel: string,
): string {
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
    return `${viaLabel} ${busNodes.join(", ")} | ${mins} min | ${meters}m`;
  }

  return `${mins} min | ${meters}m`;
}

export function RouteStepsList({
  routeResult,
  pointColorByLabel,
}: RouteStepsListProps) {
  const { t } = useLanguage();

  return (
    <View style={styles.stepsWrap}>
      {routeResult.segments.map((segment, index) => (
        <View key={`${segment.mode}-${index}`} style={styles.stepCard}>
          <View style={styles.stepPointsRow}>
            <View
              style={[
                styles.pointBadge,
                {
                  backgroundColor:
                    pointColorByLabel[pointName(index)] ?? Colors.dark.primary,
                },
              ]}
            >
              <ThemedText style={styles.pointBadgeText}>
                {pointName(index)}
              </ThemedText>
            </View>
            <Ionicons name="arrow-forward" size={14} color={Colors.dark.icon} />
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
            {stepTitle(
              segment,
              t("steps.takeBus"),
              t("steps.routeFallback"),
              t("steps.walk"),
            )}
          </ThemedText>
          <ThemedText style={styles.stepSubtitle}>
            {stepDetails(segment, index, t("steps.via"))}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
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
