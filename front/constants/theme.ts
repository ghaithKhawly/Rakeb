/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from "react-native";

const tintColorLight = "#003EC7";
const tintColorDark = "#003EC7";

export const Colors = {
  light: {
    text: "#1A1C1E",
    background: "#FAF9FC",
    surface: "#FFFFFF",
    primary: "#003EC7",
    tint: tintColorLight,
    icon: "#434656",
    border: "#C3C5D9",
    tabIconDefault: "#737688",
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: "#1A1C1E",
    background: "#FAF9FC",
    surface: "#FFFFFF",
    primary: "#003EC7",
    tint: tintColorDark,
    icon: "#434656",
    tabIconDefault: "#737688",
    tabIconSelected: tintColorDark,
    border: "#C3C5D9",
  },
};

export const Kinetic = {
  surfaceLow: "#EDF3FF",
  surfaceContainer: "#FFFFFF",
  surfaceContainerHigh: "#E2ECFF",
  surfaceContainerHighest: "#CBDBFF",
  onSurface: "#1A1C1E",
  onSurfaceVariant: "#3A4761",
  primary: "#003EC7",
  primaryContainer: "#0052FF",
  tertiary: "#833700",
  state: {
    error: "#C92A2A",
    danger: "#EF4444",
    success: "#16A34A",
    info: "#60A5FA",
    onPrimary: "#FFFFFF",
  },
  outlineVariant: "#C3C5D9",
  spacing: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 24,
    xl: 32,
  },
  radius: {
    md: 12,
    lg: 16,
    xl: 24,
    full: 999,
  },
};

export const TransitTheme = {
  map: {
    overlayBg: "rgba(252, 253, 255, 0.98)",
    overlayBorder: "#B9C8E8",
    overlayText: "#111827",
    overlaySubtext: "#6B7280",
    fabBg: "#FFFFFF",
    fabActiveBg: "#DDE8FF",
    fabAccentBg: "#003EC7",
  },
  panel: {
    bg: "#F2F6FF",
    cardBg: "#FFFFFF",
    cardBgActive: "#DCE9FF",
    border: "#B9C8E8",
    title: "#0F172A",
    body: "#24324A",
    caption: "#52617A",
    iconButtonBg: "#FFFFFF",
    chipWalkBg: "#EAF1FF",
    chipBusBg: "#16A34A",
  },
  route: {
    transit: "#7200f5",
    walking: "#2563EB",
    node: "#FFFFFF",
    nodeBorder: "rgba(15, 23, 42, 0.72)",
  },
};


export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "Inter, system-ui, sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
  },
});
