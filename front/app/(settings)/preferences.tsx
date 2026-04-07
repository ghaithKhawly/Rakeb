import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Kinetic } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import {
  useRoutingPreferences,
  useSetRoutingPreferencesMutation,
} from "@/hooks/useBusApi";

type PreferenceKey = "speed" | "crowding" | "price" | "transfer" | "walking";
type OptionKey =
  | "maxWalkingDistanceM"
  | "maxTotalWalkingDistanceM"
  | "maxWalkingNeighbors"
  | "maxBusTransfers"
  | "walkingSpeedMps";

type PreferenceState = Record<PreferenceKey, number>;
type OptionState = Record<OptionKey, number>;

const DEFAULT_PREFERENCES: PreferenceState = {
  speed: 0,
  crowding: 0,
  price: 0,
  transfer: 0,
  walking: 0,
};

const DEFAULT_OPTIONS: OptionState = {
  maxWalkingDistanceM: 50,
  maxTotalWalkingDistanceM: 10000,
  maxWalkingNeighbors: 100,
  maxBusTransfers: 10,
  walkingSpeedMps: 3.5,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type PreferenceCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  onChange: (value: number) => void;
  emphasis?: "primary" | "neutral";
};

type OptionCardProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
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

function OptionCard({ label, value, onChange, step }: OptionCardProps) {
  return (
    <View style={styles.optionCard}>
      <ThemedText style={styles.optionLabel}>{label}</ThemedText>
      <View style={styles.optionValueRow}>
        <TouchableOpacity
          style={styles.optionStepButton}
          onPress={() => onChange(value - step)}
          activeOpacity={0.85}
        >
          <Ionicons name="remove" size={16} color={Kinetic.primary} />
        </TouchableOpacity>
        <ThemedText style={styles.optionValue}>{value}</ThemedText>
        <TouchableOpacity
          style={styles.optionStepButton}
          onPress={() => onChange(value + step)}
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
  const insets = useSafeAreaInsets();

  const routingPreferencesQuery = useRoutingPreferences();
  const setRoutingPreferencesMutation = useSetRoutingPreferencesMutation();

  const [preferences, setPreferences] =
    useState<PreferenceState>(DEFAULT_PREFERENCES);
  const [options, setOptions] = useState<OptionState>(DEFAULT_OPTIONS);

  useEffect(() => {
    const data = routingPreferencesQuery.data;
    if (!data) {
      return;
    }

    setPreferences({
      speed: Math.round(data.preferences.speed * 100),
      crowding: Math.round(data.preferences.crowding * 100),
      price: Math.round(data.preferences.price * 100),
      transfer: Math.round(data.preferences.transfer * 100),
      walking: Math.round(data.preferences.walking * 100),
    });

    setOptions({
      maxWalkingDistanceM: data.options.maxWalkingDistanceM,
      maxTotalWalkingDistanceM: data.options.maxTotalWalkingDistanceM,
      maxWalkingNeighbors: data.options.maxWalkingNeighbors,
      maxBusTransfers: data.options.maxBusTransfers,
      walkingSpeedMps: Number(data.options.walkingSpeedMps.toFixed(1)),
    });
  }, [routingPreferencesQuery.data]);

  const updatePreference = (key: PreferenceKey) => (value: number) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: clamp(Math.round(value), 0, 100),
    }));
  };

  const updateOption = (key: OptionKey) => (value: number) => {
    const next = (() => {
      if (key === "maxWalkingDistanceM") {
        return clamp(Math.round(value), 50, 2000);
      }
      if (key === "maxTotalWalkingDistanceM") {
        return clamp(Math.round(value), 0, 10000);
      }
      if (key === "maxWalkingNeighbors") {
        return clamp(Math.round(value), 1, 100);
      }
      if (key === "maxBusTransfers") {
        return clamp(Math.round(value), 0, 10);
      }
      return clamp(Number(value.toFixed(1)), 0.4, 3.5);
    })();

    setOptions((prev) => ({ ...prev, [key]: next }));
  };

  const applyPreferences = async () => {
    const payload = {
      preferences: {
        speed: preferences.speed,
        crowding: preferences.crowding,
        price: preferences.price,
        transfer: preferences.transfer,
        walking: preferences.walking,
      },
      options: {
        maxWalkingDistanceM: options.maxWalkingDistanceM,
        maxTotalWalkingDistanceM: options.maxTotalWalkingDistanceM,
        maxWalkingNeighbors: options.maxWalkingNeighbors,
        maxBusTransfers: options.maxBusTransfers,
        walkingSpeedMps: options.walkingSpeedMps,
      },
    };

    if (__DEV__) {
      console.log("[Preferences] save payload", payload);
    }

    const response = await setRoutingPreferencesMutation.mutateAsync(payload);

    if (__DEV__) {
      console.log("[Preferences] save response", response);
    }

    router.back();
  };

  const isLoading = routingPreferencesQuery.isLoading;
  const isSaving = setRoutingPreferencesMutation.isPending;

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
          <ThemedText style={styles.heroTitle}>Routing Preferences</ThemedText>
          <ThemedText style={styles.heroSubtitle}>
            Adjust and save weights/options used by routing.
          </ThemedText>
        </View>

        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="small" color={Kinetic.primary} />
            <ThemedText style={styles.loadingText}>
              Loading saved values...
            </ThemedText>
          </View>
        ) : null}

        <PreferenceCard
          icon="flash"
          label="Speed"
          value={preferences.speed}
          onChange={updatePreference("speed")}
          emphasis="primary"
        />
        <PreferenceCard
          icon="people"
          label="Avoid Crowds"
          value={preferences.crowding}
          onChange={updatePreference("crowding")}
        />
        <PreferenceCard
          icon="card"
          label="Price Sensitivity"
          value={preferences.price}
          onChange={updatePreference("price")}
          emphasis="primary"
        />
        <PreferenceCard
          icon="git-branch"
          label="Fewer Transfers"
          value={preferences.transfer}
          onChange={updatePreference("transfer")}
        />
        <PreferenceCard
          icon="walk"
          label="Walking"
          value={preferences.walking}
          onChange={updatePreference("walking")}
          emphasis="primary"
        />

        <ThemedText style={styles.sectionLabel}>Routing Options</ThemedText>
        <OptionCard
          label="Max Walking Distance (m)"
          value={options.maxWalkingDistanceM}
          onChange={updateOption("maxWalkingDistanceM")}
          step={50}
        />
        <OptionCard
          label="Max Total Walking Distance (m)"
          value={options.maxTotalWalkingDistanceM}
          onChange={updateOption("maxTotalWalkingDistanceM")}
          step={100}
        />
        <OptionCard
          label="Max Walking Neighbors"
          value={options.maxWalkingNeighbors}
          onChange={updateOption("maxWalkingNeighbors")}
          step={1}
        />
        <OptionCard
          label="Max Bus Transfers"
          value={options.maxBusTransfers}
          onChange={updateOption("maxBusTransfers")}
          step={1}
        />
        <OptionCard
          label="Walking Speed (m/s)"
          value={options.walkingSpeedMps}
          onChange={updateOption("walkingSpeedMps")}
          step={0.1}
        />

        {setRoutingPreferencesMutation.isError ? (
          <ThemedText style={styles.errorText}>
            Could not save preferences.
          </ThemedText>
        ) : null}

        <TouchableOpacity
          style={[styles.applyButton, isSaving && styles.applyButtonDisabled]}
          onPress={() => void applyPreferences()}
          activeOpacity={0.9}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <ThemedText style={styles.applyButtonText}>
              Save Preferences
            </ThemedText>
          )}
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
    fontSize: 40,
    lineHeight: 42,
    fontWeight: "900",
    letterSpacing: -1.2,
  },
  heroSubtitle: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 16,
    fontWeight: "500",
    maxWidth: 320,
  },
  loadingState: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 12,
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
  sectionLabel: {
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: Kinetic.onSurfaceVariant,
    fontWeight: "800",
    fontSize: 11,
    marginTop: 8,
  },
  optionCard: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  optionLabel: {
    color: Kinetic.onSurface,
    fontSize: 13,
    fontWeight: "700",
  },
  optionValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionStepButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Kinetic.surfaceContainer,
    alignItems: "center",
    justifyContent: "center",
  },
  optionValue: {
    color: Kinetic.onSurface,
    fontSize: 16,
    fontWeight: "800",
  },
  errorText: {
    color: "#BA1A1A",
    fontSize: 12,
    fontWeight: "600",
  },
  applyButton: {
    marginTop: 6,
    height: 58,
    borderRadius: 20,
    backgroundColor: Kinetic.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  applyButtonDisabled: {
    opacity: 0.7,
  },
  applyButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 22,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
});
