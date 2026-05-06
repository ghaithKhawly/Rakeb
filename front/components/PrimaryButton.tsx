import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
  View,
} from "react-native";

import { Kinetic } from "@/constants/theme";
import { a11y } from "@/utils/accessibility";
import { hapticSelection } from "@/utils/haptics";

type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";
type ButtonSize = "default" | "large";

type PrimaryButtonProps = {
  onPress: () => void;
  title: string;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  accessibilityHint?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
  testID?: string;
};

export function PrimaryButton({
  onPress,
  title,
  disabled = false,
  loading = false,
  variant = "primary",
  size = "default",
  icon,
  iconPosition = "left",
  accessibilityHint,
  style,
  textStyle,
  testID,
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  const handlePress = () => {
    if (isDisabled) {
      return;
    }

    hapticSelection();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles[size],
        styles[variant],
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      {...a11y.button(title, accessibilityHint, isDisabled)}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator color={getLoaderColor(variant)} size="small" />
      ) : (
        <View style={styles.contentRow}>
          {icon && iconPosition === "left" ? <View style={styles.iconLeft}>{icon}</View> : null}
          <Text style={[styles.text, styles[`${variant}Text`], styles[`${size}Text`], textStyle]} numberOfLines={1}>
            {title}
          </Text>
          {icon && iconPosition === "right" ? <View style={styles.iconRight}>{icon}</View> : null}
        </View>
      )}
    </Pressable>
  );
}

function getLoaderColor(variant: ButtonVariant): string {
  if (variant === "secondary") {
    return Kinetic.primary;
  }

  if (variant === "tertiary") {
    return Kinetic.onSurfaceVariant;
  }

  return "#FFFFFF";
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: "transparent",
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  default: {
    minHeight: 60,
  },
  large: {
    minHeight: 72,
  },
  primary: {
    backgroundColor: Kinetic.primary,
    borderColor: Kinetic.primary,
  },
  secondary: {
    backgroundColor: Kinetic.surfaceContainer,
    borderColor: Kinetic.primary,
  },
  tertiary: {
    backgroundColor: Kinetic.surfaceLow,
    borderColor: Kinetic.outlineVariant,
  },
  danger: {
    backgroundColor: "#D93025",
    borderColor: "#D93025",
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.992 }],
  },
  disabled: {
    opacity: 0.48,
  },
  text: {
    fontWeight: "800",
    textAlign: "center",
  },
  defaultText: {
    color: "#FFFFFF",
    fontSize: 17,
  },
  largeText: {
    color: "#FFFFFF",
    fontSize: 19,
  },
  primaryText: {
    color: "#FFFFFF",
  },
  secondaryText: {
    color: Kinetic.primary,
  },
  tertiaryText: {
    color: Kinetic.onSurface,
  },
  dangerText: {
    color: "#FFFFFF",
  },
  iconLeft: {
    marginRight: 2,
  },
  iconRight: {
    marginLeft: 2,
  },
});