import { coreDamascusPlaces } from "./coreDamascus";
import { curatedOsmLandmarks } from "./damascusLandmarks.osm";
import { normalizeArabic } from "../nlp/normalizeArabic";

export type LandmarkEntry = {
  id: string;
  nameAr: string;
  nameEn: string;
  aliases: string[];
  lat: number;
  lng: number;
};

export type SearchableLandmarkEntry = LandmarkEntry & {
  rawAliases: string[];
  normalizedAliases: string[];
};

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function withNormalizedAliases(item: LandmarkEntry): SearchableLandmarkEntry {
  const rawAliases = uniqueStrings([item.nameAr, item.nameEn, ...item.aliases]);
  const normalizedAliases = uniqueStrings(rawAliases.map((alias) => normalizeArabic(alias)));
  return {
    ...item,
    rawAliases,
    normalizedAliases,
  };
}

function mergeUnique(list: LandmarkEntry[]): SearchableLandmarkEntry[] {
  const seen = new Set<string>();
  const result: SearchableLandmarkEntry[] = [];
  for (const item of list) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    result.push(withNormalizedAliases(item));
  }
  return result;
}

export const allDamascusLandmarks: SearchableLandmarkEntry[] = mergeUnique([
  ...coreDamascusPlaces,
  ...curatedOsmLandmarks,
]);

export const damascusLandmarks = allDamascusLandmarks;

export { coreDamascusPlaces, curatedOsmLandmarks };
