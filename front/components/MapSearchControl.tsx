import React from "react";
import { StyleSheet, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Colors, TransitTheme } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { useLanguage } from "@/hooks/LanguageContext";
import { hapticSelection } from "@/utils/haptics";

type MapSearchControlProps = {
  topInset: number;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearchSubmit: () => Promise<void> | void;
  onOpenOriginMenu: () => void;
  onPanelAnchorLayout?: (layout: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
  onFocusDestinationOnMap?: () => void;
  onSwapLocations?: () => void;
  onUseMapPin?: () => void;
  startLabel?: string;
  destinationLabel?: string;
};

export function MapSearchControl({
  topInset,
  searchQuery,
  onSearchQueryChange,
  onSearchSubmit,
  onOpenOriginMenu,
  onPanelAnchorLayout,
  onFocusDestinationOnMap,
  onSwapLocations,
  onUseMapPin,
  startLabel,
  destinationLabel,
}: MapSearchControlProps) {
  const { isRTL, t } = useLanguage();

  const submitSearch = () => {
    if (!searchQuery.trim()) {
      return;
    }
    void onSearchSubmit();
  };

  return (
    <View
      style={[
        styles.searchOverlay,
        { top: topInset },
        isRTL ? styles.searchOverlayRtl : styles.searchOverlayLtr,
      ]}
    >
      <View
        style={styles.summaryWrap}
        onLayout={(event) => {
          const { x, y, width, height } = event.nativeEvent.layout;
          onPanelAnchorLayout?.({ x, y, width, height });
        }}
      >
        <View style={styles.summaryRows}>
          <TouchableOpacity
            style={styles.summaryRow}
            onPress={() => {
              hapticSelection();
              onOpenOriginMenu();
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="ellipse-outline" size={14} color="#60A5FA" />
            <ThemedText numberOfLines={1} style={styles.summaryText}>
              {startLabel ?? t("map.startFallback")}
            </ThemedText>
          </TouchableOpacity>

          <View style={styles.summaryDivider} />

          <View style={styles.destinationRow}>
            <Ionicons name="location-outline" size={15} color="#EF4444" />
            <TextInput
              value={searchQuery}
              onChangeText={onSearchQueryChange}
              onFocus={onFocusDestinationOnMap}
              onSubmitEditing={submitSearch}
              placeholder={destinationLabel ?? t("map.destinationFallback")}
              placeholderTextColor={TransitTheme.map.overlaySubtext}
              style={styles.destinationInput}
              returnKeyType="search"
              autoCapitalize="words"
              autoCorrect={false}
              selectionColor={Colors.dark.primary}
              cursorColor={Colors.dark.primary}
            />
            <TouchableOpacity
              style={styles.searchButton}
              onPress={submitSearch}
              disabled={!searchQuery.trim()}
              activeOpacity={0.85}
            >
              <Ionicons
                name="search"
                size={15}
                color={searchQuery.trim() ? Colors.dark.primary : TransitTheme.panel.caption}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.pinButton}
              onPress={() => {
                hapticSelection();
                onUseMapPin?.();
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="pin-outline" size={15} color={Colors.dark.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.summaryActions}
          onPress={() => {
            hapticSelection();
            onSwapLocations?.();
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="swap-vertical" size={16} color={TransitTheme.panel.caption} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchOverlay: {
    position: "absolute",
    flexDirection: "column",
    alignItems: "stretch",
    zIndex: 20,
  },
  searchOverlayLtr: {
    left: 12,
    right: 12,
  },
  searchOverlayRtl: {
    right: 12,
    left: 12,
  },
  summaryWrap: {
    minHeight: 88,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: TransitTheme.map.overlayBorder,
    backgroundColor: TransitTheme.map.overlayBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  summaryRows: {
    flex: 1,
    gap: 10,
    minWidth: 0,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 28,
    minWidth: 0,
  },
  destinationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 30,
    minWidth: 0,
  },
  destinationInput: {
    flex: 1,
    minWidth: 0,
    color: TransitTheme.map.overlayText,
    fontSize: 15,
    fontWeight: "600",
    paddingVertical: 0,
  },
  searchButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(148, 163, 184, 0.12)",
  },
  pinButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(148, 163, 184, 0.12)",
  },
  summaryDivider: {
    borderTopWidth: 1,
    borderTopColor: "rgba(148, 163, 184, 0.35)",
  },
  summaryText: {
    flex: 1,
    minWidth: 0,
    color: TransitTheme.map.overlayText,
    fontSize: 15,
    fontWeight: "600",
  },
  summaryActions: {
    width: 32,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(148, 163, 184, 0.12)",
  },
});
