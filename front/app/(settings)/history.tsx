import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Kinetic } from "@/constants/theme";
import {
  useDeleteUserTravelHistoryMutation,
  useUserTravelHistory,
} from "@/hooks/useBusApi";
import { useAuth } from "@/hooks/AuthContext";
import { useLanguage } from "@/hooks/LanguageContext";
import { SettingsTopBar } from "@/components/settings/SettingsTopBar";

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Unknown time";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function metersToKmText(value: number | null): string {
  if (typeof value !== "number") {
    return "-";
  }
  return `${(value / 1000).toFixed(1)} km`;
}

function durationToMinText(value: number | null): string {
  if (typeof value !== "number") {
    return "-";
  }
  return `${Math.max(1, Math.round(value / 60))} min`;
}

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isRTL, t } = useLanguage();
  const [statusMessage, setStatusMessage] = React.useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const historyQuery = useUserTravelHistory({
    limit: 20,
    offset: 0,
  });
  const deleteHistoryMutation = useDeleteUserTravelHistoryMutation();

  React.useEffect(() => {
    if (!statusMessage) {
      return;
    }

    const timeout = setTimeout(() => {
      setStatusMessage(null);
    }, 2200);

    return () => clearTimeout(timeout);
  }, [statusMessage]);

  const items = historyQuery.data?.items ?? [];

  const historySubtitle = t("history.subtitle")
    .replace("{id}", String(user?.id ?? "-"))
    .replace("{limit}", String(historyQuery.data?.limit ?? 20));

  const handleDelete = (id: number) => {
    Alert.alert(
      t("history.deleteTitle"),
      t("history.deleteBody"),
      [
        { text: "Cancel", style: "cancel" },
        {
          text: t("history.delete"),
          style: "destructive",
          onPress: () => {
            deleteHistoryMutation.mutate(
              { id },
              {
                onSuccess: () => {
                  setStatusMessage({
                    type: "success",
                    text: t("history.deleteSuccess"),
                  });
                },
                onError: (error) => {
                  const message =
                    error instanceof Error
                      ? error.message
                      : t("history.deleteError");
                  setStatusMessage({
                    type: "error",
                    text: message,
                  });
                },
              },
            );
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.safeArea, isRTL && styles.safeAreaRtl]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 12) + 12,
            paddingBottom: Math.max(insets.bottom, 16) + 36,
          },
        ]}
      >
        <SettingsTopBar
          title={t("history.title")}
          onBack={() => router.back()}
          rightSlot={(
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={() => {
                void historyQuery.refetch();
              }}
            >
              <Ionicons name="refresh" size={18} color={Kinetic.primary} />
            </TouchableOpacity>
          )}
        />
        <View style={styles.headerCopy}>
          <ThemedText style={styles.subtitle}>{historySubtitle}</ThemedText>
        </View>

        {statusMessage ? (
          <View
            style={[
              styles.statusBanner,
              statusMessage.type === "success"
                ? styles.statusSuccess
                : styles.statusError,
            ]}
          >
            <Ionicons
              name={
                statusMessage.type === "success"
                  ? "checkmark-circle"
                  : "alert-circle"
              }
              size={16}
              color={statusMessage.type === "success" ? "#0F766E" : "#B91C1C"}
            />
            <ThemedText
              style={
                statusMessage.type === "success"
                  ? styles.statusTextSuccess
                  : styles.statusTextError
              }
            >
              {statusMessage.text}
            </ThemedText>
          </View>
        ) : null}

        {historyQuery.isLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="small" color={Kinetic.primary} />
            <ThemedText style={styles.stateText}>{t("history.loading")}</ThemedText>
          </View>
        ) : null}

        {!historyQuery.isLoading && historyQuery.isError ? (
          <View style={styles.stateCard}>
            <ThemedText style={styles.errorText}>
              {t("history.loadError")}
            </ThemedText>
          </View>
        ) : null}

        {!historyQuery.isLoading && !historyQuery.isError && items.length === 0 ? (
          <View style={styles.stateCard}>
            <ThemedText style={styles.stateText}>{t("history.empty")}</ThemedText>
          </View>
        ) : null}

        {!historyQuery.isLoading && !historyQuery.isError
          ? items.map((item) => (
              <View key={item.id} style={styles.entryCard}>
                <View style={styles.entryTopRow}>
                  <View style={styles.routeCopy}>
                    <ThemedText style={styles.routeTitle}>
                      {item.originLabel ?? t("history.unknownOrigin")} -> {item.destLabel ?? t("history.unknownDest")}
                    </ThemedText>
                    <ThemedText style={styles.routeTime}>
                      {item.traveledAt ? formatDateTime(item.traveledAt) : t("history.unknownTime")}
                    </ThemedText>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    disabled={deleteHistoryMutation.isPending}
                    onPress={() => handleDelete(item.id)}
                  >
                    <Ionicons name="trash-outline" size={16} color="#BA1A1A" />
                  </TouchableOpacity>
                </View>

                <View style={styles.metaRow}>
                  <ThemedText style={styles.metaPill}>
                    {t("history.metric.transfers")}: {item.transferCount ?? 0}
                  </ThemedText>
                  <ThemedText style={styles.metaPill}>
                    {t("history.metric.distance")}: {metersToKmText(item.totalDistanceM)}
                  </ThemedText>
                  <ThemedText style={styles.metaPill}>
                    {t("history.metric.duration")}: {durationToMinText(item.totalDurationSeconds)}
                  </ThemedText>
                </View>
              </View>
            ))
          : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Kinetic.surfaceLow,
  },
  safeAreaRtl: {
    direction: "rtl",
  },
  content: {
    paddingHorizontal: 20,
    gap: 12,
  },
  headerCopy: {
    marginTop: -6,
    marginBottom: 2,
  },
  subtitle: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 13,
    fontWeight: "600",
  },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Kinetic.outlineVariant,
  },
  statusBanner: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusSuccess: {
    backgroundColor: "#CCFBF1",
    borderWidth: 1,
    borderColor: "#5EEAD4",
  },
  statusError: {
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  statusTextSuccess: {
    color: "#115E59",
    fontSize: 13,
    fontWeight: "700",
  },
  statusTextError: {
    color: "#991B1B",
    fontSize: 13,
    fontWeight: "700",
  },
  stateCard: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stateText: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 14,
    fontWeight: "600",
  },
  errorText: {
    color: "#BA1A1A",
    fontSize: 13,
    fontWeight: "700",
  },
  entryCard: {
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    padding: 14,
    gap: 10,
  },
  entryTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  routeCopy: {
    flex: 1,
    gap: 3,
  },
  routeTitle: {
    color: Kinetic.onSurface,
    fontSize: 14,
    fontWeight: "800",
  },
  routeTime: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 12,
    fontWeight: "500",
  },
  deleteButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFECEB",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaPill: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 12,
    fontWeight: "700",
    backgroundColor: Kinetic.surfaceContainer,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
});
