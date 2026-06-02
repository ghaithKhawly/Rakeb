import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Colors, Kinetic, TransitTheme } from "@/constants/theme";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ThemedText } from "@/components/themed-text";
import { useLanguage } from "@/hooks/LanguageContext";
import { hapticMedium, hapticSelection } from "@/utils/haptics";

type RouteFilterValue =
  | "balanced"
  | "fastest"
  | "fewestTransfers"
  | "lessWalking"
  | "cheapest"
  | "lessCrowded";

const FILTER_CHIPS: Array<{ key: RouteFilterValue; labelKey: string }> = [
  { key: "balanced", labelKey: "planner.filter.balanced" },
  { key: "fastest", labelKey: "planner.filter.fastest" },
  { key: "fewestTransfers", labelKey: "planner.filter.fewestTransfers" },
  { key: "lessWalking", labelKey: "planner.filter.lessWalking" },
  { key: "cheapest", labelKey: "planner.filter.cheapest" },
  { key: "lessCrowded", labelKey: "planner.filter.lessCrowded" },
];

type RoutePlannerControlsProps = {
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenPreferences: () => void;
  activeFilter: RouteFilterValue;
  onChangeFilter: (value: RouteFilterValue) => void;
  isUpdatingFilter: boolean;
  onRequestRoute: () => void;
  isRouting: boolean;
  onClearRoute: () => void;
  errorMessage: string | null;
  showActionButtons?: boolean;
  children?: React.ReactNode;
};

export function RoutePlannerControls({
  isCollapsed,
  onToggleCollapsed,
  onOpenPreferences,
  activeFilter,
  onChangeFilter,
  isUpdatingFilter,
  onRequestRoute,
  isRouting,
  onClearRoute,
  errorMessage,
  showActionButtons = true,
  children,
}: RoutePlannerControlsProps) {
  const { t } = useLanguage();
  const panelAnimation = useRef(new Animated.Value(isCollapsed ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(panelAnimation, {
      toValue: isCollapsed ? 0 : 1,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [isCollapsed, panelAnimation]);

  const panelMotionStyle = {
    opacity: panelAnimation,
    transform: [
      {
        translateY: panelAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [4, 0],
        }),
      },
    ],
  } as const;

  return (
    <>
      <View style={styles.sheetHeaderRow}>
        <View style={styles.titleCluster}>
          <View style={styles.titleIcon}>
            <Ionicons name="navigate-outline" size={15} color={Colors.dark.primary} />
          </View>
          <ThemedText type="defaultSemiBold" style={styles.title}>{t("planner.actions")}</ThemedText>
        </View>
        <View style={styles.sheetHeaderActions}>
          <TouchableOpacity
            style={styles.preferencesButton}
            onPress={() => {
              hapticSelection();
              onOpenPreferences();
            }}
          >
            <Ionicons name="options-outline" size={15} color={Colors.dark.primary} />
            <ThemedText style={styles.preferencesButtonText}>{t("planner.preferences")}</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sheetToggleButton}
            onPress={() => {
              hapticMedium();
              onToggleCollapsed();
            }}
          >
            <Ionicons
              name={isCollapsed ? "chevron-up" : "chevron-down"}
              size={18}
              color={Colors.dark.text}
            />
          </TouchableOpacity>
        </View>
      </View>

      <Animated.View
        pointerEvents={isCollapsed ? "none" : "auto"}
        style={[styles.panelBody, panelMotionStyle]}
      >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterWrap}
          >
            {FILTER_CHIPS.map((chip) => {
              const selected = activeFilter === chip.key;
              return (
                <TouchableOpacity
                  key={chip.key}
                  style={[styles.filterChip, selected && styles.filterChipSelected]}
                  onPress={() => {
                    if (!selected) {
                      hapticSelection();
                      onChangeFilter(chip.key);
                    }
                  }}
                  disabled={isUpdatingFilter || isRouting}
                  activeOpacity={0.85}
                >
                  <ThemedText
                    style={[styles.filterChipText, selected && styles.filterChipTextSelected]}
                  >
                    {t(chip.labelKey)}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {showActionButtons ? (
            <View style={styles.buttonRow}>
              <PrimaryButton
                title={t("planner.request")}
                variant="primary"
                loading={isRouting}
                icon={<Ionicons name="navigate" size={16} color={Colors.dark.background} />}
                onPress={onRequestRoute}
                style={styles.primaryButton}
                textStyle={styles.primaryButtonText}
                disabled={isUpdatingFilter}
              />

              <TouchableOpacity
                style={[
                  styles.clearButton,
                  (isRouting || isUpdatingFilter) && styles.clearButtonDisabled,
                ]}
                disabled={isRouting || isUpdatingFilter}
                onPress={() => {
                  hapticSelection();
                  onClearRoute();
                }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t("planner.clear")}
              >
                <Ionicons name="close" size={20} color={Colors.dark.text} />
              </TouchableOpacity>
            </View>
          ) : null}

          {children ? <View style={styles.contentSlot}>{children}</View> : null}

          {errorMessage ? (
            <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
          ) : null}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    color: TransitTheme.panel.title,
    fontSize: 15,
    fontWeight: "900",
  },
  sheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: TransitTheme.panel.cardBg,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  titleCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    flex: 1,
  },
  titleIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: TransitTheme.panel.cardBgActive,
  },
  sheetHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  preferencesButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: TransitTheme.panel.iconButtonBg,
  },
  preferencesButtonText: {
    color: TransitTheme.panel.title,
    fontSize: 12,
    fontWeight: "700",
  },
  sheetToggleButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: TransitTheme.panel.iconButtonBg,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  filterWrap: {
    flexDirection: "row",
    gap: 6,
    paddingRight: 4,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.cardBg,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  filterChipSelected: {
    borderColor: Kinetic.primary,
    backgroundColor: TransitTheme.panel.cardBgActive,
  },
  filterChipText: {
    color: TransitTheme.panel.caption,
    fontSize: 10,
    fontWeight: "600",
  },
  filterChipTextSelected: {
    color: TransitTheme.panel.title,
  },
  primaryButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
  },
  primaryButtonText: {
    fontSize: 14,
  },
  clearButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.cardBg,
    alignItems: "center",
    justifyContent: "center",
  },
  clearButtonDisabled: {
    opacity: 0.45,
  },
  errorText: {
    color: Kinetic.state.error,
    fontSize: 12,
  },
  contentSlot: {
    marginTop: 2,
  },
  panelBody: {
    gap: 7,
    marginTop: 7,
  },
});
