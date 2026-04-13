import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { useLanguage } from "@/hooks/LanguageContext";

type RoutePlannerControlsProps = {
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  isPreferencesLoading: boolean;
  hasSavedPreferences: boolean;
  startLabel: string;
  destinationLabel: string;
  mapSelectionMode: "start" | "destination";
  onChangeMapSelectionMode: (mode: "start" | "destination") => void;
  routeLocked: boolean;
  onRequestRoute: () => void;
  isRouting: boolean;
  naturalRouteText: string;
  onChangeNaturalRouteText: (value: string) => void;
  onSubmitNaturalRouteText: () => void;
  isParsingNaturalRoute: boolean;
  onClearRoute: () => void;
  errorMessage: string | null;
};

export function RoutePlannerControls({
  isCollapsed,
  onToggleCollapsed,
  isPreferencesLoading,
  hasSavedPreferences,
  startLabel,
  destinationLabel,
  mapSelectionMode,
  onChangeMapSelectionMode,
  routeLocked,
  onRequestRoute,
  isRouting,
  naturalRouteText,
  onChangeNaturalRouteText,
  onSubmitNaturalRouteText,
  isParsingNaturalRoute,
  onClearRoute,
  errorMessage,
}: RoutePlannerControlsProps) {
  const { isRTL, t } = useLanguage();

  return (
    <>
      <View style={styles.sheetHeaderRow}>
        <ThemedText type="defaultSemiBold" style={styles.title}>
          {t("planner.title")}
        </ThemedText>
        <TouchableOpacity
          style={styles.sheetToggleButton}
          onPress={onToggleCollapsed}
        >
          <Ionicons
            name={isCollapsed ? "chevron-up" : "chevron-down"}
            size={18}
            color={Colors.dark.text}
          />
        </TouchableOpacity>
      </View>

      <ThemedText style={styles.prefStatusText}>
        {isPreferencesLoading
          ? t("planner.pref.loading")
          : hasSavedPreferences
            ? t("planner.pref.saved")
            : t("planner.pref.defaults")}
      </ThemedText>

      {!isCollapsed ? (
        <>
          <ThemedText style={[styles.metaText, isRTL && styles.textRtl]}>
            {t("planner.start")}: {startLabel}
          </ThemedText>
          <ThemedText style={styles.metaText}>
            {t("planner.destination")}: {destinationLabel}
          </ThemedText>
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                mapSelectionMode === "start" && styles.modeButtonActive,
              ]}
              onPress={() => onChangeMapSelectionMode("start")}
            >
              <ThemedText
                style={[
                  styles.modeButtonText,
                  mapSelectionMode === "start" && styles.modeButtonTextActive,
                ]}
              >
                {t("planner.tapStart")}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeButton,
                mapSelectionMode === "destination" && styles.modeButtonActive,
              ]}
              onPress={() => onChangeMapSelectionMode("destination")}
            >
              <ThemedText
                style={[
                  styles.modeButtonText,
                  mapSelectionMode === "destination" &&
                    styles.modeButtonTextActive,
                ]}
              >
                {t("planner.tapDestination")}
              </ThemedText>
            </TouchableOpacity>
          </View>

          {routeLocked ? (
            <ThemedText style={styles.metaText}>
              {t("planner.locked")}
            </ThemedText>
          ) : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={onRequestRoute}
              disabled={isRouting || isParsingNaturalRoute}
            >
              {isRouting ? (
                <ActivityIndicator
                  size="small"
                  color={Colors.dark.background}
                />
              ) : (
                <>
                  <Ionicons
                    name="navigate"
                    size={16}
                    color={Colors.dark.background}
                  />
                  <ThemedText style={styles.primaryButtonText}>
                    {t("planner.request")}
                  </ThemedText>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onClearRoute}
            >
              <ThemedText style={styles.secondaryButtonText}>
                {t("planner.clear")}
              </ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.textRouteRow}>
            <TextInput
              value={naturalRouteText}
              onChangeText={onChangeNaturalRouteText}
              placeholder={t("planner.textPlaceholder")}
              placeholderTextColor="#6B7280"
              style={styles.textRouteInput}
              editable={!isParsingNaturalRoute && !isRouting}
              returnKeyType="send"
              blurOnSubmit
              onSubmitEditing={onSubmitNaturalRouteText}
              autoCapitalize="none"
              autoCorrect={false}
              selectionColor={Colors.dark.primary}
              cursorColor={Colors.dark.primary}
              textAlign="left"
            />
            <TouchableOpacity
              style={styles.textRouteButton}
              onPress={onSubmitNaturalRouteText}
              disabled={isParsingNaturalRoute || isRouting}
            >
              {isParsingNaturalRoute ? (
                <ActivityIndicator
                  size="small"
                  color={Colors.dark.background}
                />
              ) : (
                <ThemedText style={styles.textRouteButtonText}>
                  {t("planner.useText")}
                </ThemedText>
              )}
            </TouchableOpacity>
          </View>

          {errorMessage ? (
            <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
          ) : null}
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    color: Colors.dark.text,
    fontSize: 16,
  },
  sheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetToggleButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.background,
  },
  metaText: {
    color: Colors.dark.icon,
    fontSize: 12,
  },
  textRtl: {
    textAlign: "right",
  },
  prefStatusText: {
    color: Colors.dark.primary,
    fontSize: 11,
    fontWeight: "600",
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.background,
  },
  modeButtonActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(45, 212, 191, 0.15)",
  },
  modeButtonText: {
    color: Colors.dark.icon,
    fontSize: 11,
    fontWeight: "600",
  },
  modeButtonTextActive: {
    color: Colors.dark.text,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  primaryButton: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonText: {
    color: Colors.dark.background,
    fontSize: 13,
    fontWeight: "700",
  },
  secondaryButton: {
    width: 88,
    height: 42,
    borderRadius: 10,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: "600",
  },
  textRouteRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  textRouteInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#9CA3AF",
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    color: "#111827",
    fontSize: 14,
  },
  textRouteButton: {
    width: 94,
    height: 42,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  textRouteButtonText: {
    color: Colors.dark.background,
    fontSize: 12,
    fontWeight: "700",
  },
  errorText: {
    color: "#F87171",
    fontSize: 12,
  },
});
