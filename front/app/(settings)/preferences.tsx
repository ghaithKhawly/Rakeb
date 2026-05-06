import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HintBanner } from "@/components/ui/HintBanner";
import { Collapsible } from "@/components/ui/collapsible";
import { ThemedText } from "@/components/themed-text";
import { SettingsTopBar } from "@/components/settings/SettingsTopBar";
import { Kinetic, TransitTheme } from "@/constants/theme";
import { useLanguage } from "@/hooks/LanguageContext";
import {
  useRoutingPreferences,
  useSetRoutingPreferencesMutation,
} from "@/hooks/useBusApi";
import { hapticLight, hapticSelection, hapticSuccess } from "@/utils/haptics";
import { goBackOrHome } from "@/utils/navigation";

type RoutingProfile =
  | "balanced"
  | "fastest"
  | "fewestTransfers"
  | "lessWalking"
  | "cheapest"
  | "lessCrowded";

type WalkingComfort = "low" | "medium" | "high";
type TransferSetting = "none" | "one" | "two" | "flexible";
type WalkingPace = "slow" | "normal" | "fast";
type SearchBreadth = "compact" | "balanced" | "wide";

const PROFILE_WEIGHTS: Record<
  RoutingProfile,
  { speed: number; crowding: number; price: number; transfer: number; walking: number }
> = {
  balanced: { speed: 1, crowding: 1, price: 1, transfer: 1, walking: 1 },
  fastest: { speed: 2, crowding: 0.8, price: 0.8, transfer: 1.2, walking: 0.8 },
  fewestTransfers: { speed: 1.1, crowding: 0.8, price: 0.8, transfer: 2, walking: 1.1 },
  lessWalking: { speed: 1, crowding: 0.8, price: 0.8, transfer: 1.3, walking: 2 },
  cheapest: { speed: 0.9, crowding: 0.8, price: 2, transfer: 1, walking: 1 },
  lessCrowded: { speed: 1, crowding: 2, price: 0.8, transfer: 1, walking: 1 },
};

function normalizePreferenceWeights(weights: {
  speed: number;
  crowding: number;
  price: number;
  transfer: number;
  walking: number;
}) {
  const sum =
    Math.max(0, weights.speed) +
    Math.max(0, weights.crowding) +
    Math.max(0, weights.price) +
    Math.max(0, weights.transfer) +
    Math.max(0, weights.walking);

  if (sum <= 0) {
    return { speed: 0.2, crowding: 0.2, price: 0.2, transfer: 0.2, walking: 0.2 };
  }

  return {
    speed: Math.max(0, weights.speed) / sum,
    crowding: Math.max(0, weights.crowding) / sum,
    price: Math.max(0, weights.price) / sum,
    transfer: Math.max(0, weights.transfer) / sum,
    walking: Math.max(0, weights.walking) / sum,
  };
}

const WALKING_COMFORT_OPTIONS: Record<WalkingComfort, { maxWalkingDistanceM: number; maxTotalWalkingDistanceM: number }> = {
  low: { maxWalkingDistanceM: 300, maxTotalWalkingDistanceM: 700 },
  medium: { maxWalkingDistanceM: 800, maxTotalWalkingDistanceM: 1700 },
  high: { maxWalkingDistanceM: 1500, maxTotalWalkingDistanceM: 3200 },
};

const TRANSFER_OPTIONS: Record<TransferSetting, number> = {
  none: 0,
  one: 1,
  two: 2,
  flexible: 4,
};

const WALKING_PACE_OPTIONS: Record<WalkingPace, number> = {
  slow: 1.0,
  normal: 1.25,
  fast: 1.5,
};

const SEARCH_BREADTH_OPTIONS: Record<SearchBreadth, number> = {
  compact: 8,
  balanced: 12,
  wide: 18,
};

const ROUTE_GOAL_OPTIONS: Array<{
  value: RoutingProfile;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    value: "balanced",
    title: "Best balance",
    subtitle: "Keep time, comfort, transfers, and price evenly weighted.",
    icon: "sparkles-outline",
  },
  {
    value: "fastest",
    title: "Fastest route",
    subtitle: "Prefer the shortest total travel time.",
    icon: "flash-outline",
  },
  {
    value: "fewestTransfers",
    title: "Fewer transfers",
    subtitle: "Favor routes with fewer bus changes.",
    icon: "git-branch-outline",
  },
  {
    value: "lessWalking",
    title: "Less walking",
    subtitle: "Prefer routes with shorter walks.",
    icon: "walk-outline",
  },
  {
    value: "cheapest",
    title: "Cheapest trip",
    subtitle: "Prefer lower-cost routes when possible.",
    icon: "card-outline",
  },
  {
    value: "lessCrowded",
    title: "Less crowded",
    subtitle: "Favor routes that avoid crowded segments.",
    icon: "people-outline",
  },
];

const WALKING_COMFORT_CHOICES: Array<{
  value: WalkingComfort;
  title: string;
  subtitle: string;
}> = [
  {
    value: "low",
    title: "Short walks",
    subtitle: "Keep each walk short.",
  },
  {
    value: "medium",
    title: "Balanced",
    subtitle: "Allow a middle amount of walking.",
  },
  {
    value: "high",
    title: "Longer walks",
    subtitle: "Allow longer walks when they help the trip.",
  },
];

const TRANSFER_CHOICES: Array<{ value: TransferSetting; title: string; subtitle: string }> = [
  { value: "none", title: "No transfers", subtitle: "Only direct bus routes." },
  { value: "one", title: "Up to 1 transfer", subtitle: "Allow one bus change." },
  { value: "two", title: "Up to 2 transfers", subtitle: "Allow two bus changes." },
  { value: "flexible", title: "Flexible", subtitle: "Allow more changes if needed." },
];

const WALKING_PACE_CHOICES: Array<{ value: WalkingPace; title: string; subtitle: string }> = [
  { value: "slow", title: "Slow", subtitle: "Treat walking time as slower." },
  { value: "normal", title: "Normal", subtitle: "Use a middle walking speed." },
  { value: "fast", title: "Fast", subtitle: "Treat walking time as faster." },
];

const SEARCH_BREADTH_CHOICES: Array<{
  value: SearchBreadth;
  title: string;
  subtitle: string;
}> = [
  {
    value: "compact",
    title: "Compact",
    subtitle: "Check fewer nearby options.",
  },
  {
    value: "balanced",
    title: "Balanced",
    subtitle: "Use the default search depth.",
  },
  {
    value: "wide",
    title: "Wide",
    subtitle: "Check more nearby options.",
  },
];

function nearestProfile(weights: { speed: number; crowding: number; price: number; transfer: number; walking: number }): RoutingProfile {
  const normalizedInput = normalizePreferenceWeights(weights);
  const entries = Object.entries(PROFILE_WEIGHTS) as Array<[RoutingProfile, (typeof PROFILE_WEIGHTS)[RoutingProfile]]>;
  let bestProfile: RoutingProfile = "balanced";
  let bestScore = Number.POSITIVE_INFINITY;

  for (const [profile, target] of entries) {
    const normalizedTarget = normalizePreferenceWeights(target);
    const score =
      Math.abs(normalizedTarget.speed - normalizedInput.speed) +
      Math.abs(normalizedTarget.crowding - normalizedInput.crowding) +
      Math.abs(normalizedTarget.price - normalizedInput.price) +
      Math.abs(normalizedTarget.transfer - normalizedInput.transfer) +
      Math.abs(normalizedTarget.walking - normalizedInput.walking);

    if (score < bestScore) {
      bestScore = score;
      bestProfile = profile;
    }
  }

  return bestProfile;
}

function deriveWalkingComfort(maxWalkingDistanceM: number): WalkingComfort {
  if (maxWalkingDistanceM <= 450) return "low";
  if (maxWalkingDistanceM <= 1100) return "medium";
  return "high";
}

function deriveTransferSetting(maxBusTransfers: number): TransferSetting {
  if (maxBusTransfers <= 0) return "none";
  if (maxBusTransfers === 1) return "one";
  if (maxBusTransfers === 2) return "two";
  return "flexible";
}

function deriveWalkingPace(walkingSpeedMps: number): WalkingPace {
  if (walkingSpeedMps <= 1.1) return "slow";
  if (walkingSpeedMps >= 1.4) return "fast";
  return "normal";
}

function deriveSearchBreadth(maxWalkingNeighbors: number): SearchBreadth {
  if (maxWalkingNeighbors <= 9) return "compact";
  if (maxWalkingNeighbors >= 15) return "wide";
  return "balanced";
}

type SelectableCardProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  selected: boolean;
  isRTL: boolean;
  onPress: () => void;
};

function SelectableCard({ icon, title, subtitle, selected, isRTL, onPress }: SelectableCardProps) {
  return (
    <TouchableOpacity
      style={[
        styles.goalCard,
        selected && styles.goalCardSelected,
        isRTL && styles.goalCardRtl,
      ]}
      onPress={onPress}
      activeOpacity={0.86}
    >
      <View style={[styles.goalCardRow, isRTL && styles.goalCardRowRtl]}>
        {icon ? (
          <View style={[styles.goalIconWrap, selected && styles.goalIconWrapSelected]}>
            <Ionicons
              name={icon}
              size={18}
              color={selected ? Kinetic.primary : Kinetic.onSurfaceVariant}
            />
          </View>
        ) : null}

        <View style={[styles.goalCopy, isRTL && styles.goalCopyRtl]}>
          <ThemedText style={[styles.goalTitle, isRTL && styles.textRtl]}>{title}</ThemedText>
          {subtitle ? (
            <ThemedText style={[styles.goalSubtitle, isRTL && styles.textRtl]}>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>

        <Ionicons
          name={selected ? "checkmark-circle" : "ellipse-outline"}
          size={19}
          color={selected ? Kinetic.primary : Kinetic.onSurfaceVariant}
        />
      </View>
    </TouchableOpacity>
  );
}

type ChipProps = {
  title: string;
  subtitle?: string;
  selected: boolean;
  isRTL: boolean;
  onPress: () => void;
};

function Chip({ title, subtitle, selected, isRTL, onPress }: ChipProps) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected, isRTL && styles.chipRtl]}
      onPress={onPress}
      activeOpacity={0.86}
    >
      <ThemedText style={[styles.chipTitle, selected && styles.chipTitleSelected, isRTL && styles.textRtl]}>
        {title}
      </ThemedText>
      {subtitle ? (
        <ThemedText
          style={[styles.chipSubtitle, selected && styles.chipSubtitleSelected, isRTL && styles.textRtl]}
          numberOfLines={2}
        >
          {subtitle}
        </ThemedText>
      ) : null}
    </TouchableOpacity>
  );
}

type PreferenceGroupProps = {
  title: string;
  subtitle: string;
  isRTL: boolean;
  children: React.ReactNode;
};

function PreferenceGroup({ title, subtitle, isRTL, children }: PreferenceGroupProps) {
  return (
    <View style={styles.group}>
      <View style={[styles.groupHeader, isRTL && styles.groupHeaderRtl]}>
        <ThemedText style={[styles.groupTitle, isRTL && styles.textRtl]}>{title}</ThemedText>
        <ThemedText style={[styles.groupSubtitle, isRTL && styles.textRtl]}>{subtitle}</ThemedText>
      </View>
      <View style={styles.groupContent}>{children}</View>
    </View>
  );
}

type SectionHeaderProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  isRTL: boolean;
};

function SectionHeader({ icon, title, subtitle, isRTL }: SectionHeaderProps) {
  return (
    <View style={[styles.sectionHeader, isRTL && styles.sectionHeaderRtl]}>
      <View style={styles.sectionIconWrap}>
        <Ionicons name={icon} size={18} color={Kinetic.primary} />
      </View>
      <View style={[styles.sectionCopy, isRTL && styles.sectionCopyRtl]}>
        <ThemedText style={[styles.sectionTitle, isRTL && styles.textRtl]}>{title}</ThemedText>
        <ThemedText style={[styles.sectionSubtitle, isRTL && styles.textRtl]}>{subtitle}</ThemedText>
      </View>
    </View>
  );
}

export default function PreferencesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isRTL, t } = useLanguage();

  const routingPreferencesQuery = useRoutingPreferences();
  const setRoutingPreferencesMutation = useSetRoutingPreferencesMutation();

  const [profile, setProfile] = useState<RoutingProfile>("balanced");
  const [walkingComfort, setWalkingComfort] = useState<WalkingComfort>("medium");
  const [transferSetting, setTransferSetting] = useState<TransferSetting>("flexible");
  const [walkingPace, setWalkingPace] = useState<WalkingPace>("normal");
  const [searchBreadth, setSearchBreadth] = useState<SearchBreadth>("balanced");

  useEffect(() => {
    const data = routingPreferencesQuery.data;
    if (!data) return;

    setProfile(nearestProfile(data.preferences));
    setWalkingComfort(deriveWalkingComfort(data.options.maxWalkingDistanceM));
    setTransferSetting(deriveTransferSetting(data.options.maxBusTransfers));
    setWalkingPace(deriveWalkingPace(data.options.walkingSpeedMps));
    setSearchBreadth(deriveSearchBreadth(data.options.maxWalkingNeighbors));
  }, [routingPreferencesQuery.data]);

  const payload = useMemo(() => {
    const selectedWeights = PROFILE_WEIGHTS[profile];
    const selectedWalking = WALKING_COMFORT_OPTIONS[walkingComfort];

    return {
      preferences: {
        speed: selectedWeights.speed,
        crowding: selectedWeights.crowding,
        price: selectedWeights.price,
        transfer: selectedWeights.transfer,
        walking: selectedWeights.walking,
      },
      options: {
        maxWalkingDistanceM: selectedWalking.maxWalkingDistanceM,
        maxTotalWalkingDistanceM: selectedWalking.maxTotalWalkingDistanceM,
        maxWalkingNeighbors: SEARCH_BREADTH_OPTIONS[searchBreadth],
        maxBusTransfers: TRANSFER_OPTIONS[transferSetting],
        walkingSpeedMps: WALKING_PACE_OPTIONS[walkingPace],
      },
    };
  }, [profile, searchBreadth, transferSetting, walkingComfort, walkingPace]);

  const isLoading = routingPreferencesQuery.isLoading;
  const isSaving = setRoutingPreferencesMutation.isPending;

  const selectProfile = (value: RoutingProfile) => {
    if (profile !== value) {
      hapticSelection();
      setProfile(value);
    }
  };

  const selectWalkingComfort = (value: WalkingComfort) => {
    if (walkingComfort !== value) {
      hapticSelection();
      setWalkingComfort(value);
    }
  };

  const selectTransferSetting = (value: TransferSetting) => {
    if (transferSetting !== value) {
      hapticSelection();
      setTransferSetting(value);
    }
  };

  const selectWalkingPace = (value: WalkingPace) => {
    if (walkingPace !== value) {
      hapticSelection();
      setWalkingPace(value);
    }
  };

  const selectSearchBreadth = (value: SearchBreadth) => {
    if (searchBreadth !== value) {
      hapticSelection();
      setSearchBreadth(value);
    }
  };

  const savePreferences = async () => {
    hapticLight();
    try {
      await setRoutingPreferencesMutation.mutateAsync(payload);
      hapticSuccess();
      goBackOrHome(router);
    } catch {
      // The mutation state already drives the error banner.
    }
  };

  return (
    <View style={[styles.safeArea, isRTL && styles.safeAreaRtl]}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.bottom + 12 : 20}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: Math.max(insets.top, 10) + 12,
              paddingBottom: Math.max(insets.bottom, 20) + 22,
            },
          ]}
        >
          <SettingsTopBar
            title={t("preferences.title")}
            onBack={() => goBackOrHome(router)}
            isRTL={isRTL}
          />

          <View style={styles.heroBlock}>
            <ThemedText style={[styles.heroTitle, isRTL && styles.textRtl]}>Trip options</ThemedText>
            <ThemedText style={[styles.heroSubtitle, isRTL && styles.textRtl]}>
              Choose the tradeoffs you want the router to favor.
            </ThemedText>
          </View>

          <HintBanner
            title="How this works"
            message="Pick one route goal, then tune comfort and advanced search settings if you need more control."
          />

          {isLoading ? (
            <View style={[styles.loadingState, isRTL && styles.loadingStateRtl]}>
              <ActivityIndicator size="small" color={Kinetic.primary} />
              <ThemedText style={[styles.loadingText, isRTL && styles.textRtl]}>
                Loading saved options...
              </ThemedText>
            </View>
          ) : null}

          <View style={styles.sectionCard}>
            <SectionHeader
              icon="options-outline"
              title="Route goal"
              subtitle="Choose the main thing the router should favor."
              isRTL={isRTL}
            />
            <View style={[styles.goalGrid, isRTL && styles.goalGridRtl]}>
              {ROUTE_GOAL_OPTIONS.map((option) => (
                <SelectableCard
                  key={option.value}
                  icon={option.icon}
                  title={option.title}
                  subtitle={option.subtitle}
                  selected={profile === option.value}
                  isRTL={isRTL}
                  onPress={() => selectProfile(option.value)}
                />
              ))}
            </View>
          </View>

          <View style={styles.sectionCard}>
            <SectionHeader
              icon="walk-outline"
              title="Comfort and transfer"
              subtitle="Set how much walking and how many changes feel okay."
              isRTL={isRTL}
            />

            <PreferenceGroup
              title="Walking comfort"
              subtitle="How much walking feels acceptable."
              isRTL={isRTL}
            >
              <View style={styles.chipWrap}>
                {WALKING_COMFORT_CHOICES.map((option) => (
                  <Chip
                    key={option.value}
                    title={option.title}
                    subtitle={option.subtitle}
                    selected={walkingComfort === option.value}
                    isRTL={isRTL}
                    onPress={() => selectWalkingComfort(option.value)}
                  />
                ))}
              </View>
            </PreferenceGroup>

            <PreferenceGroup
              title="Transfers"
              subtitle="How many bus changes you are comfortable with."
              isRTL={isRTL}
            >
              <View style={styles.chipWrap}>
                {TRANSFER_CHOICES.map((option) => (
                  <Chip
                    key={option.value}
                    title={option.title}
                    subtitle={option.subtitle}
                    selected={transferSetting === option.value}
                    isRTL={isRTL}
                    onPress={() => selectTransferSetting(option.value)}
                  />
                ))}
              </View>
            </PreferenceGroup>
          </View>

          <Collapsible
            title="Advanced"
            subtitle="More technical search controls are tucked away here."
            icon="construct-outline"
            isRTL={isRTL}
          >
            <PreferenceGroup
              title="Walking pace"
              subtitle="How fast the route should count walking time."
              isRTL={isRTL}
            >
              <View style={styles.chipWrap}>
                {WALKING_PACE_CHOICES.map((option) => (
                  <Chip
                    key={option.value}
                    title={option.title}
                    subtitle={option.subtitle}
                    selected={walkingPace === option.value}
                    isRTL={isRTL}
                    onPress={() => selectWalkingPace(option.value)}
                  />
                ))}
              </View>
            </PreferenceGroup>

            <PreferenceGroup
              title="Search breadth"
              subtitle="How many nearby stops the router should explore."
              isRTL={isRTL}
            >
              <View style={styles.chipWrap}>
                {SEARCH_BREADTH_CHOICES.map((option) => (
                  <Chip
                    key={option.value}
                    title={option.title}
                    subtitle={option.subtitle}
                    selected={searchBreadth === option.value}
                    isRTL={isRTL}
                    onPress={() => selectSearchBreadth(option.value)}
                  />
                ))}
              </View>
            </PreferenceGroup>
          </Collapsible>

          {setRoutingPreferencesMutation.isError ? (
            <ThemedText style={[styles.errorText, isRTL && styles.textRtl]}>
              Failed to save preferences. Please try again.
            </ThemedText>
          ) : null}

          <TouchableOpacity
            style={[styles.applyButton, isSaving && styles.applyButtonDisabled]}
            onPress={() => void savePreferences()}
            activeOpacity={0.9}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={Kinetic.state.onPrimary} />
            ) : (
              <ThemedText style={styles.applyButtonText}>{t("preferences.save")}</ThemedText>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Kinetic.surfaceLow },
  safeAreaRtl: { direction: "rtl" },
  keyboardAvoiding: { flex: 1 },
  content: { paddingHorizontal: 18, gap: 14 },
  heroBlock: { gap: 4, marginBottom: 2 },
  heroTitle: { color: Kinetic.onSurface, fontSize: 34, fontWeight: "900", letterSpacing: -0.8 },
  heroSubtitle: { color: Kinetic.onSurfaceVariant, fontSize: 14, lineHeight: 20 },
  loadingState: { flexDirection: "row", alignItems: "center", gap: 8 },
  loadingStateRtl: { flexDirection: "row-reverse" },
  loadingText: { color: Kinetic.onSurfaceVariant, fontSize: 12 },
  sectionCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.cardBg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 14,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionHeaderRtl: { flexDirection: "row-reverse" },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: TransitTheme.panel.cardBgActive,
    borderWidth: 1,
    borderColor: TransitTheme.panel.cardBgActive,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionCopy: { flex: 1, gap: 2 },
  sectionCopyRtl: { alignItems: "flex-end" },
  sectionTitle: { color: Kinetic.onSurface, fontSize: 20, fontWeight: "800", lineHeight: 24 },
  sectionSubtitle: { color: Kinetic.onSurfaceVariant, fontSize: 13, lineHeight: 18 },
  goalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  goalGridRtl: {
    flexDirection: "row-reverse",
  },
  goalCard: {
    width: "48%",
    minHeight: 112,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.cardBg,
    padding: 12,
  },
  goalCardSelected: {
    borderColor: Kinetic.primary,
    backgroundColor: TransitTheme.panel.cardBgActive,
  },
  goalCardRtl: {
    alignSelf: "stretch",
  },
  goalCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  goalCardRowRtl: {
    flexDirection: "row-reverse",
  },
  goalIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: TransitTheme.panel.bg,
  },
  goalIconWrapSelected: {
    backgroundColor: Kinetic.state.onPrimary,
  },
  goalCopy: { flex: 1, gap: 2 },
  goalCopyRtl: { alignItems: "flex-end" },
  goalTitle: { color: Kinetic.onSurface, fontSize: 16, fontWeight: "800", lineHeight: 20 },
  goalSubtitle: { color: Kinetic.onSurfaceVariant, fontSize: 12, lineHeight: 16 },
  group: { gap: 8 },
  groupHeader: { gap: 2 },
  groupHeaderRtl: { alignItems: "flex-end" },
  groupTitle: { color: Kinetic.onSurface, fontSize: 14, fontWeight: "800" },
  groupSubtitle: { color: Kinetic.onSurfaceVariant, fontSize: 12, lineHeight: 16 },
  groupContent: { gap: 10 },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexGrow: 1,
    flexBasis: "31%",
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.cardBg,
    paddingHorizontal: 11,
    paddingVertical: 10,
    justifyContent: "center",
    gap: 3,
  },
  chipRtl: {
    alignItems: "flex-end",
  },
  chipSelected: {
    borderColor: Kinetic.primary,
    backgroundColor: TransitTheme.panel.cardBgActive,
  },
  chipTitle: {
    color: Kinetic.onSurface,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
  },
  chipTitleSelected: {
    color: Kinetic.onSurface,
  },
  chipSubtitle: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 11,
    lineHeight: 14,
  },
  chipSubtitleSelected: {
    color: Kinetic.onSurfaceVariant,
  },
  errorText: { color: Kinetic.state.error, fontSize: 12, fontWeight: "600" },
  applyButton: {
    marginTop: 6,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: Kinetic.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  applyButtonDisabled: { opacity: 0.7 },
  applyButtonText: {
    color: Kinetic.state.onPrimary,
    fontWeight: "800",
    fontSize: 18,
    letterSpacing: -0.2,
  },
  textRtl: { textAlign: "right" },
});
