import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Colors, Kinetic, TransitTheme } from "@/constants/theme";
import { useLanguage } from "@/hooks/LanguageContext";
import {
  useRoutingPreferences,
  useSetRoutingPreferencesMutation,
} from "@/hooks/useBusApi";
import { hapticLight, hapticSelection, hapticSuccess } from "@/utils/haptics";

type WalkingComfort = "low" | "medium" | "high";
type TransferSetting = "none" | "one" | "two" | "flexible";
type WalkingPace = "slow" | "normal" | "fast";
type SearchBreadth = "compact" | "balanced" | "wide";

const WALKING_COMFORT_OPTIONS: Record<
  WalkingComfort,
  { maxWalkingDistanceM: number; maxTotalWalkingDistanceM: number }
> = {
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

type OptionChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

function OptionChip({ label, selected, onPress }: OptionChipProps) {
  return (
    <TouchableOpacity
      style={[styles.optionChip, selected && styles.optionChipSelected]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <ThemedText style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>
        {label}
      </ThemedText>
    </TouchableOpacity>
  );
}

type RoutePreferencesModalProps = {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export function RoutePreferencesModal({
  visible,
  onClose,
  onSaved,
}: RoutePreferencesModalProps) {
  const { t } = useLanguage();
  const routingPreferencesQuery = useRoutingPreferences();
  const setRoutingPreferencesMutation = useSetRoutingPreferencesMutation();

  const [preferenceWeights, setPreferenceWeights] = useState({
    speed: 1,
    crowding: 1,
    price: 1,
    transfer: 1,
    walking: 1,
  });
  const [walkingComfort, setWalkingComfort] = useState<WalkingComfort>("medium");
  const [transferSetting, setTransferSetting] = useState<TransferSetting>("flexible");
  const [walkingPace, setWalkingPace] = useState<WalkingPace>("normal");
  const [searchBreadth, setSearchBreadth] = useState<SearchBreadth>("balanced");

  useEffect(() => {
    if (!visible) {
      return;
    }

    const data = routingPreferencesQuery.data;
    if (!data) {
      return;
    }

    setPreferenceWeights(data.preferences);
    setWalkingComfort(deriveWalkingComfort(data.options.maxWalkingDistanceM));
    setTransferSetting(deriveTransferSetting(data.options.maxBusTransfers));
    setWalkingPace(deriveWalkingPace(data.options.walkingSpeedMps));
    setSearchBreadth(deriveSearchBreadth(data.options.maxWalkingNeighbors));
  }, [visible, routingPreferencesQuery.data]);

  const payload = useMemo(() => {
    const selectedWalking = WALKING_COMFORT_OPTIONS[walkingComfort];

    return {
      preferences: preferenceWeights,
      options: {
        maxWalkingDistanceM: selectedWalking.maxWalkingDistanceM,
        maxTotalWalkingDistanceM: selectedWalking.maxTotalWalkingDistanceM,
        maxWalkingNeighbors: SEARCH_BREADTH_OPTIONS[searchBreadth],
        maxBusTransfers: TRANSFER_OPTIONS[transferSetting],
        walkingSpeedMps: WALKING_PACE_OPTIONS[walkingPace],
      },
    };
  }, [preferenceWeights, searchBreadth, transferSetting, walkingComfort, walkingPace]);

  const savePreferences = async () => {
    hapticLight();
    await setRoutingPreferencesMutation.mutateAsync(payload);
    hapticSuccess();
    onSaved?.();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View>
              <ThemedText style={styles.title}>{t("prefModal.title")}</ThemedText>
              <ThemedText style={styles.subtitle}>{t("prefModal.subtitle")}</ThemedText>
            </View>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => {
                hapticSelection();
                onClose();
              }}
            >
              <Ionicons name="close" size={18} color={Kinetic.onSurface} />
            </TouchableOpacity>
          </View>

          {routingPreferencesQuery.isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={Kinetic.primary} />
              <ThemedText style={styles.loadingText}>{t("prefModal.loading")}</ThemedText>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <ThemedText style={styles.sectionTitle}>{t("prefModal.walkingTolerance")}</ThemedText>
                  <ThemedText style={styles.sectionDescription}>{t("prefModal.walkingDescription")}</ThemedText>
                </View>
                <View style={styles.optionWrap}>
                  <OptionChip label={t("prefModal.walking.low")} selected={walkingComfort === "low"} onPress={() => { hapticSelection(); setWalkingComfort("low"); }} />
                  <OptionChip label={t("prefModal.walking.medium")} selected={walkingComfort === "medium"} onPress={() => { hapticSelection(); setWalkingComfort("medium"); }} />
                  <OptionChip label={t("prefModal.walking.high")} selected={walkingComfort === "high"} onPress={() => { hapticSelection(); setWalkingComfort("high"); }} />
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <ThemedText style={styles.sectionTitle}>{t("prefModal.transferLimit")}</ThemedText>
                  <ThemedText style={styles.sectionDescription}>{t("prefModal.transferDescription")}</ThemedText>
                </View>
                <View style={styles.optionWrap}>
                  <OptionChip label={t("prefModal.transfer.none")} selected={transferSetting === "none"} onPress={() => { hapticSelection(); setTransferSetting("none"); }} />
                  <OptionChip label={t("prefModal.transfer.one")} selected={transferSetting === "one"} onPress={() => { hapticSelection(); setTransferSetting("one"); }} />
                  <OptionChip label={t("prefModal.transfer.two")} selected={transferSetting === "two"} onPress={() => { hapticSelection(); setTransferSetting("two"); }} />
                  <OptionChip label={t("prefModal.transfer.flexible")} selected={transferSetting === "flexible"} onPress={() => { hapticSelection(); setTransferSetting("flexible"); }} />
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <ThemedText style={styles.sectionTitle}>{t("prefModal.walkingPace")}</ThemedText>
                  <ThemedText style={styles.sectionDescription}>{t("prefModal.paceDescription")}</ThemedText>
                </View>
                <View style={styles.optionWrap}>
                  <OptionChip label={t("prefModal.pace.slow")} selected={walkingPace === "slow"} onPress={() => { hapticSelection(); setWalkingPace("slow"); }} />
                  <OptionChip label={t("prefModal.pace.normal")} selected={walkingPace === "normal"} onPress={() => { hapticSelection(); setWalkingPace("normal"); }} />
                  <OptionChip label={t("prefModal.pace.fast")} selected={walkingPace === "fast"} onPress={() => { hapticSelection(); setWalkingPace("fast"); }} />
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <ThemedText style={styles.sectionTitle}>{t("prefModal.searchBreadth")}</ThemedText>
                  <ThemedText style={styles.sectionDescription}>{t("prefModal.breadthDescription")}</ThemedText>
                </View>
                <View style={styles.optionWrap}>
                  <OptionChip label={t("prefModal.breadth.compact")} selected={searchBreadth === "compact"} onPress={() => { hapticSelection(); setSearchBreadth("compact"); }} />
                  <OptionChip label={t("prefModal.breadth.balanced")} selected={searchBreadth === "balanced"} onPress={() => { hapticSelection(); setSearchBreadth("balanced"); }} />
                  <OptionChip label={t("prefModal.breadth.wide")} selected={searchBreadth === "wide"} onPress={() => { hapticSelection(); setSearchBreadth("wide"); }} />
                </View>
              </View>
            </ScrollView>
          )}

          <View style={styles.footerRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.secondaryButton]}
              onPress={() => {
                hapticSelection();
                onClose();
              }}
              disabled={setRoutingPreferencesMutation.isPending}
            >
              <ThemedText style={styles.secondaryButtonText}>{t("prefModal.cancel")}</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.primaryButton]}
              onPress={() => {
                void savePreferences();
              }}
              disabled={setRoutingPreferencesMutation.isPending}
            >
              {setRoutingPreferencesMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.background} />
              ) : (
                <ThemedText style={styles.primaryButtonText}>{t("prefModal.save")}</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.56)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  card: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "82%",
    borderRadius: 18,
    backgroundColor: TransitTheme.panel.bg,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    padding: 12,
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: TransitTheme.panel.title,
    fontSize: 17,
    fontWeight: "800",
  },
  subtitle: {
    color: TransitTheme.panel.caption,
    fontSize: 12,
    marginTop: 2,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: TransitTheme.panel.iconButtonBg,
  },
  loadingWrap: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    color: TransitTheme.panel.caption,
    fontSize: 12,
  },
  content: {
    gap: 9,
    paddingBottom: 2,
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.cardBg,
    padding: 9,
    gap: 7,
  },
  sectionHeader: {
    gap: 1,
  },
  sectionTitle: {
    color: TransitTheme.panel.title,
    fontSize: 12,
    fontWeight: "800",
  },
  sectionDescription: {
    color: TransitTheme.panel.caption,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600",
  },
  optionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  optionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.iconButtonBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  optionChipSelected: {
    borderColor: Kinetic.primary,
    backgroundColor: TransitTheme.panel.cardBgActive,
  },
  optionChipText: {
    color: TransitTheme.panel.caption,
    fontSize: 11,
    fontWeight: "700",
  },
  optionChipTextSelected: {
    color: TransitTheme.panel.title,
  },
  footerRow: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.cardBg,
  },
  secondaryButtonText: {
    color: TransitTheme.panel.title,
    fontSize: 13,
    fontWeight: "700",
  },
  primaryButton: {
    backgroundColor: Kinetic.primary,
  },
  primaryButtonText: {
    color: Colors.dark.background,
    fontSize: 13,
    fontWeight: "800",
  },
});
