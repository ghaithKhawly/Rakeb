import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Kinetic } from "@/constants/theme";

type SettingsTopBarProps = {
  title: string;
  onBack: () => void;
  rightSlot?: React.ReactNode;
};

export function SettingsTopBar({
  title,
  onBack,
  rightSlot,
}: SettingsTopBarProps) {
  return (
    <View style={styles.headerRow}>
      <TouchableOpacity
        onPress={onBack}
        activeOpacity={0.85}
        style={styles.backButton}
      >
        <Ionicons name="arrow-back" size={21} color={Kinetic.primary} />
      </TouchableOpacity>

      <View style={styles.headerCopy}>
        <ThemedText style={styles.title}>{title}</ThemedText>
      </View>

      {rightSlot ?? <View style={styles.rightPlaceholder} />}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Kinetic.outlineVariant,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: Kinetic.onSurface,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  rightPlaceholder: {
    width: 38,
    height: 38,
  },
});
