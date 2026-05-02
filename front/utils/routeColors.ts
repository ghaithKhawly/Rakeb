const ROUTE_COLORS = [
  "#2DD4BF",
  "#3B82F6",
  "#F59E0B",
  "#A78BFA",
  "#F43F5E",
  "#22C55E",
  "#06B6D4",
  "#F97316",
  "#EAB308",
  "#14B8A6",
  "#8B5CF6",
  "#10B981",
];

export function getRouteColor(routeName: string): string {
  let hash = 0;

  for (let index = 0; index < routeName.length; index += 1) {
    hash = (hash << 5) - hash + routeName.charCodeAt(index);
    hash |= 0;
  }

  return ROUTE_COLORS[Math.abs(hash) % ROUTE_COLORS.length];
}

export function getSegmentColor(routeName: string, segmentIndex: number): string {
  return getRouteColor(`${routeName}-${segmentIndex}`);
}

export function withAlpha(hexColor: string, alpha: number): string {
  const normalized = hexColor.replace("#", "");

  if (normalized.length !== 6) {
    return hexColor;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  if ([red, green, blue].some(Number.isNaN)) {
    return hexColor;
  }

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}