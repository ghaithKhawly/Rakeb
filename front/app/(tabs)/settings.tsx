import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Settings
      </ThemedText>

      <TouchableOpacity
        style={styles.optionCard}
        activeOpacity={0.8}
        onPress={() => router.push("/settings/routes")}
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
});
