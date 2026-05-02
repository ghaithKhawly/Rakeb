import { I18nManager, type TextStyle, type ViewStyle } from "react-native";

export const rtl = {
  isRTL: I18nManager.isRTL,
  forceRTL: (enabled: boolean) => {
    if (I18nManager.isRTL !== enabled) {
      I18nManager.forceRTL(enabled);
    }
  },
  allowRTL: (enabled: boolean) => {
    I18nManager.allowRTL(enabled);
  },
  flexDirection: (
    direction: "row" | "row-reverse" | "column" | "column-reverse",
  ): ViewStyle["flexDirection"] => {
    if (!I18nManager.isRTL) {
      return direction;
    }

    if (direction === "row") {
      return "row-reverse";
    }

    if (direction === "row-reverse") {
      return "row";
    }

    return direction;
  },
  textAlign: (align: "left" | "right" | "center" | "justify"): TextStyle["textAlign"] => {
    if (!I18nManager.isRTL || align === "center" || align === "justify") {
      return align;
    }

    return align === "left" ? "right" : "left";
  },
  margin: {
    start: (value: number): { marginLeft?: number; marginRight?: number } =>
      I18nManager.isRTL ? { marginRight: value } : { marginLeft: value },
    end: (value: number): { marginLeft?: number; marginRight?: number } =>
      I18nManager.isRTL ? { marginLeft: value } : { marginRight: value },
  },
  padding: {
    start: (value: number): { paddingLeft?: number; paddingRight?: number } =>
      I18nManager.isRTL ? { paddingRight: value } : { paddingLeft: value },
    end: (value: number): { paddingLeft?: number; paddingRight?: number } =>
      I18nManager.isRTL ? { paddingLeft: value } : { paddingRight: value },
  },
  icon: {
    flipHorizontally: (shouldFlip = true): ViewStyle =>
      I18nManager.isRTL && shouldFlip ? { transform: [{ scaleX: -1 }] } : {},
  },
  writingDirection: (): "ltr" | "rtl" => (I18nManager.isRTL ? "rtl" : "ltr"),
};