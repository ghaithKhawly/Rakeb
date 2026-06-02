import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { Kinetic, TransitTheme } from "@/constants/theme";
import { a11y } from "@/utils/accessibility";
import { hapticLight, hapticSelection } from "@/utils/haptics";
import { rtl } from "@/utils/rtl";

type SearchInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  onLocationPress?: () => void;
  onVoicePress?: () => void;
  onClear?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmitEditing?: () => void;
  onSubmitButtonPress?: () => void;
  autoFocus?: boolean;
  editable?: boolean;
  returnKeyType?: "search" | "next" | "done";
  leftIcon?: "search" | "location" | "none";
  showClearButton?: boolean;
  showLocationButton?: boolean;
  showVoiceButton?: boolean;
  showSubmitButton?: boolean;
  style?: ViewStyle;
  inputStyle?: TextStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
};

export function SearchInput({
  value,
  onChangeText,
  placeholder,
  onLocationPress,
  onVoicePress,
  onClear,
  onFocus,
  onBlur,
  onSubmitEditing,
  onSubmitButtonPress,
  autoFocus = false,
  editable = true,
  returnKeyType = "search",
  leftIcon = "search",
  showClearButton = true,
  showLocationButton = false,
  showVoiceButton = false,
  showSubmitButton = false,
  style,
  inputStyle,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: SearchInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const showClear = showClearButton && value.length > 0;
  const showSubmit = showSubmitButton && !!onSubmitButtonPress;
  const showLocation = showLocationButton && !!onLocationPress;
  const showVoice = showVoiceButton && !!onVoicePress;

  const handleFocus = () => {
    setIsFocused(true);
    hapticLight();
    onFocus?.();
  };

  const handleBlur = () => {
    setIsFocused(false);
    onBlur?.();
  };

  const handleClear = () => {
    hapticSelection();
    onChangeText("");
    onClear?.();
    inputRef.current?.focus();
  };

  const handleLocationPress = () => {
    hapticSelection();
    onLocationPress?.();
  };

  const handleVoicePress = () => {
    hapticSelection();
    onVoicePress?.();
  };

  const handleSubmitPress = () => {
    hapticSelection();
    onSubmitButtonPress?.();
  };

  return (
    <View
      style={[styles.container, isFocused && styles.containerFocused, !editable && styles.containerDisabled, style]}
      testID={testID}
    >
      {leftIcon !== "none" ? (
        <Ionicons
          name={leftIcon === "search" ? "search" : "location-outline"}
          size={19}
          color={isFocused ? Kinetic.primary : Kinetic.onSurfaceVariant}
          style={styles.leadingIcon}
        />
      ) : null}

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Kinetic.onSurfaceVariant}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onSubmitEditing={onSubmitEditing}
        autoFocus={autoFocus}
        editable={editable}
        returnKeyType={returnKeyType}
        autoCorrect={false}
        autoCapitalize="words"
        style={[
          styles.input,
          {
            textAlign: rtl.textAlign("left"),
            writingDirection: rtl.writingDirection(),
          },
          inputStyle,
        ]}
        {...a11y.search(accessibilityLabel || placeholder, value)}
        accessibilityHint={accessibilityHint}
      />

      <View style={styles.rightActions}>
        {showClear ? (
          <Pressable onPress={handleClear} style={styles.actionButton} {...a11y.button("Clear search", "Removes current text")}>
            <Ionicons name="close-circle-outline" size={18} color={Kinetic.onSurfaceVariant} />
          </Pressable>
        ) : null}
        {showLocation ? (
          <Pressable onPress={handleLocationPress} style={styles.actionButton} {...a11y.button("Use current location", "Finds routes from your location")}>
            <Ionicons name="locate-outline" size={18} color={Kinetic.primary} />
          </Pressable>
        ) : null}
        {showVoice ? (
          <Pressable onPress={handleVoicePress} style={styles.actionButton} {...a11y.button("Voice search", "Speak your destination")}>
            <Ionicons name="mic-outline" size={18} color={Kinetic.primary} />
          </Pressable>
        ) : null}
        {showSubmit ? (
          <Pressable onPress={handleSubmitPress} style={styles.actionButton} {...a11y.button("Search", "Submit the current search query")}>
            <Ionicons name="arrow-forward" size={18} color={Kinetic.primary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 64,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.bg,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    ...Platform.select({
      android: { elevation: 1 },
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      },
    }),
  },
  containerFocused: {
    borderColor: Kinetic.primary,
  },
  containerDisabled: {
    opacity: 0.6,
  },
  leadingIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: Kinetic.onSurface,
    fontSize: 18,
    lineHeight: 22,
    paddingVertical: 0,
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 8,
  },
  actionButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: TransitTheme.panel.cardBg,
  },
});
