import type { LandmarkEntry } from "../data/damascusLandmarks";
import { normalizeArabic } from "./normalizeArabic";

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
  "اكاديمية",
  "معهد",
  "جامع",
  "مسجد",
  "سوق",
  "حي",
  "ضاحية",
  "باب",
  "جسر",
  "ميدان",
  "دكتور",
  "الدكتور",
  "دكتوره",
  "الدكتوره",
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

function addAlias(aliasSet: Set<string>, value: string | null | undefined) {
  const normalized = normalizeArabic(value ?? "");
  if (normalized.length < 2 || GENERIC_ALIASES.has(normalized)) {
    return;
  }
  aliasSet.add(normalized);
}

function withoutLeadingArticle(value: string): string {
  return value
    .split(" ")
    .map((token) => token.startsWith("ال") && token.length > 3 ? token.slice(2) : token)
    .join(" ");
}

function addArabicVariants(aliasSet: Set<string>, value: string) {
  const normalized = normalizeArabic(value);
  if (!normalized) {
    return;
  }

  addAlias(aliasSet, normalized);
  addAlias(aliasSet, withoutLeadingArticle(normalized));

  const numberFirst = normalized.match(/^(\d+)\s+(.+)$/u);
  if (numberFirst?.[1] && numberFirst[2]) {
    addAlias(aliasSet, `${numberFirst[2]} ${numberFirst[1]}`);
  }

  for (const type of LEADING_PLACE_TYPES) {
    const normalizedType = normalizeArabic(type);
    if (normalized === normalizedType) {
      continue;
    }

    if (normalized.startsWith(`${normalizedType} `)) {
      const rest = normalized.slice(normalizedType.length).trim();
      addAlias(aliasSet, rest);
      addAlias(aliasSet, withoutLeadingArticle(rest));
    }
  }

  if (normalized.includes("مستشفي")) {
    addAlias(aliasSet, normalized.replace(/مستشفي/g, "مشفي"));
  }
  if (normalized.includes("مشفي")) {
    addAlias(aliasSet, normalized.replace(/مشفي/g, "مستشفي"));
  }
  if (normalized.includes("كراجات")) {
    addAlias(aliasSet, normalized.replace(/كراجات/g, "كراج"));
  }
  if (normalized.includes("كراج")) {
    addAlias(aliasSet, normalized.replace(/كراج/g, "كراجات"));
  }
}

export function buildLandmarkAliases(landmark: LandmarkEntry): string[] {
  const aliasSet = new Set<string>();
  const rawAliases = [
    landmark.nameAr,
    landmark.nameEn,
    ...landmark.aliases,
  ];

  for (const alias of rawAliases) {
    addAlias(aliasSet, alias);
    if (/[\u0600-\u06FF]/.test(alias)) {
      addArabicVariants(aliasSet, alias);
    }
  }

  return Array.from(aliasSet);
}
