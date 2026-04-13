import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as SecureStore from "expo-secure-store";

export type AppLanguage = "en" | "ar";

type LanguageContextType = {
  language: AppLanguage;
  isRTL: boolean;
  isLoading: boolean;
  setLanguage: (next: AppLanguage) => Promise<void>;
  t: (key: string) => string;
};

const STORAGE_KEY = "app_language";

const en: Record<string, string> = {
  "tabs.home": "Home",
  "tabs.settings": "Settings",

  "settings.title": "Settings",
  "settings.subtitle": "Customize your movement through the city.",
  "settings.userFallback": "User",
  "settings.section.transportation": "Transportation",
  "settings.routes.title": "Routes Map",
  "settings.routes.subtitle": "View and toggle active bus lines",
  "settings.preferences.title": "Preferences",
  "settings.preferences.subtitle": "Customize routing factors",
  "settings.history.title": "Travel History",
  "settings.history.subtitle": "See and manage your saved route history",
  "settings.language.title": "Language",
  "settings.language.subtitle": "Choose app language",
  "settings.signout": "Sign Out",

  "language.english": "English",
  "language.arabic": "Arabic",

  "preferences.title": "Preferences",
  "preferences.heroLabel": "Customization",
  "preferences.heroTitle": "Routing Preferences",
  "preferences.heroSubtitle":
    "Adjust and save weights/options used by routing.",
  "preferences.loading": "Loading saved values...",
  "preferences.speed": "Speed",
  "preferences.crowding": "Avoid Crowds",
  "preferences.price": "Price Sensitivity",
  "preferences.transfer": "Fewer Transfers",
  "preferences.walking": "Walking",
  "preferences.options.section": "Routing Options",
  "preferences.options.maxWalkingDistance": "Max Walking Distance (m)",
  "preferences.options.maxTotalWalkingDistance":
    "Max Total Walking Distance (m)",
  "preferences.options.maxWalkingNeighbors": "Max Walking Neighbors",
  "preferences.options.maxBusTransfers": "Max Bus Transfers",
  "preferences.options.walkingSpeed": "Walking Speed (m/s)",
  "preferences.hint.min50": "min 50",
  "preferences.hint.rangeWalkTotal": "range 0 .. 10000",
  "preferences.hint.rangeNeighbors": "range 1 .. 100",
  "preferences.hint.rangeTransfers": "range 0 .. 10",
  "preferences.hint.rangeSpeed": "range 0.4 .. 3.5",
  "preferences.save": "Save Preferences",
  "preferences.saveError": "Could not save preferences.",

  "history.title": "Travel History",
  "history.subtitle": "User #{id} - last {limit} trips",
  "history.refresh": "Refresh",
  "history.loading": "Loading history...",
  "history.loadError":
    "Could not load travel history. Pull to retry or tap refresh.",
  "history.empty": "No history entries yet.",
  "history.delete": "Delete",
  "history.deleteTitle": "Delete Entry",
  "history.deleteBody":
    "Are you sure you want to remove this travel history item?",
  "history.deleteSuccess": "History entry deleted.",
  "history.deleteError": "Could not delete history entry.",
  "history.unknownOrigin": "Unknown origin",
  "history.unknownDest": "Unknown destination",
  "history.unknownTime": "Unknown time",
  "history.metric.transfers": "Transfers",
  "history.metric.distance": "Distance",
  "history.metric.duration": "Duration",

  "planner.title": "Route Planner",
  "planner.pref.loading": "Loading saved preferences...",
  "planner.pref.saved": "Using saved preferences",
  "planner.pref.defaults": "Using server defaults",
  "planner.start": "Start",
  "planner.destination": "Destination",
  "planner.tapStart": "Tap Map: Set Start",
  "planner.tapDestination": "Tap Map: Set Destination",
  "planner.locked": "Route is locked. Press Clear to choose a new destination.",
  "planner.request": "Request Route",
  "planner.clear": "Clear",
  "planner.textPlaceholder":
    "Try: from Bab Touma to Hamra / من باب توما إلى الحمراء",
  "planner.useText": "Use Text",

  "search.placeholder": "Search place on map",

  "route.eta": "ETA",
  "route.min": "min",
  "route.transfers": "Transfers",
  "route.walk": "Walk",

  "steps.walk": "Walk",
  "steps.takeBus": "Take Bus",
  "steps.routeFallback": "Route",
  "steps.via": "via",

  "feedback.title": "Route Feedback",
  "feedback.hide": "Hide",
  "feedback.give": "Give Feedback",
  "feedback.route": "Route",
  "feedback.summary": "Route Feedback Summary (30 days)",
  "feedback.loadingSummary": "Loading summary...",
  "feedback.reports": "Reports",
  "feedback.avgPrice": "Avg Price",
  "feedback.avgCrowding": "Avg Crowding",
  "feedback.avgSpeed": "Avg Speed",
  "feedback.avgSlowness": "Avg Slowness",
  "feedback.crowdingTendency": "Crowding Tendency",
  "feedback.speedSuggestion": "Speed Suggestion",
  "feedback.lastReport": "Last Report",
  "feedback.noSummary": "No summary available yet.",
  "feedback.reportedPrice": "Reported Price",
  "feedback.crowdingLevel": "Crowding Level",
  "feedback.speedLevel": "Speed Level",
  "feedback.slownessLevel": "Slowness Level",
  "feedback.comment": "Comment (Optional)",
  "feedback.commentPlaceholder": "Share your experience",
  "feedback.skip": "Skip",
  "feedback.submit": "Submit Feedback",
  "feedback.thanks": "Thanks",
  "feedback.submitted": "Feedback submitted successfully.",
  "feedback.missingRouteTitle": "Missing route",
  "feedback.missingRouteBody": "Select a bus route to submit feedback.",
  "feedback.invalidPriceTitle": "Invalid price",
  "feedback.invalidPriceBody": "Reported price must be 0 or greater.",

  "home.error.missingPointsTitle": "Missing points",
  "home.error.missingPointsBody":
    "Current location and destination are required.",
  "home.error.routeFailedTitle": "Route request failed",
  "home.error.searchNoPlaceTitle": "No place found",
  "home.error.searchNoPlaceBody": "Try a more specific place name.",
  "home.error.searchFailedTitle": "Search failed",
  "home.error.searchFailedBody": "Could not search places right now.",
  "home.error.locationPermission": "Location permission not granted.",
};

const ar: Record<string, string> = {
  "tabs.home": "الرئيسية",
  "tabs.settings": "الإعدادات",

  "settings.title": "الإعدادات",
  "settings.subtitle": "خصص تنقلك داخل المدينة.",
  "settings.userFallback": "مستخدم",
  "settings.section.transportation": "النقل",
  "settings.routes.title": "خريطة الخطوط",
  "settings.routes.subtitle": "عرض وتبديل خطوط الباص",
  "settings.preferences.title": "التفضيلات",
  "settings.preferences.subtitle": "تخصيص عوامل التوجيه",
  "settings.history.title": "سجل الرحلات",
  "settings.history.subtitle": "عرض وإدارة سجل الرحلات",
  "settings.language.title": "اللغة",
  "settings.language.subtitle": "اختر لغة التطبيق",
  "settings.signout": "تسجيل الخروج",

  "language.english": "الإنجليزية",
  "language.arabic": "العربية",

  "preferences.title": "التفضيلات",
  "preferences.heroLabel": "تخصيص",
  "preferences.heroTitle": "تفضيلات التوجيه",
  "preferences.heroSubtitle":
    "عدّل واحفظ الأوزان والخيارات المستخدمة في التوجيه.",
  "preferences.loading": "جاري تحميل القيم المحفوظة...",
  "preferences.speed": "السرعة",
  "preferences.crowding": "تجنب الازدحام",
  "preferences.price": "حساسية السعر",
  "preferences.transfer": "تقليل التحويلات",
  "preferences.walking": "المشي",
  "preferences.options.section": "خيارات التوجيه",
  "preferences.options.maxWalkingDistance": "الحد الأقصى للمشي (م)",
  "preferences.options.maxTotalWalkingDistance":
    "الحد الأقصى لإجمالي المشي (م)",
  "preferences.options.maxWalkingNeighbors": "أقصى جيران للمشي",
  "preferences.options.maxBusTransfers": "أقصى تحويلات باص",
  "preferences.options.walkingSpeed": "سرعة المشي (م/ث)",
  "preferences.hint.min50": "الحد الأدنى 50",
  "preferences.hint.rangeWalkTotal": "المدى 0 .. 10000",
  "preferences.hint.rangeNeighbors": "المدى 1 .. 100",
  "preferences.hint.rangeTransfers": "المدى 0 .. 10",
  "preferences.hint.rangeSpeed": "المدى 0.4 .. 3.5",
  "preferences.save": "حفظ التفضيلات",
  "preferences.saveError": "تعذر حفظ التفضيلات.",

  "history.title": "سجل الرحلات",
  "history.subtitle": "المستخدم #{id} - آخر {limit} رحلات",
  "history.refresh": "تحديث",
  "history.loading": "جاري تحميل السجل...",
  "history.loadError":
    "تعذر تحميل سجل الرحلات. اسحب لإعادة المحاولة أو اضغط تحديث.",
  "history.empty": "لا توجد رحلات محفوظة بعد.",
  "history.delete": "حذف",
  "history.deleteTitle": "حذف الرحلة",
  "history.deleteBody": "هل تريد حذف هذا العنصر من سجل الرحلات؟",
  "history.deleteSuccess": "تم حذف عنصر السجل.",
  "history.deleteError": "تعذر حذف عنصر السجل.",
  "history.unknownOrigin": "بداية غير معروفة",
  "history.unknownDest": "وجهة غير معروفة",
  "history.unknownTime": "وقت غير معروف",
  "history.metric.transfers": "التحويلات",
  "history.metric.distance": "المسافة",
  "history.metric.duration": "المدة",

  "planner.title": "مخطط الرحلة",
  "planner.pref.loading": "جاري تحميل التفضيلات...",
  "planner.pref.saved": "يتم استخدام التفضيلات المحفوظة",
  "planner.pref.defaults": "يتم استخدام القيم الافتراضية",
  "planner.start": "البداية",
  "planner.destination": "الوجهة",
  "planner.tapStart": "المس الخريطة: تحديد البداية",
  "planner.tapDestination": "المس الخريطة: تحديد الوجهة",
  "planner.locked": "المسار مقفل. اضغط مسح لاختيار وجهة جديدة.",
  "planner.request": "طلب مسار",
  "planner.clear": "مسح",
  "planner.textPlaceholder": "مثال: من باب توما إلى الحمرا",
  "planner.useText": "استخدام النص",

  "search.placeholder": "ابحث عن مكان على الخريطة",

  "route.eta": "الوقت المتوقع",
  "route.min": "د",
  "route.transfers": "التحويلات",
  "route.walk": "المشي",

  "steps.walk": "مشي",
  "steps.takeBus": "اركب باص",
  "steps.routeFallback": "خط",
  "steps.via": "عبر",

  "feedback.title": "تقييم الرحلة",
  "feedback.hide": "إخفاء",
  "feedback.give": "أضف تقييم",
  "feedback.route": "الخط",
  "feedback.summary": "ملخص تقييم الخط (30 يوم)",
  "feedback.loadingSummary": "جاري تحميل الملخص...",
  "feedback.reports": "عدد التقارير",
  "feedback.avgPrice": "متوسط السعر",
  "feedback.avgCrowding": "متوسط الازدحام",
  "feedback.avgSpeed": "متوسط السرعة",
  "feedback.avgSlowness": "متوسط البطء",
  "feedback.crowdingTendency": "ميل الازدحام",
  "feedback.speedSuggestion": "اقتراح السرعة",
  "feedback.lastReport": "آخر تقرير",
  "feedback.noSummary": "لا يوجد ملخص بعد.",
  "feedback.reportedPrice": "السعر المبلّغ",
  "feedback.crowdingLevel": "مستوى الازدحام",
  "feedback.speedLevel": "مستوى السرعة",
  "feedback.slownessLevel": "مستوى البطء",
  "feedback.comment": "تعليق (اختياري)",
  "feedback.commentPlaceholder": "شارك تجربتك",
  "feedback.skip": "تخطي",
  "feedback.submit": "إرسال التقييم",
  "feedback.thanks": "شكرًا",
  "feedback.submitted": "تم إرسال التقييم بنجاح.",
  "feedback.missingRouteTitle": "الخط غير محدد",
  "feedback.missingRouteBody": "اختر خط باص لإرسال التقييم.",
  "feedback.invalidPriceTitle": "سعر غير صالح",
  "feedback.invalidPriceBody": "يجب أن يكون السعر 0 أو أكبر.",

  "home.error.missingPointsTitle": "نقاط ناقصة",
  "home.error.missingPointsBody": "يجب تحديد نقطة البداية والوجهة.",
  "home.error.routeFailedTitle": "فشل طلب المسار",
  "home.error.searchNoPlaceTitle": "لم يتم العثور على مكان",
  "home.error.searchNoPlaceBody": "جرّب اسم مكان أكثر دقة.",
  "home.error.searchFailedTitle": "فشل البحث",
  "home.error.searchFailedBody": "تعذر البحث عن الأماكن الآن.",
  "home.error.locationPermission": "لم يتم منح إذن الموقع.",
};

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>("en");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORAGE_KEY);
        if (stored === "ar" || stored === "en") {
          setLanguageState(stored);
        }
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const setLanguage = async (next: AppLanguage) => {
    setLanguageState(next);
    await SecureStore.setItemAsync(STORAGE_KEY, next);
  };

  const dictionary = language === "ar" ? ar : en;

  const value = useMemo<LanguageContextType>(
    () => ({
      language,
      isRTL: language === "ar",
      isLoading,
      setLanguage,
      t: (key: string) => dictionary[key] ?? en[key] ?? key,
    }),
    [dictionary, isLoading, language],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return context;
}
