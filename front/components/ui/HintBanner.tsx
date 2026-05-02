import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Kinetic, TransitTheme } from "@/constants/theme";

type HintBannerProps = {
  title: string;
  message: string;
  compact?: boolean;
};

export function HintBanner({ title, message, compact = false }: HintBannerProps) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.iconWrap}>
        <Ionicons name="bulb-outline" size={compact ? 14 : 16} color={Kinetic.primary} />
      </View>
      <View style={styles.copyWrap}>
        <ThemedText style={[styles.title, compact && styles.titleCompact]}>{title}</ThemedText>
        <ThemedText style={[styles.message, compact && styles.messageCompact]}>{message}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.cardBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  wrapCompact: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  iconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: TransitTheme.panel.cardBgActive,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  copyWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: Kinetic.onSurface,
    fontSize: 13,
    fontWeight: "700",
  },
  titleCompact: {
    fontSize: 12,
  },
  message: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 12,
    lineHeight: 16,
  },
  messageCompact: {
    fontSize: 11,
    lineHeight: 14,
  },
});
