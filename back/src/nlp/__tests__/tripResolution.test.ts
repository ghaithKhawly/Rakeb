import Fastify from "fastify";
import { extractRawLocations } from "../extractLocations";
import { resolveLandmarkQuery } from "../landmarkSearch";
import { normalizeArabic } from "../normalizeArabic";
import { resolveTrip } from "../resolveTrip";
import { clearSessionStore, getSession, saveSession } from "../sessionStore";
import { tripRoutes } from "../../routes/tripRoutes";
import { allDamascusLandmarks } from "../../data/damascusLandmarks";
import "../../plugins/jwt";

describe("Arabic NLP trip resolution", () => {
  beforeEach(() => {
    clearSessionStore();
    jest.useRealTimers();
  });

  test("normalizes Arabic consistently", () => {
    expect(normalizeArabic("أبو رمانة، إلى المشفى")).toBe("ابو رمانه الي المشفي");
    expect(normalizeArabic("آإأا ة ى مُدَرَّسة")).toBe("اااا ه ي مدرسه");
    expect(normalizeArabic("١٦ تشرين، (المرجة)!")).toBe("16 تشرين المرجه");
  });

  test("extracts origin and destination patterns in the expected order", () => {
    expect(extractRawLocations("من عند المرجة للجامعة")).toEqual({
      originText: "المرجه",
      destText: "جامعه",
      isFollowUp: false,
    });

    expect(extractRawLocations("خدني على المزة")).toEqual({
      originText: null,
      destText: "المزه",
      isFollowUp: false,
    });

    expect(extractRawLocations("من هون لباب توما")).toEqual({
      originText: null,
      destText: "باب توما",
      isFollowUp: false,
    });

    expect(extractRawLocations("من هون")).toEqual({
      originText: null,
      destText: null,
      isFollowUp: true,
    });

    expect(extractRawLocations("رح عالجامعة من المرجة")).toEqual({
      originText: "المرجه",
      destText: "جامعه",
      isFollowUp: false,
    });

    expect(extractRawLocations("من المرجة")).toEqual({
      originText: "المرجه",
      destText: null,
      isFollowUp: false,
    });

    expect(extractRawLocations("الجامعة")).toEqual({
      originText: null,
      destText: "الجامعه",
      isFollowUp: false,
    });

    expect(extractRawLocations("من هون للجامعة")).toEqual({
      originText: null,
      destText: "جامعه",
      isFollowUp: false,
    });
  });

  test("deduplicates fuzzy candidates and marks near ties as ambiguous", () => {
    expect(resolveLandmarkQuery("ا").candidates).toHaveLength(0);

    const resolution = resolveLandmarkQuery("العباسيين");
    expect(resolution.isAmbiguous).toBe(true);
    expect(resolution.candidates.map((candidate) => candidate.landmark.nameAr)).toEqual([
      "ساحة العباسيين",
      "كراج العباسيين",
    ]);
  });

  test("returns a confident match for exact aliases", () => {
    const resolution = resolveLandmarkQuery("ساحة المرجة");
    expect(resolution.isAmbiguous).toBe(false);
    expect(resolution.match?.landmark.id).toBe("core_marjeh");
    expect(resolution.match?.score ?? 1).toBeLessThan(0.4);
  });

  test("expires sessions lazily after the TTL", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-06-01T10:00:00.000Z"));

    saveSession("ttl-session", {
      lastOrigin: {
        id: "test_origin",
        nameAr: "اختبار",
        nameEn: "Test",
        aliases: [],
        lat: 33,
        lng: 36,
      },
    });

    jest.setSystemTime(new Date("2026-06-01T10:31:00.000Z"));
    expect(getSession("ttl-session").lastOrigin).toBeNull();
  });

  test("resolves full trips, clarification, and follow-up origin flows", async () => {
    const resolved = await resolveTrip("من المرجة إلى الجامعة", "trip-full");
    expect(resolved.status).toBe("resolved");
    expect(resolved.origin?.nameAr).toBe("ساحة المرجة");
    expect(resolved.destination?.nameAr).toBe("جامعة دمشق");

    const ambiguous = await resolveTrip("من المرجة الى العباسيين", "trip-ambiguous");
    expect(ambiguous.status).toBe("needs_clarification");
    expect(ambiguous.origin?.nameAr).toBe("ساحة المرجة");
    expect(ambiguous.candidates.map((candidate) => candidate.nameAr)).toEqual([
      "ساحة العباسيين",
      "كراج العباسيين",
    ]);

    const clarified = await resolveTrip("كراج العباسيين", "trip-ambiguous");
    expect(clarified.status).toBe("resolved");
    expect(clarified.destination?.nameAr).toBe("كراج العباسيين");

    await resolveTrip("من المرجة للجامعة", "trip-follow-up");
    const followUp = await resolveTrip("من هون لباب توما", "trip-follow-up");
    expect(followUp.status).toBe("resolved");
    expect(followUp.origin?.nameAr).toBe("جامعة دمشق");
    expect(followUp.destination?.nameAr).toBe("باب توما");
  });

  test("handles origin-only, destination-only, and empty follow-up sessions", async () => {
    const originOnly = await resolveTrip("من المرجة", "trip-origin-only");
    expect(originOnly.status).toBe("needs_destination");
    expect(originOnly.origin?.nameAr).toBe("ساحة المرجة");
    expect(originOnly.destination).toBeNull();

    const destinationOnly = await resolveTrip("جامعة دمشق", "trip-destination-only");
    expect(destinationOnly.status).toBe("needs_origin");
    expect(destinationOnly.origin).toBeNull();
    expect(destinationOnly.destination?.nameAr).toBe("جامعة دمشق");

    const followUpEmpty = await resolveTrip("من هون", "trip-follow-up-empty");
    expect(followUpEmpty.status).toBe("needs_destination");
    expect(followUpEmpty.origin).toBeNull();
  });

  test("keeps clarification state when reply is still ambiguous", async () => {
    saveSession("trip-ambiguous-reply", { pendingClarification: "destination" });
    const ambiguousReply = await resolveTrip("العباسيين", "trip-ambiguous-reply");
    expect(ambiguousReply.status).toBe("needs_clarification");
    expect(ambiguousReply.candidates.length).toBeGreaterThan(0);
  });

  test.each([
    ["إلى الجامعة من المرجة", "المرجه", "الجامعه"],
    ["من المرجة حتى الجامعة", "المرجه", "الجامعه"],
    ["بين المرجة والجامعة", "المرجه", "الجامعه"],
    ["طريق من كفرسوسة إلى باب توما", "كفرسوسه", "باب توما"],
    ["وصلني من عرنوس للمواساة", "عرنوس", "مواساه"],
    ["كيف الطريق للجامعة من المرجة", "المرجه", "جامعه"],
    ["بدي روح عالجامعة من المرجة", "المرجه", "جامعه"],
    ["رح عالجامعة من عند المرجة", "المرجه", "جامعه"],
    ["أنا بالمرجة وبدي روح عالجامعة", "مرجه", "جامعه"],
    ["الانطلاق من المرجة والوجهة الجامعة", "المرجه", "الجامعه"],
    ["from marjeh to damascus university", "marjeh", "damascus university"],
    ["marjeh to damascus university", "marjeh", "damascus university"],
    ["المرجة -> الجامعة", "المرجه", "الجامعه"],
    ["المرجة - الجامعة", "المرجه", "الجامعه"],
  ])("extracts route phrase %# consistently", (input, originText, destText) => {
    expect(extractRawLocations(input)).toEqual({
      originText,
      destText,
      isFollowUp: false,
    });
  });

  test.each([
    ["أبو رمانة", "ابو رمانه"],
    ["اِلمَرْجَة", "المرجه"],
    ["كفرسوسة، باب توما؟", "كفرسوسه باب توما"],
    ["محطة الحجاز!!!", "محطه الحجاز"],
    ["ساحة الأُمويين", "ساحه الامويين"],
    ["١٦ تشرين", "16 تشرين"],
    ["مُسْتَشْفَى المُوَاسَاة", "مستشفي المواساه"],
    ["جامعة دمشق (البرامكة)", "جامعه دمشق البرامكه"],
  ])("normalizes edge spelling %#", (input, expected) => {
    expect(normalizeArabic(input)).toBe(expected);
  });

  test.each([
    ["من المرجة إلى الجامعة", "ساحة المرجة", "جامعة دمشق"],
    ["بين المرجة والجامعة", "ساحة المرجة", "جامعة دمشق"],
    ["المرجة - الجامعة", "ساحة المرجة", "جامعة دمشق"],
    ["from marjeh to damascus university", "ساحة المرجة", "جامعة دمشق"],
    ["جامعة دمشق من المرجة", "ساحة المرجة", "جامعة دمشق"],
    ["كيف الطريق للجامعة من المرجة", "ساحة المرجة", "جامعة دمشق"],
    ["بدي روح عالجامعة من المرجة", "ساحة المرجة", "جامعة دمشق"],
    ["وصلني من عرنوس للمواساة", "ساحة عرنوس", "مستشفى المواساة"],
    ["طريق من كفرسوسة إلى باب توما", "كفرسوسة", "باب توما"],
    ["من ساحة الامويين الى كراج السومرية", "ساحة الأمويين", "كراج السومرية"],
    ["من برزة الى القنوات", "برزة", "القنوات"],
    ["من ساروجة إلى القصاع", "ساروجة", "القصاع"],
    ["من الشاغور للميدان", "الشاغور", "الميدان"],
    ["من ابو رمانة للميسات", "أبو رمانة", "الميسات"],
    ["من القيمرية الى الحريقة", "القيمرية", "الحريقة"],
    ["من الزبلطاني الى الجامعة", "الزبلطاني", "جامعة دمشق"],
    ["انا عند المرجة بدي روح جامعة دمشق", "ساحة المرجة", "جامعة دمشق"],
    ["انا بالمرجة رايح عالجامعة", "ساحة المرجة", "جامعة دمشق"],
  ])("resolves common trip phrase %#", async (input, origin, destination) => {
    const result = await resolveTrip(input, `table-resolve-${input}`);
    expect(result.status).toBe("resolved");
    expect(result.origin?.nameAr).toBe(origin);
    expect(result.destination?.nameAr).toBe(destination);
  });

  test.each([
    ["خدني على المزة", "المزة"],
    ["بدي اروح جامعة دمشق", "جامعة دمشق"],
    ["من موقعي الى باب توما", "باب توما"],
    ["من عندي للجامعة", "جامعة دمشق"],
    ["من البيت للجامعة", "جامعة دمشق"],
    ["من نفس المكان لباب توما", "باب توما"],
  ])("keeps known destination while asking for origin %#", async (input, destination) => {
    const result = await resolveTrip(input, `needs-origin-${input}`);
    expect(result.status).toBe("needs_origin");
    expect(result.origin).toBeNull();
    expect(result.destination?.nameAr).toBe(destination);
    expect(result.clarificationQuestion).toBeTruthy();
  });

  test.each([
    ["من المرجة", "ساحة المرجة"],
    ["من عرنوس", "ساحة عرنوس"],
    ["انا بالمرجة", "ساحة المرجة"],
  ])("keeps known origin while asking for destination %#", async (input, origin) => {
    const result = await resolveTrip(input, `needs-destination-${input}`);
    expect(result.status).toBe("needs_destination");
    expect(result.origin?.nameAr).toBe(origin);
    expect(result.destination).toBeNull();
    expect(result.clarificationQuestion).toBeTruthy();
  });

  test("uses last destination as follow-up origin only when no explicit origin is provided", async () => {
    await resolveTrip("من المرجة للجامعة", "trip-follow-up-explicit");

    const implicit = await resolveTrip("من هون لباب توما", "trip-follow-up-explicit");
    expect(implicit.status).toBe("resolved");
    expect(implicit.origin?.nameAr).toBe("جامعة دمشق");
    expect(implicit.destination?.nameAr).toBe("باب توما");

    const explicit = await resolveTrip("من عرنوس لباب توما", "trip-follow-up-explicit");
    expect(explicit.status).toBe("resolved");
    expect(explicit.origin?.nameAr).toBe("ساحة عرنوس");
    expect(explicit.destination?.nameAr).toBe("باب توما");
  });

  test.each([
    ["خدني على المزة", "من المرجة", "ساحة المرجة", "المزة"],
    ["بدي اروح جامعة دمشق", "من عرنوس", "ساحة عرنوس", "جامعة دمشق"],
    ["من موقعي الى باب توما", "من كفرسوسة", "كفرسوسة", "باب توما"],
    ["من عندي للجامعة", "من الميدان", "الميدان", "جامعة دمشق"],
    ["الجامع الأموي", "من المرجة", "ساحة المرجة", "الجامع الأموي"],
  ])(
    "resolves after destination-only request asks for origin %#",
    async (destinationOnlyInput, originAnswer, expectedOrigin, expectedDestination) => {
      const sessionId = `destination-only-followup-${destinationOnlyInput}`;
      const first = await resolveTrip(destinationOnlyInput, sessionId);

      expect(first.status).toBe("needs_origin");
      expect(first.origin).toBeNull();
      expect(first.destination?.nameAr).toBe(expectedDestination);
      expect(first.clarificationQuestion).toBeTruthy();

      const second = await resolveTrip(originAnswer, sessionId);
      expect(second.status).toBe("resolved");
      expect(second.origin?.nameAr).toBe(expectedOrigin);
      expect(second.destination?.nameAr).toBe(expectedDestination);
      expect(second.clarificationQuestion).toBeNull();
    },
  );

  test.each([
    ["من المرجة", "للجامعة", "ساحة المرجة", "جامعة دمشق"],
    ["من عرنوس", "على المزة", "ساحة عرنوس", "المزة"],
    ["انا بالمرجة", "بدي روح باب توما", "ساحة المرجة", "باب توما"],
    ["انا عند كفرسوسة", "وصلني للمواساة", "كفرسوسة", "مستشفى المواساة"],
    ["من القنوات", "الى الحريقة", "القنوات", "الحريقة"],
  ])(
    "resolves after origin-only request asks for destination %#",
    async (originOnlyInput, destinationAnswer, expectedOrigin, expectedDestination) => {
      const sessionId = `origin-only-followup-${originOnlyInput}`;
      const first = await resolveTrip(originOnlyInput, sessionId);

      expect(first.status).toBe("needs_destination");
      expect(first.origin?.nameAr).toBe(expectedOrigin);
      expect(first.destination).toBeNull();
      expect(first.clarificationQuestion).toBeTruthy();

      const second = await resolveTrip(destinationAnswer, sessionId);
      expect(second.status).toBe("resolved");
      expect(second.origin?.nameAr).toBe(expectedOrigin);
      expect(second.destination?.nameAr).toBe(expectedDestination);
      expect(second.clarificationQuestion).toBeNull();
    },
  );

  test("keeps alias normalization consistent for every indexed landmark", () => {
    for (const landmark of allDamascusLandmarks) {
      expect(new Set(landmark.rawAliases).size).toBe(landmark.rawAliases.length);
      expect(new Set(landmark.normalizedAliases).size).toBe(landmark.normalizedAliases.length);
      expect(landmark.rawAliases.every((alias) => alias.trim().length > 0)).toBe(true);
      expect(landmark.normalizedAliases.every((alias) => alias.trim().length > 0)).toBe(true);

      for (const rawAlias of landmark.rawAliases) {
        expect(landmark.normalizedAliases).toContain(normalizeArabic(rawAlias));
      }
    }
  });

  test.each([
    ["المرجة", "core_marjeh"],
    ["مرجة", "core_marjeh"],
    ["marjeh", "core_marjeh"],
    ["جامعة دمشق", "core_damascus_university"],
    ["الجامعه", "core_damascus_university"],
    ["باب توما", "core_bab_touma"],
    ["مشفى المواساة", "core_mouwasat_hospital"],
    ["المواساة", "core_mouwasat_hospital"],
    ["ابو رمانه", "core_abu_rummaneh"],
    ["كراج السومرية", "core_someria_garage"],
  ])("finds confident landmark aliases %#", (query, id) => {
    const result = resolveLandmarkQuery(query);
    expect(result.isAmbiguous).toBe(false);
    expect(result.match?.landmark.id).toBe(id);
    expect(result.match?.score ?? 1).toBeLessThan(0.4);
  });

  test.each(["ا", "ل", "ع", " "])("does not return candidates for very short query %#", (query) => {
    expect(resolveLandmarkQuery(query).candidates).toHaveLength(0);
  });
});

describe("trip resolve route", () => {
  test("uses the shared DTO response and validates missing fields", async () => {
    const fastify = Fastify({ logger: false });
    fastify.decorate("authenticate", async () => undefined);
    await fastify.register(tripRoutes, { prefix: "/api/trip" });
    await fastify.ready();

    const ok = await fastify.inject({
      method: "POST",
      url: "/api/trip/resolve",
      payload: {
        message: "من المرجة إلى الجامعة",
        sessionId: "route-alias",
      },
    });

    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      status: "resolved",
      origin: {
        id: "core_marjeh",
        nameAr: "ساحة المرجة",
      },
      destination: {
        id: "core_damascus_university",
        nameAr: "جامعة دمشق",
      },
      candidates: [],
    });
    expect(ok.json().origin).not.toHaveProperty("aliases");

    const missing = await fastify.inject({
      method: "POST",
      url: "/api/trip/resolve",
      payload: { message: "من المرجة إلى الجامعة" },
    });
    expect(missing.statusCode).toBe(400);

    const blank = await fastify.inject({
      method: "POST",
      url: "/api/trip/resolve",
      payload: { message: "   ", sessionId: "route-alias" },
    });
    expect(blank.statusCode).toBe(400);

    const missingSession = await fastify.inject({
      method: "POST",
      url: "/api/trip/resolve",
      payload: { message: "من المرجة إلى الجامعة", sessionId: "   " },
    });
    expect(missingSession.statusCode).toBe(400);

    await fastify.close();
  });
});
