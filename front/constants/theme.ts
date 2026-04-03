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
  surfaceLow: "#F4F3F6",
  surfaceContainer: "#EEEDF0",
  surfaceContainerHigh: "#E8E8EB",
  surfaceContainerHighest: "#E3E2E5",
  onSurface: "#1A1C1E",
  onSurfaceVariant: "#434656",
  primary: "#003EC7",
  primaryContainer: "#0052FF",
  tertiary: "#833700",
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
