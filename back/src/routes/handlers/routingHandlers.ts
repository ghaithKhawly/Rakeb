import type { FastifyInstance } from "fastify";
import { routingWorkerClient } from "../../services/routingWorkerClient";
import type { NavigationRouteResult, RoutingWorkerPayload } from "../../../../types/navigation";
import { estimateDirectDistanceM, normalizeWeights } from "../utils/busUtils";

export async function routeWithFallback(
  fastify: FastifyInstance,
  payload: { base: Omit<RoutingWorkerPayload, "walkingMode"> },
): Promise<NavigationRouteResult> {
  const workerTimeoutMs = Number(process.env.ROUTING_WORKER_TIMEOUT_MS ?? 12000);
  const strictAttemptTimeoutMs = Math.max(7000, workerTimeoutMs);
  const relaxedAttemptTimeoutMs = Math.max(
    strictAttemptTimeoutMs,
    Math.floor(strictAttemptTimeoutMs * 1.35),
  );

  const directDistanceM = estimateDirectDistanceM(payload.base.from, payload.base.to);
  const strictTimeoutForRequestMs = Math.min(
    90_000,
    Math.max(
      strictAttemptTimeoutMs,
      strictAttemptTimeoutMs + Math.floor(directDistanceM * 3.0),
    ),
  );
  const relaxedTimeoutForRequestMs = Math.min(
    120_000,
    Math.max(
      relaxedAttemptTimeoutMs,
      Math.floor(strictTimeoutForRequestMs * 1.2),
    ),
  );

  const runAttempt = async (walkingMode: "dynamic" | "precomputed") => {
    const startedAt = Date.now();
    try {
      const result = await routingWorkerClient.route(
        { ...payload.base, walkingMode },
        { timeoutMs: strictTimeoutForRequestMs },
      );
      fastify.log.info(
        { walkingMode, elapsedMs: Date.now() - startedAt, timeoutMs: strictTimeoutForRequestMs },
        "Routing attempt succeeded",
      );
      return result;
    } catch (error) {
      fastify.log.warn(
        {
          walkingMode,
          elapsedMs: Date.now() - startedAt,
          timeoutMs: strictTimeoutForRequestMs,
          error: error instanceof Error ? error.message : String(error),
        },
        "Routing attempt failed",
      );
      throw error;
    }
  };

  const strictAttemptOrder: Array<"dynamic" | "precomputed"> = directDistanceM > 9_000
    ? ["precomputed", "dynamic"]
    : ["dynamic", "precomputed"];

  for (let idx = 0; idx < strictAttemptOrder.length; idx += 1) {
    const mode = strictAttemptOrder[idx] as "dynamic" | "precomputed";
    try {
      const result = await runAttempt(mode);
      return { ...result, bestEffort: false };
    } catch (error) {
      if (idx < strictAttemptOrder.length - 1) {
        fastify.log.warn(
          { error, failedMode: mode, nextMode: strictAttemptOrder[idx + 1] },
          "Strict routing attempt failed, trying alternate walking mode",
        );
      } else {
        fastify.log.warn({ error, failedMode: mode }, "Strict routing failed, trying relaxed best-effort route");
      }
    }
  }

  // Relaxed best-effort transit-first attempt
  const relaxedTotalWalkingCapM = Math.max(
    payload.base.config.maxTotalWalkingDistanceM,
    Math.round(directDistanceM * 1.6),
    payload.base.config.maxWalkingDistanceM * 3,
    6_000,
  );

  const relaxedConfig = {
    ...payload.base.config,
    maxTotalWalkingDistanceM: relaxedTotalWalkingCapM,
    maxWalkingNeighbors: Math.max(
      6,
      Math.min(
        payload.base.config.maxWalkingNeighbors,
        directDistanceM > 9_000 ? 8 : payload.base.config.maxWalkingNeighbors,
      ),
    ),
    maxBusTransfers: Math.max(payload.base.config.maxBusTransfers, 8),
    weights: normalizeWeights({
      ...payload.base.config.weights,
      walking: payload.base.config.weights.walking * 3.0,
      speed: payload.base.config.weights.speed * 1.15,
    }),
  };

  const relaxedPayload: RoutingWorkerPayload = {
    ...payload.base,
    config: relaxedConfig,
    walkingMode: "dynamic",
    relaxation: {
      allowStartAnchorOverCap: true,
      allowEndAnchorOverCap: false,
      requireBusSegment: true,
    },
  };

  const result = await routingWorkerClient.route(
    relaxedPayload,
    { timeoutMs: relaxedTimeoutForRequestMs },
  );
  return { ...result, bestEffort: true };
}

export default { routeWithFallback };
