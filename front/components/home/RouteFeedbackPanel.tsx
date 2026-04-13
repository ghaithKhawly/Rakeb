import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import type { NavigationRouteResult } from "../../../types/navigation";
import { Colors } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import {
  useBusFeedbackSummary,
  useSubmitBusFeedbackMutation,
} from "@/hooks/useBusApi";
import { useLanguage } from "@/hooks/LanguageContext";

type RouteFeedbackPanelProps = {
  routeResult: NavigationRouteResult;
  onOpen?: () => void;
};

function clampLevel(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}

function formatMetric(value: number | null | undefined, digits = 1): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }
  return value.toFixed(digits);
}

export function RouteFeedbackPanel({
  routeResult,
  onOpen,
}: RouteFeedbackPanelProps) {
  const { t } = useLanguage();
  const submitFeedbackMutation = useSubmitBusFeedbackMutation();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [reportedPrice, setReportedPrice] = useState("");
  const [crowdingLevel, setCrowdingLevel] = useState(3);
  const [speedLevel, setSpeedLevel] = useState(3);
  const [slownessLevel, setSlownessLevel] = useState(3);
  const [comment, setComment] = useState("");

  const feedbackRoutes = useMemo(() => {
    const seen = new Set<number>();
    return routeResult.segments
      .filter(
        (segment) =>
          segment.mode === "bus" && typeof segment.routeId === "number",
      )
      .map((segment) => ({
        routeId: segment.routeId as number,
        routeName:
          segment.routeName ??
          `${t("steps.routeFallback")} ${segment.routeId as number}`,
      }))
      .filter((route) => {
        if (seen.has(route.routeId)) {
          return false;
        }
        seen.add(route.routeId);
        return true;
      });
  }, [routeResult, t]);

  const activeRouteId = selectedRouteId ?? feedbackRoutes[0]?.routeId;
  const summaryQuery = useBusFeedbackSummary(activeRouteId, 30);

  useEffect(() => {
    if (feedbackRoutes.length === 0) {
      setSelectedRouteId(null);
      setIsOpen(false);
      return;
    }

    setSelectedRouteId((prev) => {
      if (prev && feedbackRoutes.some((route) => route.routeId === prev)) {
        return prev;
      }
      return feedbackRoutes[0]?.routeId ?? null;
    });
  }, [feedbackRoutes]);

  if (feedbackRoutes.length === 0) {
    return null;
  }

  const toggleOpen = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next && onOpen) {
        setTimeout(() => {
          onOpen();
        }, 120);
      }
      return next;
    });
  };

  const submit = async () => {
    if (!selectedRouteId) {
      Alert.alert(
        t("feedback.missingRouteTitle"),
        t("feedback.missingRouteBody"),
      );
      return;
    }

    const parsedPrice =
      reportedPrice.trim().length > 0 ? Number(reportedPrice) : undefined;

    if (
      parsedPrice != null &&
      (!Number.isFinite(parsedPrice) || parsedPrice < 0)
    ) {
      Alert.alert(
        t("feedback.invalidPriceTitle"),
        t("feedback.invalidPriceBody"),
      );
      return;
    }

    await submitFeedbackMutation.mutateAsync({
      routeId: selectedRouteId,
      reportedPrice: parsedPrice,
      crowdingLevel: clampLevel(crowdingLevel),
      speedLevel: clampLevel(speedLevel),
      slownessLevel: clampLevel(slownessLevel),
      comment: comment.trim().length > 0 ? comment.trim() : undefined,
    });

    Alert.alert(t("feedback.thanks"), t("feedback.submitted"));
    setIsOpen(false);
    setReportedPrice("");
    setCrowdingLevel(3);
    setSpeedLevel(3);
    setSlownessLevel(3);
    setComment("");
  };

  return (
    <View style={styles.feedbackWrap}>
      <View style={styles.feedbackHeaderRow}>
        <ThemedText style={styles.feedbackTitle}>
          {t("feedback.title")}
        </ThemedText>
        <TouchableOpacity
          style={styles.feedbackToggleButton}
          onPress={toggleOpen}
          disabled={submitFeedbackMutation.isPending}
        >
          <ThemedText style={styles.feedbackToggleButtonText} numberOfLines={1}>
            {isOpen ? t("feedback.hide") : t("feedback.give")}
          </ThemedText>
        </TouchableOpacity>
      </View>

      {isOpen ? (
        <View style={styles.feedbackForm}>
          <ThemedText style={styles.feedbackLabel}>
            {t("feedback.route")}
          </ThemedText>
          <View style={styles.feedbackRouteRow}>
            {feedbackRoutes.map((route) => (
              <TouchableOpacity
                key={route.routeId}
                style={[
                  styles.feedbackRouteChip,
                  selectedRouteId === route.routeId &&
                    styles.feedbackRouteChipActive,
                ]}
                onPress={() => setSelectedRouteId(route.routeId)}
              >
                <ThemedText
                  style={[
                    styles.feedbackRouteChipText,
                    selectedRouteId === route.routeId &&
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
              {t("feedback.summary")}
            </ThemedText>
            {summaryQuery.isLoading ? (
              <ThemedText style={styles.feedbackSummaryText}>
                {t("feedback.loadingSummary")}
              </ThemedText>
            ) : summaryQuery.data ? (
              <>
                <ThemedText style={styles.feedbackSummaryText}>
                  {t("feedback.reports")}: {summaryQuery.data.reportsCount}
                </ThemedText>
                <ThemedText style={styles.feedbackSummaryText}>
                  {t("feedback.avgPrice")}:{" "}
                  {formatMetric(summaryQuery.data.avgPrice, 2)}
                </ThemedText>
                <ThemedText style={styles.feedbackSummaryText}>
                  {t("feedback.avgCrowding")}:{" "}
                  {formatMetric(summaryQuery.data.avgCrowdingLevel)}
                </ThemedText>
                <ThemedText style={styles.feedbackSummaryText}>
                  {t("feedback.avgSpeed")}:{" "}
                  {formatMetric(summaryQuery.data.avgSpeedLevel)}
                </ThemedText>
                <ThemedText style={styles.feedbackSummaryText}>
                  {t("feedback.avgSlowness")}:{" "}
                  {formatMetric(summaryQuery.data.avgSlownessLevel)}
                </ThemedText>
                <ThemedText style={styles.feedbackSummaryText}>
                  {t("feedback.crowdingTendency")}:{" "}
                  {summaryQuery.data.crowdingTendency ?? "-"}
                </ThemedText>
                <ThemedText style={styles.feedbackSummaryText}>
                  {t("feedback.speedSuggestion")}:{" "}
                  {formatMetric(summaryQuery.data.speedMultiplierSuggestion, 2)}
                </ThemedText>
                <ThemedText style={styles.feedbackSummaryText}>
                  {t("feedback.lastReport")}:{" "}
                  {summaryQuery.data.lastReportAt ?? "-"}
                </ThemedText>
              </>
            ) : (
              <ThemedText style={styles.feedbackSummaryText}>
                {t("feedback.noSummary")}
              </ThemedText>
            )}
          </View>

          <ThemedText style={styles.feedbackLabel}>
            {t("feedback.reportedPrice")}
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
            {t("feedback.crowdingLevel")}
          </ThemedText>
          <View style={styles.levelRow}>
            {[1, 2, 3, 4, 5].map((level) => (
              <TouchableOpacity
                key={`crowding-${level}`}
                style={[
                  styles.levelChip,
                  crowdingLevel === level && styles.levelChipActive,
                ]}
                onPress={() => setCrowdingLevel(level)}
              >
                <ThemedText
                  style={[
                    styles.levelChipText,
                    crowdingLevel === level && styles.levelChipTextActive,
                  ]}
                >
                  {level}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          <ThemedText style={styles.feedbackLabel}>
            {t("feedback.speedLevel")}
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
                    speedLevel === level && styles.levelChipTextActive,
                  ]}
                >
                  {level}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          <ThemedText style={styles.feedbackLabel}>
            {t("feedback.slownessLevel")}
          </ThemedText>
          <View style={styles.levelRow}>
            {[1, 2, 3, 4, 5].map((level) => (
              <TouchableOpacity
                key={`slowness-${level}`}
                style={[
                  styles.levelChip,
                  slownessLevel === level && styles.levelChipActive,
                ]}
                onPress={() => setSlownessLevel(level)}
              >
                <ThemedText
                  style={[
                    styles.levelChipText,
                    slownessLevel === level && styles.levelChipTextActive,
                  ]}
                >
                  {level}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          <ThemedText style={styles.feedbackLabel}>
            {t("feedback.comment")}
          </ThemedText>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder={t("feedback.commentPlaceholder")}
            placeholderTextColor={Colors.dark.icon}
            style={[styles.feedbackInput, styles.feedbackCommentInput]}
            multiline
            maxLength={300}
          />

          <View style={styles.feedbackActionRow}>
            <TouchableOpacity
              style={styles.feedbackSkipButton}
              onPress={() => setIsOpen(false)}
              disabled={submitFeedbackMutation.isPending}
            >
              <ThemedText style={styles.feedbackSkipText}>
                {t("feedback.skip")}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.feedbackSubmitButton}
              onPress={() => void submit()}
              disabled={submitFeedbackMutation.isPending}
            >
              {submitFeedbackMutation.isPending ? (
                <ActivityIndicator
                  size="small"
                  color={Colors.dark.background}
                />
              ) : (
                <ThemedText style={styles.feedbackSubmitText}>
                  {t("feedback.submit")}
                </ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
});
