import Fuse from "fuse.js";
import { allDamascusLandmarks } from "../data/damascusLandmarks";
import type { LandmarkEntry } from "../data/damascusLandmarks";
import { normalizeArabic } from "./normalizeArabic";
import { buildLandmarkAliases } from "./landmarkAliases";

const ALL_LANDMARKS = allDamascusLandmarks;

interface SearchableEntry {
  alias: string;
  landmark: LandmarkEntry;
}

const searchIndex: SearchableEntry[] = ALL_LANDMARKS.flatMap((landmark) => {
  const aliases = new Set([
    ...landmark.normalizedAliases,
    ...buildLandmarkAliases(landmark),
  ]);

  return Array.from(aliases)
    .filter(Boolean)
    .map((alias) => ({
      alias,
      landmark,
    }));
});

const fuse = new Fuse(searchIndex, {
  keys: ["alias"],
  threshold: 0.35,
  distance: 100,
  minMatchCharLength: 2,
  includeScore: true,
  ignoreLocation: true,
});

export interface MatchResult {
  landmark: LandmarkEntry;
  score: number;
}

export interface LandmarkResolution {
  match: MatchResult | null;
  candidates: MatchResult[];
  isAmbiguous: boolean;
}

const AMBIGUOUS_SCORE_DELTA = 0.001;
const CONFIDENT_MATCH_SCORE = 0.4;

export function findLandmark(query: string): MatchResult | null {
  const normalized = normalizeArabic(query);
  if (normalized.length < 2) {
    return null;
  }

  const results = fuse.search(normalized);

  if (results.length === 0) {
    return null;
  }

  const best = results[0];
  return {
    landmark: best.item.landmark,
    score: best.score ?? 1,
  };
}

export function findLandmarkCandidates(query: string, limit = 3): MatchResult[] {
  const normalized = normalizeArabic(query);
  if (normalized.length < 2) {
    return [];
  }

  const results = fuse.search(normalized, { limit: Math.max(limit * 3, limit) });
  const byLandmark = new Map<string, MatchResult>();

  for (const result of results) {
    const candidate: MatchResult = {
      landmark: result.item.landmark,
      score: result.score ?? 1,
    };

    const existing = byLandmark.get(candidate.landmark.id);
    if (!existing || candidate.score < existing.score) {
      byLandmark.set(candidate.landmark.id, candidate);
    }

    if (byLandmark.size >= limit) {
      break;
    }
  }

  return Array.from(byLandmark.values()).sort((a, b) => a.score - b.score).slice(0, limit);
}

export function resolveLandmarkQuery(query: string, limit = 3): LandmarkResolution {
  const candidates = findLandmarkCandidates(query, limit);
  const match = candidates[0] ?? null;
  const second = candidates[1] ?? null;

  const isAmbiguous = Boolean(
    match &&
    second &&
    match.score < CONFIDENT_MATCH_SCORE &&
    second.score < CONFIDENT_MATCH_SCORE &&
    Math.abs(second.score - match.score) <= AMBIGUOUS_SCORE_DELTA,
  );

  return {
    match,
    candidates,
    isAmbiguous,
  };
}
