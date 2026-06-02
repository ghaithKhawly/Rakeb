import type { NavigationRouteResult } from "../../types/navigation";

const cachedRoutes = new Map<string, NavigationRouteResult>();

export function putCachedRoute(route: NavigationRouteResult, preferredId?: string) {
  const id = preferredId ?? `cached-route-${Date.now()}`;
  cachedRoutes.set(id, route);
  return id;
}

export function getCachedRoute(id: string | undefined) {
  if (!id) {
    return null;
  }

  return cachedRoutes.get(id) ?? null;
}
