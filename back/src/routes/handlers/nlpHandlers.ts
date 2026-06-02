import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { resolveTrip } from "../../nlp/resolveTrip";
import type { ResolveTripRequestBody, ResolveTripResponse } from "../../../../types/navigation";
import type { LandmarkEntry } from "../../data/damascusLandmarks";

function toLandmarkDto(landmark: LandmarkEntry | null) {
  if (!landmark) {
    return null;
  }

  return {
    id: landmark.id,
    nameAr: landmark.nameAr,
    nameEn: landmark.nameEn,
    lat: landmark.lat,
    lng: landmark.lng,
  };
}

export async function resolveTripHandler(
  _fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = request.body as ResolveTripRequestBody;

  const message = body?.message?.trim();
  const sessionId = body?.sessionId?.trim();

  if (!message || !sessionId) {
    return reply.code(400).send({ error: "message and sessionId required" });
  }

  const result = await resolveTrip(message, sessionId);

  const candidates = result.candidates
    .map((candidate) => toLandmarkDto(candidate))
    .filter((candidate): candidate is NonNullable<ReturnType<typeof toLandmarkDto>> => candidate !== null);

  const response: ResolveTripResponse = {
    status: result.status,
    origin: toLandmarkDto(result.origin),
    destination: toLandmarkDto(result.destination),
    clarificationQuestion: result.clarificationQuestion,
    candidates,
  };

  return reply.send(response);
}
