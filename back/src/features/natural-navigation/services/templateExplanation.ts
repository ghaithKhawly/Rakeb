import type { NavigationRouteResult } from "../../../../../types/navigation";

export function templateExplanation(route: NavigationRouteResult, lang: "ar" | "en"): string {
  const minutes = Math.max(1, Math.round(route.etaSeconds / 60));
  const firstBus = route.segments.find((s) => s.mode === "bus");
  const walkStart = route.segments[0];

  if (lang === "ar") {
    const parts: string[] = [];
    if (walkStart && walkStart.mode === "walk") {
      parts.push(`امشِ ${Math.round(walkStart.distanceM)} متر`);
    }
    if (firstBus) {
      parts.push(`اركب الخط ${firstBus.routeName ?? firstBus.routeId ?? "-"}`);
    }
    if (route.transferCount > 0) {
      parts.push(`مع ${route.transferCount} تحويل`);
    }
    parts.push(`المدة الكلية حوالي ${minutes} دقيقة`);
    return `${parts.join("، ")}.`;
  }

  const parts: string[] = [];
  if (walkStart && walkStart.mode === "walk") {
    parts.push(`Walk ${Math.round(walkStart.distanceM)}m`);
  }
  if (firstBus) {
    parts.push(`take bus ${firstBus.routeName ?? firstBus.routeId ?? "-"}`);
  }
  if (route.transferCount > 0) {
    parts.push(`with ${route.transferCount} transfer${route.transferCount > 1 ? "s" : ""}`);
  }
  parts.push(`about ${minutes} min total`);
  return `${parts.join(", ")}.`;
}
