import { extractRawLocations } from "./extractLocations";
import { findLandmarkCandidates, resolveLandmarkQuery } from "./landmarkSearch";
import { getSession, saveSession } from "./sessionStore";
import type { LandmarkEntry } from "../data/damascusLandmarks";
import { normalizeArabic } from "./normalizeArabic";

export interface TripResolution {
  status: "resolved" | "needs_origin" | "needs_destination" | "needs_clarification";
  origin: LandmarkEntry | null;
  destination: LandmarkEntry | null;
  clarificationQuestion: string | null;
  candidates: LandmarkEntry[];
}

const CONFIDENCE_THRESHOLD = 0.4;

function clarificationQuestion(field: "origin" | "destination", text: string) {
  return field === "origin"
    ? `قصدك بـ"${text}" كنقطة انطلاق، أيا من هذي الأماكن؟`
    : `قصدك بـ"${text}" كوجهة، أيا من هذي الأماكن؟`;
}

function resolveConfidentLandmark(text: string | null): LandmarkEntry | null {
  if (!text) {
    return null;
  }

  const resolution = resolveLandmarkQuery(text);
  if (resolution.isAmbiguous || !resolution.match || resolution.match.score >= CONFIDENCE_THRESHOLD) {
    return null;
  }

  return resolution.match.landmark;
}

function referencesLastDestinationOrigin(input: string): boolean {
  const normalized = normalizeArabic(input);
  return /^من\s+(?:هون|هنا|هناك|هنيك|نفس المكان)(?:\s|$)/u.test(normalized);
}

export async function resolveTrip(input: string, sessionId: string): Promise<TripResolution> {
  const session = getSession(sessionId);
  const { originText, destText, isFollowUp } = extractRawLocations(input);

  let origin: LandmarkEntry | null = session.lastOrigin;
  let destination: LandmarkEntry | null = session.lastDestination;

  if (isFollowUp) {
    origin = session.lastDestination;
    destination = null;
    saveSession(sessionId, {
      lastOrigin: origin,
      lastDestination: null,
      pendingClarification: "destination",
    });

    return {
      status: "needs_destination",
      origin,
      destination: null,
      clarificationQuestion: origin
        ? `من ${origin.nameAr}، وين بدك تروح؟`
        : "وين بدك تروح؟",
      candidates: [],
    };
  }

  if (session.pendingClarification) {
    const clarificationText =
      session.pendingClarification === "origin"
        ? originText ?? destText ?? input
        : destText ?? originText ?? input;
    const resolution = resolveLandmarkQuery(clarificationText);

    if (resolution.isAmbiguous) {
      saveSession(sessionId, {
        pendingClarification: session.pendingClarification,
      });

      return {
        status: "needs_clarification",
        origin,
        destination,
        clarificationQuestion: clarificationQuestion(session.pendingClarification, clarificationText),
        candidates: resolution.candidates.map((c) => c.landmark),
      };
    }

    if (resolution.match && resolution.match.score < CONFIDENCE_THRESHOLD) {
      if (session.pendingClarification === "origin") {
        origin = resolution.match.landmark;
      } else {
        destination = resolution.match.landmark;
      }

      if (!origin) {
        saveSession(sessionId, { lastDestination: destination, pendingClarification: "origin" });
        return {
          status: "needs_origin",
          origin: null,
          destination,
          clarificationQuestion: "منين بدك تنطلق؟",
          candidates: [],
        };
      }

      if (!destination) {
        saveSession(sessionId, { lastOrigin: origin, pendingClarification: "destination" });
        return {
          status: "needs_destination",
          origin,
          destination: null,
          clarificationQuestion: "وين بدك تروح؟",
          candidates: [],
        };
      }

      saveSession(sessionId, {
        lastOrigin: origin,
        lastDestination: destination,
        pendingClarification: null,
      });

      return {
        status: "resolved",
        origin,
        destination,
        clarificationQuestion: null,
        candidates: [],
      };
    }

    return buildClarification(session.pendingClarification);
  }

  if (!originText && destText && session.lastDestination && referencesLastDestinationOrigin(input)) {
    origin = session.lastDestination;
  }

  if (originText) {
    const resolution = resolveLandmarkQuery(originText);
    if (resolution.isAmbiguous) {
      destination = destination ?? resolveConfidentLandmark(destText);
      saveSession(sessionId, {
        lastDestination: destination,
        pendingClarification: "origin",
      });
      return {
        status: "needs_clarification",
        origin: null,
        destination,
        clarificationQuestion: clarificationQuestion("origin", originText),
        candidates: resolution.candidates.map((c) => c.landmark),
      };
    }

    if (resolution.match && resolution.match.score < CONFIDENCE_THRESHOLD) {
      origin = resolution.match.landmark;
    } else {
      const candidates = findLandmarkCandidates(originText);
      if (candidates.length > 0) {
        destination = destination ?? resolveConfidentLandmark(destText);
        saveSession(sessionId, {
          lastDestination: destination,
          pendingClarification: "origin",
        });
        return {
          status: "needs_clarification",
          origin: null,
          destination,
          clarificationQuestion: clarificationQuestion("origin", originText),
          candidates: candidates.map((c) => c.landmark),
        };
      }

      destination = destination ?? resolveConfidentLandmark(destText);
      saveSession(sessionId, { lastDestination: destination, pendingClarification: "origin" });
      return {
        status: "needs_origin",
        origin: null,
        destination,
        clarificationQuestion: "ما فهمت منين بدك تنطلق، ممكن تحدد أكتر؟",
        candidates: [],
      };
    }
  }

  if (destText) {
    const resolution = resolveLandmarkQuery(destText);
    if (resolution.isAmbiguous) {
      saveSession(sessionId, {
        lastOrigin: origin,
        pendingClarification: "destination",
      });
      return {
        status: "needs_clarification",
        origin,
        destination: null,
        clarificationQuestion: clarificationQuestion("destination", destText),
        candidates: resolution.candidates.map((c) => c.landmark),
      };
    }

    if (resolution.match && resolution.match.score < CONFIDENCE_THRESHOLD) {
      destination = resolution.match.landmark;
    } else {
      const candidates = findLandmarkCandidates(destText);
      if (candidates.length > 0) {
        saveSession(sessionId, {
          lastOrigin: origin,
          pendingClarification: "destination",
        });
        return {
          status: "needs_clarification",
          origin,
          destination: null,
          clarificationQuestion: clarificationQuestion("destination", destText),
          candidates: candidates.map((c) => c.landmark),
        };
      }

      saveSession(sessionId, { lastOrigin: origin, pendingClarification: "destination" });
      return {
        status: "needs_destination",
        origin,
        destination: null,
        clarificationQuestion: "وين بدك تروح بالضبط؟",
        candidates: [],
      };
    }
  }

  if (!origin) {
    saveSession(sessionId, { lastDestination: destination, pendingClarification: "origin" });
    return {
      status: "needs_origin",
      origin: null,
      destination,
      clarificationQuestion: "منين بدك تنطلق؟",
      candidates: [],
    };
  }

  if (!destination) {
    saveSession(sessionId, { lastOrigin: origin, pendingClarification: "destination" });
    return {
      status: "needs_destination",
      origin,
      destination: null,
      clarificationQuestion: "وين بدك تروح؟",
      candidates: [],
    };
  }

  saveSession(sessionId, {
    lastOrigin: origin,
    lastDestination: destination,
    pendingClarification: null,
  });

  return {
    status: "resolved",
    origin,
    destination,
    clarificationQuestion: null,
    candidates: [],
  };
}

function buildClarification(field: "origin" | "destination"): TripResolution {
  return {
    status: field === "origin" ? "needs_origin" : "needs_destination",
    origin: null,
    destination: null,
    clarificationQuestion: field === "origin"
      ? "ما عرفت المكان، ممكن تكتب اسمه بشكل أوضح؟"
      : "ما عرفت الوجهة، ممكن تكتبها بشكل أوضح؟",
    candidates: [],
  };
}
