import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import {
  useDeleteUserTravelHistoryMutation,
  useUserTravelHistory,
} from "@/hooks/useBusApi";

function formatEta(seconds: number | null): string {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return "N/A";
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

export default function TravelHistoryScreen() {
  const router = useRouter();
  const { data, isLoading, error, refetch, isRefetching } =
    useUserTravelHistory({
      limit: 30,
      offset: 0,
    });
  const deleteMutation = useDeleteUserTravelHistoryMutation();

  const items = useMemo(() => data?.items ?? [], [data?.items]);

  const handleDelete = (id: number) => {
    Alert.alert(
      "Delete history item",
      "Are you sure you want to remove this route history record?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate({ id }),
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.topButton}
          onPress={() => router.push("/(tabs)/settings")}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
        </TouchableOpacity>
        <ThemedText type="defaultSemiBold" style={styles.topTitle}>
          Travel History
        </ThemedText>
        <TouchableOpacity
          style={styles.topButton}
          onPress={() => refetch()}
          activeOpacity={0.8}
        >
          {isRefetching ? (
            <ActivityIndicator size="small" color={Colors.dark.primary} />
          ) : (
            <Ionicons name="refresh" size={18} color={Colors.dark.text} />
          )}
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
          <ThemedText style={styles.subtleText}>Loading history...</ThemedText>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <ThemedText style={styles.errorText}>
            Failed to load history.
          </ThemedText>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => refetch()}
          >
            <ThemedText style={styles.retryText}>Retry</ThemedText>
          </TouchableOpacity>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centerState}>
          <ThemedText style={styles.subtleText}>
            No travel history yet.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <ThemedText type="defaultSemiBold" style={styles.cardTitle}>
                  {item.originLabel ?? "Origin"} {"->"}{" "}
                  {item.destLabel ?? "Destination"}
                </ThemedText>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDelete(item.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Ionicons
                    name="trash-outline"
                    size={16}
                    color={Colors.dark.icon}
                  />
                </TouchableOpacity>
              </View>
              <ThemedText style={styles.cardMeta}>
                ETA: {formatEta(item.totalDurationSeconds)} | Transfers:{" "}
                {item.transferCount ?? 0}
              </ThemedText>
              <ThemedText style={styles.cardMeta}>
                Distance: {Math.round(item.totalDistanceM ?? 0)}m | Day:{" "}
                {item.dayOfWeek} Hour: {item.hourOfDay}
              </ThemedText>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    paddingTop: 52,
  },
  topBar: {
    marginHorizontal: 16,
    marginBottom: 12,
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
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 20,
  },
  subtleText: {
    color: Colors.dark.icon,
    fontSize: 14,
  },
  errorText: {
    color: "#F87171",
    fontSize: 14,
  },
  retryButton: {
    backgroundColor: Colors.dark.surface,
    borderColor: Colors.dark.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryText: {
    color: Colors.dark.text,
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 30,
    gap: 10,
  },
  card: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 12,
    gap: 6,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    color: Colors.dark.text,
    flex: 1,
    fontSize: 14,
  },
  cardMeta: {
    color: Colors.dark.icon,
    fontSize: 12,
  },
  deleteButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
});
