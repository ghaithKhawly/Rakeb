import type { Router } from "expo-router";

export function goHome(router: Router): void {
  router.replace("/(tabs)");
}

export function goBackOrHome(router: Router): void {
  try {
    router.back();
  } catch {
    router.replace("/(tabs)");
  }
}