import type { TripIntentParseResult } from "../types/naturalNavigation";

type ParseWithLlmInput = {
  text: string;
  landmarkList: string;
  mode: "full" | "origin_only" | "destination_only";
};

const DEFAULT_TIMEOUT_MS = 4000;

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  return raw.slice(start, end + 1);
}

function normalizeResult(input: Partial<TripIntentParseResult>): TripIntentParseResult {
  return {
    origin_id: typeof input.origin_id === "string" ? input.origin_id : null,
    destination_id: typeof input.destination_id === "string" ? input.destination_id : null,
    ambiguous: Boolean(input.ambiguous),
    clarification_question: typeof input.clarification_question === "string" ? input.clarification_question : null,
    intent: input.intent === "route_info" || input.intent === "general_question" || input.intent === "unclear"
      ? input.intent
      : "trip_planning",
    origin_candidates: Array.isArray(input.origin_candidates) ? input.origin_candidates.filter((x): x is string => typeof x === "string") : [],
    destination_candidates: Array.isArray(input.destination_candidates) ? input.destination_candidates.filter((x): x is string => typeof x === "string") : [],
    unknown_locations: Array.isArray(input.unknown_locations) ? input.unknown_locations.filter((x): x is string => typeof x === "string") : [],
    route_info_query: input.route_info_query && typeof input.route_info_query.route_name === "string"
      ? { route_name: input.route_info_query.route_name }
      : null,
    detected_language: input.detected_language === "en" || input.detected_language === "mixed" ? input.detected_language : "ar",
  };
}

function buildPrompt(input: ParseWithLlmInput): string {
  return [
    "You parse Damascus transit user text into strict JSON.",
    "Never return coordinates.",
    "Only use ids from this landmark dictionary:",
    input.landmarkList,
    "JSON schema keys required:",
    "origin_id,destination_id,ambiguous,clarification_question,intent,origin_candidates,destination_candidates,unknown_locations,route_info_query,detected_language",
    "intent one of: trip_planning,route_info,general_question,unclear",
    "detected_language one of: ar,en,mixed",
    `mode: ${input.mode}`,
    "If mode is origin_only, only fill origin_id and keep destination_id as null.",
    "If mode is destination_only, only fill destination_id and keep origin_id as null.",
    `User text: ${input.text}`,
    "Respond with JSON only.",
  ].join("\n");
}

async function callGroq(prompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? "llama-3.1-8b-instant",
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Groq failed with status ${res.status}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Groq returned empty content");
    }

    return content;
  } finally {
    clearTimeout(timer);
  }
}

async function callOllama(prompt: string): Promise<string> {
  const baseUrl = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
  const model = process.env.OLLAMA_MODEL ?? "qwen2.5:14b";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Ollama failed with status ${res.status}`);
    }

    const data = (await res.json()) as { message?: { content?: string } };
    const content = data.message?.content;
    if (!content) {
      throw new Error("Ollama returned empty content");
    }

    return content;
  } finally {
    clearTimeout(timer);
  }
}

export function getNlpProviderAndModel(): { provider: string | null; model: string | null } {
  const provider = (process.env.NLP_PROVIDER ?? "").toLowerCase();
  if (provider === "groq") {
    return { provider: "groq", model: process.env.GROQ_MODEL ?? "llama-3.1-8b-instant" };
  }
  if (provider === "ollama") {
    return { provider: "ollama", model: process.env.OLLAMA_MODEL ?? "qwen2.5:14b" };
  }
  return { provider: null, model: null };
}

export async function parseWithLlm(input: ParseWithLlmInput): Promise<TripIntentParseResult> {
  const prompt = buildPrompt(input);
  const provider = (process.env.NLP_PROVIDER ?? "").toLowerCase();

  let content: string;
  if (provider === "groq") {
    content = await callGroq(prompt);
  } else if (provider === "ollama") {
    content = await callOllama(prompt);
  } else {
    throw new Error("NLP provider is not configured");
  }

  const maybeJson = extractJsonObject(content);
  if (!maybeJson) {
    throw new Error("LLM did not return JSON");
  }

  const parsed = JSON.parse(maybeJson) as Partial<TripIntentParseResult>;
  return normalizeResult(parsed);
}
