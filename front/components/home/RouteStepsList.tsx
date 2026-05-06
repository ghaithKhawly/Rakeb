import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Kinetic, TransitTheme } from "@/constants/theme";
import { getSegmentColor, withAlpha } from "@/utils/routeColors";
import { useLanguage } from "@/hooks/LanguageContext";

import type { NavigationRouteResult, RouteSegment } from "../../../types/navigation";

type RouteStepsListProps = {
  routeResult: NavigationRouteResult;
  onStepPress?: (segment: RouteSegment, index: number) => void;
  activeStepIndex?: number | null;
};

function routeTitle(segment: RouteSegment, takeBusLabel: string, walkLabel: string): string {
  if (segment.mode === "walk") {
    return walkLabel;
  }

  return `${takeBusLabel} ${segment.routeName ?? "Bus"}`;
}

function routeSubtitle(segment: RouteSegment, viaLabel: string): string {
  const fromLabel = segment.from.label ?? "Board";
  const toLabel = segment.to.label ?? "Arrive";
  const durationMinutes = Math.max(1, Math.round(segment.timeSeconds / 60));
  const distanceMeters = Math.max(0, Math.round(segment.distanceM));

  if (segment.mode === "bus") {
    return `${viaLabel} ${fromLabel} → ${toLabel} • ${durationMinutes} min • ${distanceMeters}m`;
  }

  return `${fromLabel} → ${toLabel} • ${durationMinutes} min • ${distanceMeters}m`;
}

export function RouteStepsList({
  routeResult,
  onStepPress,
  activeStepIndex = null,
}: RouteStepsListProps) {
  const { t } = useLanguage();

  const steps = useMemo(
    () =>
      routeResult.segments.map((segment, index) => {
        const isBus = segment.mode === "bus";
        const routeColor = isBus
          ? getSegmentColor(segment.routeName ?? t("steps.routeFallback"), index)
          : TransitTheme.route.walking;

        return {
          id: `${segment.mode}-${index}`,
          segment,
          title: routeTitle(segment, t("steps.takeBus"), t("steps.walk")),
          subtitle: routeSubtitle(segment, t("steps.via")),
          routeColor,
          isBus,
          durationMinutes: Math.max(1, Math.round(segment.timeSeconds / 60)),
          distanceMeters: Math.max(0, Math.round(segment.distanceM)),
          routeName: segment.routeName ?? null,
        };
      }),
    [routeResult.segments, t],
  );

  return (
    <View style={styles.stepsWrap}>
      {steps.map((step, index) => {
        const isFirst = index === 0;
        const isLast = index === steps.length - 1;
        const isActive = activeStepIndex === index;
        const railColor = withAlpha(step.routeColor, step.isBus ? 0.58 : 0.34);

        return (
          <TouchableOpacity
            key={step.id}
            style={styles.stepRow}
            activeOpacity={onStepPress ? 0.86 : 1}
            onPress={() => onStepPress?.(step.segment, index)}
            disabled={!onStepPress}
          >
            <View style={styles.railColumn}>
              <View
                style={[
                  styles.railLine,
                  isFirst && styles.railLineTopHidden,
                  { backgroundColor: railColor },
                ]}
              />
              <View style={[styles.railNode, { backgroundColor: step.routeColor }]}>
                <Ionicons
                  name={step.isBus ? "bus" : "walk"}
                  size={13}
                  color="#FFFFFF"
                />
              </View>
              <View
                style={[
                  styles.railLine,
                  isLast && styles.railLineBottomHidden,
                  { backgroundColor: railColor },
                ]}
              />
            </View>

            <View style={[styles.stepBody, isActive && styles.stepBodyActive, !isLast && styles.stepBodySpaced]}>
              <View style={styles.stepHeader}>
                <View style={styles.stepHeadingBlock}>
                  <ThemedText style={styles.stepTitle}>{step.title}</ThemedText>
                  <View style={[styles.modeBadge, { backgroundColor: withAlpha(step.routeColor, 0.12) }]}>
                    <ThemedText style={[styles.modeBadgeText, { color: step.routeColor }]}>
                      {step.isBus ? (step.routeName ?? "BUS") : "WALK"}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText style={styles.stepTime}>{step.durationMinutes} min</ThemedText>
              </View>

              <ThemedText style={styles.stepSubtitle}>{step.subtitle}</ThemedText>
              <ThemedText style={styles.stepMeta}>{step.distanceMeters}m</ThemedText>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stepsWrap: {
    marginTop: 8,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  railColumn: {
    width: 24,
    alignItems: "center",
    alignSelf: "stretch",
  },
  railLine: {
    width: 2,
    flex: 1,
    borderRadius: 999,
  },
  railLineTopHidden: {
    opacity: 0,
  },
  railLineBottomHidden: {
    opacity: 0,
  },
  railNode: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 0,
    borderWidth: 2,
    borderColor: Kinetic.surfaceContainer,
  },
  stepBody: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: TransitTheme.panel.cardBg,
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  stepBodySpaced: {
    marginBottom: 12,
  },
  stepBodyActive: {
    borderColor: Kinetic.primary,
    backgroundColor: TransitTheme.panel.cardBgActive,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  stepHeadingBlock: {
    flex: 1,
    gap: 6,
  },
  stepTitle: {
    color: Kinetic.onSurface,
    fontSize: 16,
    fontWeight: "800",
  },
  modeBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  modeBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  stepTime: {
    color: Kinetic.onSurface,
    fontSize: 14,
    fontWeight: "800",
  },
  stepSubtitle: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 13,
    lineHeight: 18,
  },
  stepMeta: {
    color: TransitTheme.panel.caption,
    fontSize: 12,
    fontWeight: "600",
  },
});
