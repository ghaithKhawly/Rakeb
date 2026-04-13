import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Kinetic } from "@/constants/theme";

type SettingsActionCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  isRTL?: boolean;
  onPress: () => void;
};

export function SettingsActionCard({
  icon,
  title,
  subtitle,
  isRTL = false,
  onPress,
}: SettingsActionCardProps) {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={styles.cardLeft}>
        <View style={styles.cardIconWrap}>
          <Ionicons name={icon} size={24} color={Kinetic.primary} />
        </View>
        <View style={styles.cardCopy}>
          <ThemedText style={styles.cardTitle}>{title}</ThemedText>
          <ThemedText style={styles.cardSubtitle}>{subtitle}</ThemedText>
        </View>
      </View>
      <Ionicons
        name={isRTL ? "chevron-back" : "chevron-forward"}
        size={20}
        color={Kinetic.onSurfaceVariant}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    backgroundColor: Kinetic.surfaceContainer,
    minHeight: 92,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardLeft: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    flex: 1,
  },
  cardIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#dde1ff",
    alignItems: "center",
    justifyContent: "center",
  },
  cardCopy: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Kinetic.onSurface,
  },
  cardSubtitle: {
    fontSize: 13,
    color: Kinetic.onSurfaceVariant,
    marginTop: 2,
  },
});
