#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DAMASCUS_BOUNDS = {
  minLat: 33.35,
  maxLat: 33.65,
  minLng: 36.15,
  maxLng: 36.45,
};

const ALLOWED_CATEGORIES = new Set([
  "hospital",
  "clinic",
  "university",
  "bus_station",
  "mosque",
  "school",
]);

const CATEGORY_CAPS = {
  hospital: 100,
  clinic: 80,
  university: 60,
  bus_station: 50,
  mosque: 60,
  school: 60,
};

const CATEGORY_PRIORITY = {
  hospital: 100,
  university: 90,
  bus_station: 80,
  clinic: 70,
  mosque: 60,
  school: 50,
  other: 0,
};

const EXCLUDED_NAMES = new Set([
  "hospital",
  "clinic",
  "school",
  "university",
  "mosque",
  "bus station",
  "مستشفى",
  "عيادة",
  "مدرسة",
  "جامعة",
  "جامع",
  "مسجد",
  "محطة",
]);

const GENERIC_NAME_PATTERNS = {
  school: /(مدرسة|إعدادية|اعدادية|ثانوية|school|academy|institute)/i,
  clinic: /(عيادة|مركز طبي|clinic)/i,
  hospital: /(مشفى|مستشفى|hospital)/i,
  university: /(جامعة|university)/i,
  bus_station: /(محطة|كراج|station|garage|terminal)/i,
  mosque: /(مسجد|جامع|mosque)/i,
};

const MANUAL_BLOCKLIST_IDS = new Set([]);
const MANUAL_BLOCKLIST_NAME_SNIPPETS = [
  "test",
  "unknown",
];

function usage() {
  console.error("Usage: node back/src/scripts/curate-osm-landmarks.mjs <input-json-path>");
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function hasArabic(value) {
  return /[\u0600-\u06FF]/.test(value ?? "");
}

function inDamascus(lat, lng) {
  return lat >= DAMASCUS_BOUNDS.minLat
    && lat <= DAMASCUS_BOUNDS.maxLat
    && lng >= DAMASCUS_BOUNDS.minLng
    && lng <= DAMASCUS_BOUNDS.maxLng;
}

function detectCategory(tags) {
  const amenity = normalizeKey(tags?.amenity);
  const building = normalizeKey(tags?.building);

  if (amenity === "hospital") return "hospital";
  if (amenity === "clinic") return "clinic";
  if (amenity === "university") return "university";
  if (amenity === "bus_station") return "bus_station";
  if (amenity === "school") return "school";
  if (building === "mosque" || amenity === "place_of_worship") return "mosque";

  return "other";
}

function toRecordFromOverpassElement(el) {
  if (el?.type !== "node") return null;
  if (typeof el.lat !== "number" || typeof el.lon !== "number") return null;

  return {
    sourceId: `${el.type}/${el.id}`,
    lat: el.lat,
    lng: el.lon,
    tags: el.tags ?? {},
  };
}

function toRecordFromGeoJsonFeature(feature) {
  if (feature?.geometry?.type !== "Point") return null;
  const coords = feature.geometry.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    sourceId: String(feature.id ?? feature.properties?.["@id"] ?? "unknown"),
    lat,
    lng,
    tags: feature.properties ?? {},
  };
}

function extractRecords(raw) {
  if (Array.isArray(raw?.elements)) {
    return raw.elements.map(toRecordFromOverpassElement).filter(Boolean);
  }

  if (Array.isArray(raw?.features)) {
    return raw.features.map(toRecordFromGeoJsonFeature).filter(Boolean);
  }

  throw new Error("Unsupported input format: expected Overpass JSON (elements) or GeoJSON (features)");
}

function pickNames(tags) {
  const primaryName = normalizeText(tags.name);
  const nameAr = normalizeText(tags["name:ar"]);
  const nameEn = normalizeText(tags["name:en"]);

  let finalAr = nameAr;
  let finalEn = nameEn;

  if (!finalAr && hasArabic(primaryName)) finalAr = primaryName;
  if (!finalEn && !hasArabic(primaryName)) finalEn = primaryName;

  if (!finalAr && finalEn) finalAr = finalEn;
  if (!finalEn && finalAr) finalEn = finalAr;

  return {
    primaryName,
    nameAr: finalAr,
    nameEn: finalEn,
  };
}

function collectAliases(tags, names) {
  const raw = [
    tags.name,
    tags["name:ar"],
    tags["name:en"],
    tags.alt_name,
    tags["alt_name:ar"],
    tags["alt_name:en"],
    tags.short_name,
    tags["short_name:ar"],
    tags["short_name:en"],
  ]
    .filter(Boolean)
    .flatMap((v) => String(v).split(";"))
    .map(normalizeText)
    .filter(Boolean);

  const uniq = new Set();
  for (const item of raw) {
    uniq.add(item);
    uniq.add(item.toLowerCase());
  }

  if (names.nameAr) uniq.add(names.nameAr);
  if (names.nameEn) uniq.add(names.nameEn);

  return Array.from(uniq).slice(0, 12);
}

function isLikelyGenericName(name, category) {
  const n = normalizeText(name);
  if (!n) return true;

  const tokens = n.split(/\s+/).filter(Boolean);
  const pattern = GENERIC_NAME_PATTERNS[category];
  if (!pattern) return false;

  // If a name is only a category word (or category + one short qualifier), it is too generic.
  if (pattern.test(n) && tokens.length <= 2) {
    return true;
  }

  return false;
}

function toSafeId(sourceId, names) {
  const base = normalizeKey(names.nameEn || names.nameAr)
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

  const numeric = String(sourceId).replace(/[^0-9]/g, "").slice(-8);
  return base ? `osm_${base}_${numeric}` : `osm_${numeric || "landmark"}`;
}

function parseExistingLandmarks(tsContent) {
  const ids = new Set();
  const names = new Set();

  for (const m of tsContent.matchAll(/id:\s*"([^"]+)"/g)) {
    ids.add(m[1]);
  }
  for (const m of tsContent.matchAll(/nameAr:\s*"([^"]+)"/g)) {
    names.add(normalizeKey(m[1]));
  }
  for (const m of tsContent.matchAll(/nameEn:\s*"([^"]+)"/g)) {
    names.add(normalizeKey(m[1]));
  }

  return { ids, names };
}

function scoreCandidate(candidate) {
  const base = CATEGORY_PRIORITY[candidate.category] ?? 0;
  const hasBothNames = candidate.nameAr && candidate.nameEn ? 15 : 0;
  const hasAliases = Math.min(candidate.aliases.length, 10);
  return base + hasBothNames + hasAliases;
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    usage();
    process.exit(1);
  }

  const rootDir = process.cwd();
  const landmarksFile = path.join(rootDir, "src", "features", "natural-navigation", "data", "damascusLandmarks.ts");
  const outputFile = path.join(rootDir, "src", "features", "natural-navigation", "data", "damascusLandmarks.osm.ts");

  const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const records = extractRecords(raw);

  const existing = parseExistingLandmarks(fs.readFileSync(landmarksFile, "utf8"));

  const byName = new Map();
  for (const record of records) {
    if (!inDamascus(record.lat, record.lng)) continue;

    const category = detectCategory(record.tags);
    if (!ALLOWED_CATEGORIES.has(category)) continue;

    if (MANUAL_BLOCKLIST_IDS.has(record.sourceId)) continue;

    const names = pickNames(record.tags);
    const chosenName = names.primaryName || names.nameAr || names.nameEn;
    const normalizedChosen = normalizeKey(chosenName);
    if (!normalizedChosen) continue;

    if (EXCLUDED_NAMES.has(normalizedChosen)) continue;
    if (isLikelyGenericName(chosenName, category)) continue;
    if (MANUAL_BLOCKLIST_NAME_SNIPPETS.some((x) => normalizedChosen.includes(x))) continue;
    if (existing.names.has(normalizedChosen)) continue;

    const aliases = collectAliases(record.tags, names);
    const id = toSafeId(record.sourceId, names);
    if (existing.ids.has(id)) continue;

    const candidate = {
      id,
      sourceId: record.sourceId,
      category,
      nameAr: names.nameAr || chosenName,
      nameEn: names.nameEn || chosenName,
      aliases,
      lat: Number(record.lat.toFixed(6)),
      lng: Number(record.lng.toFixed(6)),
      score: 0,
    };
    candidate.score = scoreCandidate(candidate);

    const key = normalizeKey(candidate.nameAr || candidate.nameEn);
    const existingByName = byName.get(key);
    if (!existingByName || candidate.score > existingByName.score) {
      byName.set(key, candidate);
    }
  }

  const allCandidates = Array.from(byName.values())
    .sort((a, b) => b.score - a.score || a.nameAr.localeCompare(b.nameAr));

  const counts = {
    hospital: 0,
    clinic: 0,
    university: 0,
    bus_station: 0,
    mosque: 0,
    school: 0,
  };

  const final = [];
  for (const item of allCandidates) {
    if (counts[item.category] >= CATEGORY_CAPS[item.category]) continue;
    counts[item.category] += 1;

    final.push({
      id: item.id,
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      aliases: item.aliases,
      lat: item.lat,
      lng: item.lng,
    });
  }

  final.sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));

  const ts = [
    "import type { LandmarkEntry } from \"./damascusLandmarks\";",
    "",
    "// Generated by back/src/scripts/curate-osm-landmarks.mjs",
    `// Source: ${inputPath}`,
    `// Count: ${final.length}`,
    "export const curatedOsmLandmarks: LandmarkEntry[] = [",
    ...final.map((l) => `  { id: ${JSON.stringify(l.id)}, nameAr: ${JSON.stringify(l.nameAr)}, nameEn: ${JSON.stringify(l.nameEn)}, aliases: ${JSON.stringify(l.aliases)}, lat: ${l.lat}, lng: ${l.lng} },`),
    "];",
    "",
  ].join("\n");

  fs.writeFileSync(outputFile, ts, "utf8");

  const summary = {
    inputRecords: records.length,
    dedupedCandidates: allCandidates.length,
    finalCount: final.length,
    categoryCounts: counts,
    outputFile,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main();
