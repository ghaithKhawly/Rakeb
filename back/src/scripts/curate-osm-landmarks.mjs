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
  "bus_stop",
  "mosque",
  "school",
  "square",
  "neighborhood",
  "market",
  "mall",
  "park",
  "museum",
  "attraction",
  "public_building",
]);

const CATEGORY_CAPS = {
  hospital: 80,
  clinic: 40,
  university: 60,
  bus_station: 70,
  bus_stop: 80,
  mosque: 60,
  school: 30,
  square: 80,
  neighborhood: 120,
  market: 60,
  mall: 40,
  park: 60,
  museum: 40,
  attraction: 80,
  public_building: 60,
};

const CATEGORY_PRIORITY = {
  square: 100,
  neighborhood: 95,
  hospital: 90,
  university: 85,
  bus_station: 80,
  bus_stop: 70,
  clinic: 60,
  mosque: 55,
  school: 45,
  market: 75,
  mall: 72,
  park: 68,
  museum: 65,
  attraction: 62,
  public_building: 58,
  other: 0,
};

const EXCLUDED_NAMES = new Set([
  "hospital",
  "clinic",
  "school",
  "university",
  "mosque",
  "bus station",
  "bus stop",
  "square",
  "saha",
  "مستشفى",
  "عيادة",
  "مدرسة",
  "جامعة",
  "جامع",
  "مسجد",
  "محطة",
  "ساحة",
  "حي",
  "ضاحية",
  "سوق",
  "مول",
  "حديقة",
  "متحف",
]);

const GENERIC_NAME_PATTERNS = {
  school: /(مدرسة|إعدادية|اعدادية|ثانوية|school|academy|institute)/i,
  clinic: /(عيادة|مركز طبي|clinic)/i,
  hospital: /(مشفى|مستشفى|hospital)/i,
  university: /(جامعة|university)/i,
  bus_station: /(محطة|كراج|station|garage|terminal)/i,
  bus_stop: /(موقف|محطة|bus stop|stop)/i,
  mosque: /(مسجد|جامع|mosque)/i,
  square: /(ساحة|ميدان|square|plaza|circle)/i,
  neighborhood: /(حي|حارة|ضاحية|suburb|neighbourhood|neighborhood|quarter)/i,
  market: /(سوق|market|souq|bazaar)/i,
  mall: /(مول|mall|shopping)/i,
  park: /(حديقة|منتزه|park|garden)/i,
  museum: /(متحف|museum)/i,
  attraction: /(معلم|attraction|monument)/i,
  public_building: /(وزارة|مديرية|مؤسسة|قصر|مكتبة|مركز ثقافي|ministry|library|cultural center)/i,
};

const LEADING_PLACE_TYPES = [
  "ساحة",
  "دوار",
  "كراج",
  "كراجات",
  "موقف",
  "محطة",
  "جامعة",
  "كلية",
  "مستشفى",
  "مشفى",
  "مستوصف",
  "عيادة",
  "عيادات",
  "مركز",
  "مجمع",
  "مدرسة",
  "ثانوية",
  "اعدادية",
  "إعدادية",
  "اكاديمية",
  "أكاديمية",
  "معهد",
  "جامع",
  "مسجد",
  "سوق",
  "مول",
  "حديقة",
  "متحف",
  "حي",
  "ضاحية",
  "باب",
  "جسر",
  "ميدان",
  "دكتور",
  "الدكتور",
  "دكتورة",
  "الدكتورة",
  "د",
];

const GENERIC_ALIASES = new Set([
  "",
  "ال",
  "ساحه",
  "دوار",
  "كراج",
  "كراجات",
  "موقف",
  "محطه",
  "جامعه",
  "كليه",
  "مستشفي",
  "مشفي",
  "مستوصف",
  "عياده",
  "عيادات",
  "مركز",
  "مجمع",
  "مدرسه",
  "ثانويه",
  "اعداديه",
  "اكاديميه",
  "معهد",
  "جامع",
  "مسجد",
  "سوق",
  "مول",
  "حديقه",
  "متحف",
  "حي",
  "ضاحيه",
  "باب",
  "جسر",
  "ميدان",
  "دكتور",
  "الدكتور",
  "دكتوره",
  "الدكتوره",
  "د",
]);

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

function normalizeArabic(value) {
  return normalizeText(value)
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ـ/g, "")
    .replace(/[،,.!?؟;:()[\]{}"']/g, " ")
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
  const place = normalizeKey(tags?.place);
  const highway = normalizeKey(tags?.highway);
  const shop = normalizeKey(tags?.shop);
  const leisure = normalizeKey(tags?.leisure);
  const tourism = normalizeKey(tags?.tourism);
  const historic = normalizeKey(tags?.historic);
  const office = normalizeKey(tags?.office);

  if (amenity === "hospital") return "hospital";
  if (amenity === "clinic") return "clinic";
  if (amenity === "university") return "university";
  if (amenity === "bus_station") return "bus_station";
  if (highway === "bus_stop") return "bus_stop";
  if (amenity === "school") return "school";
  if (building === "mosque" || amenity === "place_of_worship") return "mosque";
  if (amenity === "marketplace" || amenity === "market") return "market";
  if (shop === "mall" || building === "retail") return "mall";
  if (leisure === "park" || leisure === "garden") return "park";
  if (tourism === "museum") return "museum";
  if (tourism === "attraction" || tourism === "viewpoint" || historic) return "attraction";
  if (amenity === "library" || amenity === "townhall" || office === "government" || building === "public") {
    return "public_building";
  }
  if (place === "square") return "square";
  if (place === "suburb" || place === "neighbourhood" || place === "neighborhood" || place === "quarter") {
    return "neighborhood";
  }

  return "other";
}

function toRecordFromOverpassElement(el) {
  if (!el?.type) return null;

  if (el.type === "node") {
    if (typeof el.lat !== "number" || typeof el.lon !== "number") return null;
    return {
      sourceId: `${el.type}/${el.id}`,
      lat: el.lat,
      lng: el.lon,
      tags: el.tags ?? {},
    };
  }

  if ((el.type === "way" || el.type === "relation") && el.center) {
    if (typeof el.center.lat !== "number" || typeof el.center.lon !== "number") return null;
    return {
      sourceId: `${el.type}/${el.id}`,
      lat: el.center.lat,
      lng: el.center.lon,
      tags: el.tags ?? {},
    };
  }

  return null;
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
  const addAlias = (value) => {
    const normalized = normalizeArabic(value);
    if (normalized.length < 2 || GENERIC_ALIASES.has(normalized)) return;
    uniq.add(value);
    uniq.add(normalized);
    uniq.add(normalized.toLowerCase());
  };
  const withoutLeadingArticle = (value) => normalizeArabic(value)
    .split(" ")
    .map((token) => token.startsWith("ال") && token.length > 3 ? token.slice(2) : token)
    .join(" ");

  for (const item of raw) {
    addAlias(item);
    addAlias(item.toLowerCase());

    const normalized = normalizeArabic(item);
    addAlias(withoutLeadingArticle(normalized));

    const numberFirst = normalized.match(/^(\d+)\s+(.+)$/u);
    if (numberFirst?.[1] && numberFirst[2]) {
      addAlias(`${numberFirst[2]} ${numberFirst[1]}`);
    }

    for (const type of LEADING_PLACE_TYPES) {
      const normalizedType = normalizeArabic(type);
      if (normalized.startsWith(`${normalizedType} `)) {
        const rest = normalized.slice(normalizedType.length).trim();
        addAlias(rest);
        addAlias(withoutLeadingArticle(rest));
      }
    }

    addAlias(normalized.replace(/مستشفي/g, "مشفي"));
    addAlias(normalized.replace(/مشفي/g, "مستشفي"));
    addAlias(normalized.replace(/كراجات/g, "كراج"));
    addAlias(normalized.replace(/كراج/g, "كراجات"));
  }

  if (names.nameAr) addAlias(names.nameAr);
  if (names.nameEn) addAlias(names.nameEn);

  return Array.from(uniq).slice(0, 16);
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
  const landmarksFile = path.join(rootDir, "src", "data", "coreDamascus.ts");
  const outputFile = path.join(rootDir, "src", "data", "damascusLandmarks.osm.ts");

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
    bus_stop: 0,
    mosque: 0,
    school: 0,
    square: 0,
    neighborhood: 0,
    market: 0,
    mall: 0,
    park: 0,
    museum: 0,
    attraction: 0,
    public_building: 0,
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
