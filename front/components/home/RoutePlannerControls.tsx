import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";

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
  onClearRoute,
  errorMessage,
}: RoutePlannerControlsProps) {
  return (
    <>
      <View style={styles.sheetHeaderRow}>
        <ThemedText type="defaultSemiBold" style={styles.title}>
          Route Planner
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
          ? "Loading saved preferences..."
          : hasSavedPreferences
            ? "Using saved preferences"
            : "Using server defaults"}
      </ThemedText>

      {!isCollapsed ? (
        <>
          <ThemedText style={styles.metaText}>Start: {startLabel}</ThemedText>
          <ThemedText style={styles.metaText}>
            Destination: {destinationLabel}
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
                Tap Map: Set Start
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
                Tap Map: Set Destination
              </ThemedText>
            </TouchableOpacity>
          </View>

          {routeLocked ? (
            <ThemedText style={styles.metaText}>
              Route is locked. Press Clear to choose a new destination.
            </ThemedText>
          ) : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={onRequestRoute}
              disabled={isRouting}
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
                    Request Route
                  </ThemedText>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onClearRoute}
            >
              <ThemedText style={styles.secondaryButtonText}>Clear</ThemedText>
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
  errorText: {
    color: "#F87171",
    fontSize: 12,
  },
});
