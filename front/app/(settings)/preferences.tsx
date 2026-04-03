import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Kinetic } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { useRoutePlanning } from "@/hooks/RoutePlanningContext";

type PreferenceKey = "speed" | "crowding" | "price" | "transfer" | "walking";

type PreferenceCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  onChange: (value: number) => void;
  emphasis?: "primary" | "neutral";
};

function PreferenceCard({
  icon,
  label,
  value,
  onChange,
  emphasis = "neutral",
}: PreferenceCardProps) {
  return (
    <View
      style={[
        styles.preferenceCard,
        emphasis === "primary"
          ? styles.preferenceCardPrimary
          : styles.preferenceCardNeutral,
      ]}
    >
      <View style={styles.preferenceHeader}>
        <View style={styles.preferenceIconWrap}>
          <Ionicons
            name={icon}
            size={18}
            color={
              emphasis === "primary"
                ? Kinetic.primary
                : Kinetic.onSurfaceVariant
            }
          />
        </View>
        <ThemedText style={styles.preferenceValue}>{value}</ThemedText>
      </View>
      <ThemedText style={styles.preferenceLabel}>{label}</ThemedText>
      <View style={styles.sliderControl}>
        <TouchableOpacity
          style={styles.stepButton}
          onPress={() => onChange(value - 5)}
          activeOpacity={0.85}
        >
          <Ionicons name="remove" size={16} color={Kinetic.primary} />
        </TouchableOpacity>
        <View style={styles.sliderTrackWrap}>
          <View style={styles.sliderTrackRow}>
            <View style={[styles.sliderProgress, { flex: value }]} />
            <View style={[styles.sliderRemain, { flex: 100 - value }]} />
          </View>
        </View>
        <TouchableOpacity
          style={styles.stepButton}
          onPress={() => onChange(value + 5)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={16} color={Kinetic.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function PreferencesScreen() {
  const router = useRouter();
  const { preferences, updatePreference } = useRoutePlanning();
  const insets = useSafeAreaInsets();

  const update = (key: PreferenceKey) => (value: number) => {
    updatePreference(key, value);
  };

  return (
    <View style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 10) + 12,
            paddingBottom: Math.max(insets.bottom, 20) + 20,
          },
        ]}
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.85}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={21} color={Kinetic.primary} />
          </TouchableOpacity>
          <ThemedText style={styles.topTitle}>Preferences</ThemedText>
        </View>

        <View style={styles.heroBlock}>
          <ThemedText style={styles.heroLabel}>Customization</ThemedText>
          <ThemedText style={styles.heroTitle}>Routing Weights</ThemedText>
          <ThemedText style={styles.heroSubtitle}>
            Fine-tune how we calculate your journeys. Prioritize what matters
            most.
          </ThemedText>
        </View>

        <PreferenceCard
          icon="flash"
          label="Speed"
          value={preferences.speed}
          onChange={update("speed")}
          emphasis="primary"
        />
        <PreferenceCard
          icon="people"
          label="Avoid Crowds"
          value={preferences.crowding}
          onChange={update("crowding")}
        />
        <PreferenceCard
          icon="card"
          label="Price Sensitivity"
          value={preferences.price}
          onChange={update("price")}
          emphasis="primary"
        />
        <PreferenceCard
          icon="git-branch"
          label="Fewer Transfers"
          value={preferences.transfer}
          onChange={update("transfer")}
        />
        <PreferenceCard
          icon="walk"
          label="Walking Distance"
          value={preferences.walking}
          onChange={update("walking")}
          emphasis="primary"
        />

        <TouchableOpacity
          style={styles.applyButton}
          onPress={() => router.back()}
          activeOpacity={0.9}
        >
          <ThemedText style={styles.applyButtonText}>
            Apply Preferences
          </ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Kinetic.surfaceLow,
  },
  content: {
    paddingHorizontal: 22,
    gap: 16,
  },
  topBar: {
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: Kinetic.onSurface,
    marginLeft: 8,
  },
  heroBlock: {
    gap: 4,
    marginBottom: 4,
  },
  heroLabel: {
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: Kinetic.primary,
    fontWeight: "700",
    fontSize: 12,
  },
  heroTitle: {
    color: Kinetic.onSurface,
    fontSize: 44,
    lineHeight: 44,
    fontWeight: "900",
    letterSpacing: -1.2,
  },
  heroSubtitle: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 16,
    fontWeight: "500",
    maxWidth: 320,
  },
  preferenceCard: {
    borderRadius: 22,
    padding: 18,
    gap: 12,
  },
  preferenceCardPrimary: {
    backgroundColor: "#FFFFFF",
  },
  preferenceCardNeutral: {
    backgroundColor: Kinetic.surfaceContainer,
  },
  preferenceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  preferenceIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#dde1ff",
    alignItems: "center",
    justifyContent: "center",
  },
  preferenceValue: {
    color: "#b8c3e3",
    fontSize: 44,
    lineHeight: 40,
    fontWeight: "900",
    letterSpacing: -1,
  },
  preferenceLabel: {
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontSize: 11,
    color: Kinetic.onSurfaceVariant,
    fontWeight: "700",
  },
  sliderControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stepButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  sliderTrackWrap: {
    flex: 1,
    justifyContent: "center",
    height: 28,
  },
  sliderTrackRow: {
    flexDirection: "row",
    height: 8,
    borderRadius: 6,
    overflow: "hidden",
  },
  sliderProgress: {
    height: 8,
    backgroundColor: "rgba(0, 62, 199, 0.25)",
  },
  sliderRemain: {
    height: 8,
    backgroundColor: Kinetic.surfaceContainer,
  },
  applyButton: {
    marginTop: 6,
    height: 58,
    borderRadius: 20,
    backgroundColor: Kinetic.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  applyButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 26,
    lineHeight: 26,
    letterSpacing: -0.5,
  },
});
