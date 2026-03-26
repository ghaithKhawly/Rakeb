import React from "react";
import {
  ActivityIndicator,
  View,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { useGraphCacheStatus } from "@/hooks/useBusApi";
import { API_BASE_URL } from "@/config/api";

export default function SettingsScreen() {
  const router = useRouter();
  const { data: graphStatus, isLoading: graphLoading } = useGraphCacheStatus();

  return (
    <View style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Settings
      </ThemedText>

      <TouchableOpacity
        style={styles.optionCard}
        activeOpacity={0.8}
        onPress={() => router.push("/(settings)/routes")}
      >
        <View style={styles.optionContent}>
          <Ionicons name="map-outline" size={22} color={Colors.dark.primary} />
          <View style={styles.textWrapper}>
            <ThemedText type="defaultSemiBold" style={styles.optionTitle}>
              Routes
            </ThemedText>
            <ThemedText style={styles.optionSubtitle}>
              Open full-screen map and filter visible routes
            </ThemedText>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.dark.icon} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.optionCard}
        activeOpacity={0.8}
        onPress={() => router.push("/(settings)/history")}
      >
        <View style={styles.optionContent}>
          <Ionicons name="time-outline" size={22} color={Colors.dark.primary} />
          <View style={styles.textWrapper}>
            <ThemedText type="defaultSemiBold" style={styles.optionTitle}>
              Travel History
            </ThemedText>
            <ThemedText style={styles.optionSubtitle}>
              View and manage your computed routes
            </ThemedText>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.dark.icon} />
      </TouchableOpacity>

      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <Ionicons
            name="server-outline"
            size={18}
            color={Colors.dark.primary}
          />
          <ThemedText type="defaultSemiBold" style={styles.statusTitle}>
            Backend Graph Cache
          </ThemedText>
        </View>
        {graphLoading ? (
          <View style={styles.inlineRow}>
            <ActivityIndicator size="small" color={Colors.dark.primary} />
            <ThemedText style={styles.optionSubtitle}>
              Loading status...
            </ThemedText>
          </View>
        ) : (
          <View style={styles.statusBody}>
            <ThemedText style={styles.optionSubtitle}>
              Loaded: {graphStatus?.isLoaded ? "Yes" : "No"}
            </ThemedText>
            <ThemedText style={styles.optionSubtitle}>
              Routes: {graphStatus?.counts?.routes ?? 0} | Nodes:{" "}
              {graphStatus?.counts?.nodes ?? 0}
            </ThemedText>
            <ThemedText style={styles.apiUrlText}>
              API: {API_BASE_URL}
            </ThemedText>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    padding: 20,
    gap: 16,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 28,
  },
  optionCard: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  textWrapper: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    color: Colors.dark.text,
    fontSize: 16,
  },
  optionSubtitle: {
    color: Colors.dark.icon,
    fontSize: 13,
  },
  statusCard: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusTitle: {
    color: Colors.dark.text,
    fontSize: 14,
  },
  statusBody: {
    gap: 2,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  apiUrlText: {
    color: Colors.dark.icon,
    fontSize: 11,
    marginTop: 4,
  },
});
