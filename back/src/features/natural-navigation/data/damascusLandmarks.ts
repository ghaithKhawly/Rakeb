import { curatedOsmLandmarks } from "./damascusLandmarks.osm";

export type LandmarkEntry = {
  id: string;
  nameAr: string;
  nameEn: string;
  aliases: string[];
  lat: number;
  lng: number;
};

export const damascusLandmarks: LandmarkEntry[] = [
  { id: "marjeh_square", nameAr: "ساحة المرجة", nameEn: "Marjeh Square", aliases: ["مرجة", "المرجة", "marjeh", "marja", "martyrs square"], lat: 33.5136, lng: 36.2974 },
  { id: "damascus_university", nameAr: "جامعة دمشق", nameEn: "Damascus University", aliases: ["الجامعة", "جامعة", "damascus university", "the university"], lat: 33.5142, lng: 36.2785 },
  { id: "mouwasat_hospital", nameAr: "مستشفى المواساة", nameEn: "Al-Mouwasat Hospital", aliases: ["مستشفى المواساة", "المواساة", "mouwasat hospital"], lat: 33.5159, lng: 36.2759 },
  { id: "al_assad_hospital", nameAr: "مستشفى الأسد الجامعي", nameEn: "Al-Assad University Hospital", aliases: ["مستشفى الأسد", "الأسد الجامعي", "assad hospital"], lat: 33.5168, lng: 36.2766 },
  { id: "tishreen_hospital", nameAr: "مستشفى تشرين", nameEn: "Tishreen Hospital", aliases: ["مستشفى تشرين", "tishreen hospital"], lat: 33.5188, lng: 36.2886 },
  { id: "hijaz_station", nameAr: "محطة الحجاز", nameEn: "Hijaz Station", aliases: ["الحجاز", "محطة الحجاز", "hijaz"], lat: 33.5056, lng: 36.2876 },
  { id: "abbasiyyin", nameAr: "ساحة العباسيين", nameEn: "Abbasiyyin Square", aliases: ["العباسيين", "abbasiyyin"], lat: 33.5226, lng: 36.3112 },
  { id: "bab_touma", nameAr: "باب توما", nameEn: "Bab Touma", aliases: ["باب توما", "bab touma"], lat: 33.5147, lng: 36.3117 },
  { id: "bab_sharqi", nameAr: "باب شرقي", nameEn: "Bab Sharqi", aliases: ["باب شرقي", "bab sharqi"], lat: 33.5107, lng: 36.3128 },
  { id: "baramkeh", nameAr: "البرامكة", nameEn: "Baramkeh", aliases: ["برامكة", "البرامكة", "baramkeh"], lat: 33.5088, lng: 36.2834 },
  { id: "shamdin_square", nameAr: "ساحة الشهداء", nameEn: "Martyrs Square", aliases: ["ساحة الشهداء", "martyrs square"], lat: 33.5135, lng: 36.2973 },
  { id: "hamidiyah_souq", nameAr: "سوق الحميدية", nameEn: "Al-Hamidiyah Souq", aliases: ["الحميدية", "سوق الحميدية", "hamidiyah"], lat: 33.5101, lng: 36.3048 },
  { id: "umayyad_mosque", nameAr: "الجامع الأموي", nameEn: "Umayyad Mosque", aliases: ["الأموي", "الجامع الأموي", "umayyad mosque"], lat: 33.5111, lng: 36.3066 },
  { id: "mezzeh", nameAr: "المزة", nameEn: "Mezzeh", aliases: ["مزة", "المزة", "mezzeh"], lat: 33.4908, lng: 36.2415 },
  { id: "kafar_souseh", nameAr: "كفرسوسة", nameEn: "Kafar Souseh", aliases: ["كفرسوسة", "kafar souseh"], lat: 33.4918, lng: 36.2756 },
  { id: "jaramana", nameAr: "جرمانا", nameEn: "Jaramana", aliases: ["جرمانا", "jaramana"], lat: 33.4777, lng: 36.3395 },
  { id: "qaboun", nameAr: "القابون", nameEn: "Qaboun", aliases: ["قابون", "القابون", "qaboun"], lat: 33.5342, lng: 36.3307 },
  { id: "jobar", nameAr: "جوبر", nameEn: "Jobar", aliases: ["جوبر", "jobar"], lat: 33.5245, lng: 36.3344 },
  { id: "ruken_eddin", nameAr: "ركن الدين", nameEn: "Ruken al-Din", aliases: ["ركن الدين", "ruken", "ruken eddin"], lat: 33.5345, lng: 36.2978 },
  { id: "malki", nameAr: "المالكي", nameEn: "Al-Malki", aliases: ["المالكي", "malki"], lat: 33.5241, lng: 36.2868 },
  { id: "shaalan", nameAr: "الشعلان", nameEn: "Shaalan", aliases: ["شعلان", "الشعلان", "shaalan"], lat: 33.5151, lng: 36.2889 },
  { id: "rawda", nameAr: "الروضة", nameEn: "Rawda", aliases: ["الروضة", "rawda"], lat: 33.5221, lng: 36.2891 },
  { id: "midan", nameAr: "الميدان", nameEn: "Al-Midan", aliases: ["الميدان", "midan"], lat: 33.4927, lng: 36.2932 },
  { id: "zahira", nameAr: "الزاهرة", nameEn: "Zahira", aliases: ["الزاهرة", "zahira"], lat: 33.4845, lng: 36.3018 },
  { id: "qadam", nameAr: "القدم", nameEn: "Qadam", aliases: ["القدم", "qadam"], lat: 33.4704, lng: 36.2921 },
  { id: "yarmouk", nameAr: "مخيم اليرموك", nameEn: "Yarmouk Camp", aliases: ["اليرموك", "مخيم اليرموك", "yarmouk"], lat: 33.4528, lng: 36.2752 },
  { id: "dummar", nameAr: "ضاحية دمر", nameEn: "Dummar", aliases: ["دمر", "ضاحية دمر", "dummar"], lat: 33.5411, lng: 36.2437 },
  { id: "qassyoun", nameAr: "جبل قاسيون", nameEn: "Mount Qassioun", aliases: ["قاسيون", "جبل قاسيون", "qassioun"], lat: 33.531, lng: 36.2689 },
  { id: "mujtahid_hospital", nameAr: "مستشفى المجتهد", nameEn: "Al-Mujtahid Hospital", aliases: ["المجتهد", "مستشفى المجتهد", "mujtahid hospital"], lat: 33.5098, lng: 36.3202 },
  { id: "harasta_hospital", nameAr: "مستشفى حرستا", nameEn: "Harasta Hospital", aliases: ["مستشفى حرستا", "harasta hospital"], lat: 33.5582, lng: 36.365 },
  { id: "haramoun_station", nameAr: "كراجات حرستا", nameEn: "Harasta Garage", aliases: ["كراج حرستا", "حرستا كراجات", "harasta garage"], lat: 33.5575, lng: 36.3641 },
  { id: "souq_al_hal", nameAr: "سوق الهال", nameEn: "Souq al-Hal", aliases: ["سوق الهال", "souq al hal"], lat: 33.4951, lng: 36.2877 },
  { id: "tishreen_park", nameAr: "حديقة تشرين", nameEn: "Tishreen Park", aliases: ["حديقة تشرين", "tishreen park"], lat: 33.5176, lng: 36.2807 },
  { id: "jalaa_stadium", nameAr: "ملعب الجلاء", nameEn: "Jalaa Stadium", aliases: ["ملعب الجلاء", "jalaa stadium"], lat: 33.5091, lng: 36.2788 },
  { id: "faihaa_stadium", nameAr: "مدينة الفيحاء الرياضية", nameEn: "Al-Fayhaa Sports City", aliases: ["الفيحاء", "مدينة الفيحاء", "faihaa"], lat: 33.5198, lng: 36.3092 },
  { id: "kindi_hospital", nameAr: "مستشفى الكندي", nameEn: "Al-Kindi Hospital", aliases: ["مستشفى الكندي", "الكندي", "kindi hospital"], lat: 33.5356, lng: 36.3314 },
  { id: "barzeh", nameAr: "برزة", nameEn: "Barzeh", aliases: ["برزة", "barzeh"], lat: 33.5591, lng: 36.2914 },
  { id: "hameh", nameAr: "الهامة", nameEn: "Al-Hameh", aliases: ["الهامة", "hameh"], lat: 33.5668, lng: 36.211 },
  { id: "sahnaya", nameAr: "صحنايا", nameEn: "Sahnaya", aliases: ["صحنايا", "sahnaya"], lat: 33.3968, lng: 36.2241 },
  { id: "ashrafieh_sahnaya", nameAr: "أشرفية صحنايا", nameEn: "Ashrafiyat Sahnaya", aliases: ["اشرفية صحنايا", "أشرفية صحنايا", "ashrafiyat sahnaya"], lat: 33.4054, lng: 36.2166 },
  { id: "muhajreen", nameAr: "المهاجرين", nameEn: "Muhajreen", aliases: ["المهاجرين", "muhajreen"], lat: 33.5307, lng: 36.286 },
  { id: "victoria_bridge", nameAr: "جسر فكتوريا", nameEn: "Victoria Bridge", aliases: ["جسر فكتوريا", "victoria bridge"], lat: 33.509, lng: 36.3014 },
  { id: "hospital_generic", nameAr: "مستشفى", nameEn: "Hospital", aliases: ["مستشفى", "hospital"], lat: 33.516, lng: 36.286 },
  ...curatedOsmLandmarks,
];

const byId = new Map(damascusLandmarks.map((item) => [item.id, item]));

export function getLandmarkById(id: string) {
  return byId.get(id) ?? null;
}

export function getLandmarkListForPrompt(): string {
  return damascusLandmarks
    .map((l) => `${l.id}|${l.nameAr}|${l.nameEn}|${l.aliases.join("/")}`)
    .join("\n");
}

export function getLandmarkCandidates(rawText: string): string[] {
  const text = rawText.trim().toLowerCase();
  if (!text) {
    return [];
  }

  const scored = damascusLandmarks
    .map((landmark) => {
      let score = 0;
      const allNames = [landmark.nameAr, landmark.nameEn, ...landmark.aliases].map((x) => x.toLowerCase());
      for (const candidate of allNames) {
        if (candidate === text) {
          score += 3;
        } else if (text.includes(candidate) || candidate.includes(text)) {
          score += 1;
        }
      }
      return { id: landmark.id, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((entry) => entry.id);
}

export function isWithinDamascus(point: { lat: number; lng: number }): boolean {
  return point.lat >= 33.35 && point.lat <= 33.65 && point.lng >= 36.15 && point.lng <= 36.45;
}
