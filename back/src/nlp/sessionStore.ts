import type { LandmarkEntry } from "../data/damascusLandmarks";

interface ConversationSession {
  lastOrigin: LandmarkEntry | null;
  lastDestination: LandmarkEntry | null;
  pendingClarification: "origin" | "destination" | null;
  updatedAt: number;
}

const sessions = new Map<string, ConversationSession>();
const SESSION_TTL_MS = 30 * 60 * 1000;

export function getSession(sessionId: string): ConversationSession {
  const session = sessions.get(sessionId);
  if (!session || Date.now() - session.updatedAt > SESSION_TTL_MS) {
    return {
      lastOrigin: null,
      lastDestination: null,
      pendingClarification: null,
      updatedAt: Date.now(),
    };
  }
  return session;
}

export function saveSession(sessionId: string, data: Partial<ConversationSession>) {
  const existing = getSession(sessionId);
  sessions.set(sessionId, {
    ...existing,
    ...data,
    updatedAt: Date.now(),
  });
}

export function clearSessionStore() {
  sessions.clear();
}
