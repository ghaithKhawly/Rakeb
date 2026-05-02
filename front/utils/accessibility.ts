import type { AccessibilityRole, AccessibilityState } from "react-native";

export const a11y = {
  button: (label: string, hint?: string, disabled?: boolean) => ({
    accessible: true,
    accessibilityRole: "button" as AccessibilityRole,
    accessibilityLabel: label,
    accessibilityHint: hint,
    accessibilityState: disabled ? ({ disabled: true } as AccessibilityState) : undefined,
  }),
  heading: (label: string, level: 1 | 2 | 3 = 1) => ({
    accessible: true,
    accessibilityRole: "header" as AccessibilityRole,
    accessibilityLabel: label,
    accessibilityLevel: level,
  }),
  input: (label: string, value?: string, hint?: string) => ({
    accessible: true,
    accessibilityRole: "text" as AccessibilityRole,
    accessibilityLabel: label,
    accessibilityValue: value ? { text: value } : undefined,
    accessibilityHint: hint,
  }),
  listItem: (label: string, index?: number, total?: number) => {
    const positionInfo =
      index !== undefined && total !== undefined ? ` (${index + 1} of ${total})` : "";

    return {
      accessible: true,
      accessibilityRole: "button" as AccessibilityRole,
      accessibilityLabel: `${label}${positionInfo}`,
    };
  },
  toggle: (label: string, value: boolean) => ({
    accessible: true,
    accessibilityRole: "switch" as AccessibilityRole,
    accessibilityLabel: label,
    accessibilityState: { checked: value } as AccessibilityState,
  }),
  search: (placeholder: string, value?: string) => ({
    accessible: true,
    accessibilityRole: "search" as AccessibilityRole,
    accessibilityLabel: placeholder,
    accessibilityValue: value ? { text: value } : undefined,
    accessibilityHint: "Double tap to edit",
  }),
  decorative: () => ({
    accessible: false,
    importantForAccessibility: "no-hide-descendants" as const,
  }),
};

export const formatDurationA11y = (minutes: number): string => {
  if (minutes < 1) {
    return "Less than a minute";
  }

  if (minutes === 1) {
    return "1 minute";
  }

  if (minutes < 60) {
    return `${minutes} minutes`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }

  return `${hours} ${hours === 1 ? "hour" : "hours"} and ${remainingMinutes} ${remainingMinutes === 1 ? "minute" : "minutes"}`;
};

export const formatDistanceA11y = (meters: number): string => {
  if (meters < 1000) {
    return `${Math.round(meters)} meters`;
  }

  const kilometers = meters / 1000;
  return `${kilometers.toFixed(kilometers < 10 ? 1 : 0)} kilometers`;
};

export const announceForAccessibility = (message: string): void => {
  const announcer = (global as { announceForAccessibility?: (text: string) => void }).announceForAccessibility;
  if (typeof announcer === "function") {
    announcer(message);
  }
};