import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

function canTriggerHaptics(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}

export function hapticSelection(): void {
  if (!canTriggerHaptics()) {
    return;
  }
  void Haptics.selectionAsync();
}

export function hapticLight(): void {
  if (!canTriggerHaptics()) {
    return;
  }
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function hapticMedium(): void {
  if (!canTriggerHaptics()) {
    return;
  }
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export function hapticSuccess(): void {
  if (!canTriggerHaptics()) {
    return;
  }
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function hapticWarning(): void {
  if (!canTriggerHaptics()) {
    return;
  }
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}
