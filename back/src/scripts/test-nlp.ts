import assert from "node:assert/strict";
import { extractRawLocations } from "../nlp/extractLocations";
import { resolveTrip } from "../nlp/resolveTrip";

type ExpectedExtraction = {
  input: string;
  originText: string | null;
  destText: string | null;
  isFollowUp?: boolean;
};

type ExpectedResolution = {
  input: string;
  status: "resolved" | "needs_origin" | "needs_destination" | "needs_clarification";
  origin?: string | null;
  destination?: string | null;
};

const extractionCases: ExpectedExtraction[] = [
  {
    input: "من المرجة إلى الجامعة",
    originText: "المرجه",
    destText: "الجامعه",
  },
  {
    input: "من عند المرجة للجامعة",
    originText: "المرجه",
    destText: "جامعه",
  },
  {
    input: "بين المرجة والجامعة",
    originText: "المرجه",
    destText: "الجامعه",
  },
  {
    input: "من المرجة حتى الجامعة",
    originText: "المرجه",
    destText: "الجامعه",
  },
  {
    input: "الى الجامعة من المرجة",
    originText: "المرجه",
    destText: "الجامعه",
  },
  {
    input: "من المرجة -> الجامعة",
    originText: "المرجه",
    destText: "الجامعه",
  },
  {
    input: "المرجة - الجامعة",
    originText: "المرجه",
    destText: "الجامعه",
  },
  {
    input: "from marjeh to damascus university",
    originText: "marjeh",
    destText: "damascus university",
  },
  {
    input: "كيف الطريق للجامعة من المرجة",
    originText: "المرجه",
    destText: "جامعه",
  },
  {
    input: "الانطلاق من المرجة والوجهة الجامعة",
    originText: "المرجه",
    destText: "الجامعه",
  },
  {
    input: "بدي روح عالجامعة من المرجة",
    originText: "المرجه",
    destText: "جامعه",
  },
  {
    input: "انا بالمرجة وبدي روح عالجامعة",
    originText: "مرجه",
    destText: "جامعه",
  },
  {
    input: "وصلني من عرنوس للمواساة",
    originText: "عرنوس",
    destText: "مواساه",
  },
  {
    input: "طريق من كفرسوسة إلى باب توما",
    originText: "كفرسوسه",
    destText: "باب توما",
  },
  {
    input: "خدني على المزة",
    originText: null,
    destText: "المزه",
  },
  {
    input: "من موقعي الى باب توما",
    originText: null,
    destText: "باب توما",
  },
  {
    input: "من عندي للجامعة",
    originText: null,
    destText: "جامعه",
  },
  {
    input: "من نفس المكان لباب توما",
    originText: null,
    destText: "باب توما",
  },
  {
    input: "من هون",
    originText: null,
    destText: null,
    isFollowUp: true,
  },
];

const resolutionCases: ExpectedResolution[] = [
  {
    input: "من المرجة إلى الجامعة",
    status: "resolved",
    origin: "ساحة المرجة",
    destination: "جامعة دمشق",
  },
  {
    input: "بين المرجة والجامعة",
    status: "resolved",
    origin: "ساحة المرجة",
    destination: "جامعة دمشق",
  },
  {
    input: "من المرجة حتى الجامعة",
    status: "resolved",
    origin: "ساحة المرجة",
    destination: "جامعة دمشق",
  },
  {
    input: "الى الجامعة من المرجة",
    status: "resolved",
    origin: "ساحة المرجة",
    destination: "جامعة دمشق",
  },
  {
    input: "من المرجة -> الجامعة",
    status: "resolved",
    origin: "ساحة المرجة",
    destination: "جامعة دمشق",
  },
  {
    input: "المرجة - الجامعة",
    status: "resolved",
    origin: "ساحة المرجة",
    destination: "جامعة دمشق",
  },
  {
    input: "from marjeh to damascus university",
    status: "resolved",
    origin: "ساحة المرجة",
    destination: "جامعة دمشق",
  },
  {
    input: "marjeh to damascus university",
    status: "resolved",
    origin: "ساحة المرجة",
    destination: "جامعة دمشق",
  },
  {
    input: "جامعة دمشق من المرجة",
    status: "resolved",
    origin: "ساحة المرجة",
    destination: "جامعة دمشق",
  },
  {
    input: "الانطلاق من المرجة والوجهة الجامعة",
    status: "resolved",
    origin: "ساحة المرجة",
    destination: "جامعة دمشق",
  },
  {
    input: "كيف الطريق للجامعة من المرجة",
    status: "resolved",
    origin: "ساحة المرجة",
    destination: "جامعة دمشق",
  },
  {
    input: "بدي روح عالجامعة من المرجة",
    status: "resolved",
    origin: "ساحة المرجة",
    destination: "جامعة دمشق",
  },
  {
    input: "وصلني من عرنوس للمواساة",
    status: "resolved",
    origin: "ساحة عرنوس",
    destination: "مستشفى المواساة",
  },
  {
    input: "طريق من كفرسوسة إلى باب توما",
    status: "resolved",
    origin: "كفرسوسة",
    destination: "باب توما",
  },
  {
    input: "من ساحة الامويين الى كراج السومرية",
    status: "resolved",
    origin: "ساحة الأمويين",
    destination: "كراج السومرية",
  },
  {
    input: "من برزة الى القنوات",
    status: "resolved",
    origin: "برزة",
    destination: "القنوات",
  },
  {
    input: "من ساروجة إلى القصاع",
    status: "resolved",
    origin: "ساروجة",
    destination: "القصاع",
  },
  {
    input: "من الشاغور للميدان",
    status: "resolved",
    origin: "الشاغور",
    destination: "الميدان",
  },
  {
    input: "من ابو رمانة للميسات",
    status: "resolved",
    origin: "أبو رمانة",
    destination: "الميسات",
  },
  {
    input: "من القيمرية الى الحريقة",
    status: "resolved",
    origin: "القيمرية",
    destination: "الحريقة",
  },
  {
    input: "من الزبلطاني الى الجامعة",
    status: "resolved",
    origin: "الزبلطاني",
    destination: "جامعة دمشق",
  },
  {
    input: "انا عند المرجة بدي روح جامعة دمشق",
    status: "resolved",
    origin: "ساحة المرجة",
    destination: "جامعة دمشق",
  },
  {
    input: "انا بالمرجة رايح عالجامعة",
    status: "resolved",
    origin: "ساحة المرجة",
    destination: "جامعة دمشق",
  },
  {
    input: "خدني على المزة",
    status: "needs_origin",
    origin: null,
    destination: "المزة",
  },
  {
    input: "بدي اروح جامعة دمشق",
    status: "needs_origin",
    origin: null,
    destination: "جامعة دمشق",
  },
  {
    input: "من موقعي الى باب توما",
    status: "needs_origin",
    origin: null,
    destination: "باب توما",
  },
  {
    input: "من عندي للجامعة",
    status: "needs_origin",
    origin: null,
    destination: "جامعة دمشق",
  },
  {
    input: "من البيت للجامعة",
    status: "needs_origin",
    origin: null,
    destination: "جامعة دمشق",
  },
  {
    input: "من نفس المكان لباب توما",
    status: "needs_origin",
    origin: null,
    destination: "باب توما",
  },
];

function assertExtraction() {
  for (const expected of extractionCases) {
    const actual = extractRawLocations(expected.input);
    assert.deepEqual(
      actual,
      {
        originText: expected.originText,
        destText: expected.destText,
        isFollowUp: expected.isFollowUp ?? false,
      },
      `extractRawLocations failed for: ${expected.input}`,
    );
  }
}

async function assertResolution() {
  let index = 0;
  for (const expected of resolutionCases) {
    index += 1;
    const actual = await resolveTrip(expected.input, `nlp-test-${Date.now()}-${index}`);
    assert.equal(actual.status, expected.status, `status failed for: ${expected.input}`);
    assert.equal(actual.origin?.nameAr ?? null, expected.origin ?? null, `origin failed for: ${expected.input}`);
    assert.equal(
      actual.destination?.nameAr ?? null,
      expected.destination ?? null,
      `destination failed for: ${expected.input}`,
    );
  }
}

async function assertClarificationFlow() {
  const sessionId = `nlp-test-clarification-${Date.now()}`;
  const first = await resolveTrip("من المرجة الى العباسيين", sessionId);
  assert.equal(first.status, "needs_clarification", "ambiguous destination should request clarification");
  assert.equal(first.origin?.nameAr ?? null, "ساحة المرجة", "ambiguous flow should keep resolved origin");
  assert.deepEqual(
    first.candidates.map((candidate) => candidate.nameAr),
    ["ساحة العباسيين", "كراج العباسيين"],
    "ambiguous destination candidates changed",
  );

  const second = await resolveTrip("كراج العباسيين", sessionId);
  assert.equal(second.status, "resolved", "text clarification answer should resolve trip");
  assert.equal(second.origin?.nameAr ?? null, "ساحة المرجة", "clarification flow lost origin");
  assert.equal(second.destination?.nameAr ?? null, "كراج العباسيين", "clarification answer chose wrong destination");
}

async function assertFollowUpOriginFlow() {
  const sessionId = `nlp-test-followup-origin-${Date.now()}`;
  const first = await resolveTrip("من المرجة للجامعة", sessionId);
  assert.equal(first.status, "resolved", "setup trip should resolve");
  assert.equal(first.destination?.nameAr ?? null, "جامعة دمشق", "setup trip destination changed");

  const second = await resolveTrip("من هون لباب توما", sessionId);
  assert.equal(second.status, "resolved", "explicit follow-up destination should resolve");
  assert.equal(second.origin?.nameAr ?? null, "جامعة دمشق", "follow-up origin should use last destination");
  assert.equal(second.destination?.nameAr ?? null, "باب توما", "follow-up destination changed");
}

assertExtraction();
await assertResolution();
await assertClarificationFlow();
await assertFollowUpOriginFlow();

console.log(
  `NLP tests passed: ${extractionCases.length} extraction + ${resolutionCases.length} resolution + 2 conversation flows.`,
);
