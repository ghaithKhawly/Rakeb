import type { FastifyInstance } from "fastify";
import type {
  EffectiveRoutingConfig,
  NavigationRouteResult,
  RouteLiveMetricForRouting,
  RoutingWorkerPayload,
} from "../../../../../types/navigation";
import { graphCache } from "../../../services/graphCache";
import { routingWorkerClient } from "../../../services/routingWorkerClient";
import { loadRouteMetrics as loadSharedRouteMetrics } from "../../../services/routingMetrics";
import {
  DEFAULT_MAX_BUS_TRANSFERS,
  TRANSFER_EXP_COEFF,
  TRANSFER_EXP_RATE,
  WALK_EXP_COEFF,
  WALK_EXP_SCALE_M,
  WALK_LINEAR_COEFF,
} from "../../../constants/routingConstants";

const WORKER_TIMEOUT_MS = Number(process.env.ROUTING_WORKER_TIMEOUT_MS ?? 2500);

const DEFAULT_CONFIG: EffectiveRoutingConfig = {
  weights: {
    speed: 0.2,
    crowding: 0.2,
    price: 0.2,
    transfer: 0.2,
    walking: 0.2,
  },
  maxWalkingDistanceM: 1000,
  maxTotalWalkingDistanceM: 2000,
  maxWalkingNeighbors: 12,
  maxBusTransfers: DEFAULT_MAX_BUS_TRANSFERS,
  walkingSpeedMps: 1.25,
  walkLinearCoeff: WALK_LINEAR_COEFF,
  walkExpCoeff: WALK_EXP_COEFF,
  walkExpScaleM: WALK_EXP_SCALE_M,
  transferExpCoeff: TRANSFER_EXP_COEFF,
  transferExpRate: TRANSFER_EXP_RATE,
};

async function loadRouteMetrics(fastify: FastifyInstance): Promise<RouteLiveMetricForRouting[]> {
  return loadSharedRouteMetrics(fastify.pg);
}

async function routeWithFallback(payload: {
  base: Omit<RoutingWorkerPayload, "walkingMode">;
}): Promise<NavigationRouteResult> {
  const runAttempt = async (walkingMode: "dynamic" | "precomputed") => {
    return routingWorkerClient.route(
      { ...payload.base, walkingMode },
      { timeoutMs: WORKER_TIMEOUT_MS },
    );
  };

  try {
    return await runAttempt("dynamic");
  } catch {
    // no-op
  }

  try {
    return await runAttempt("precomputed");
  } catch {
    // no-op
  }

  return routingWorkerClient.route(
    {
      ...payload.base,
      config: {
        ...payload.base.config,
        maxTotalWalkingDistanceM: Number.MAX_SAFE_INTEGER,
        maxBusTransfers: Math.max(payload.base.config.maxBusTransfers, 10),
      },
      walkingMode: "dynamic",
    },
    { timeoutMs: WORKER_TIMEOUT_MS },
  );
}

export async function computeNaturalRoute(
  fastify: FastifyInstance,
  input: {
    from: { lat: number; lng: number; label?: string };
    to: { lat: number; lng: number; label?: string };
  },
): Promise<NavigationRouteResult> {
  const snapshot = await graphCache.getSnapshot(fastify);
  const routeMetrics = await loadRouteMetrics(fastify);

  const result = await routeWithFallback({
    base: {
      from: input.from,
      to: input.to,
      graph: snapshot,
      routeMetrics,
      config: DEFAULT_CONFIG,
    },
  });

  return {
    ...result,
    from: result.from ?? input.from,
    to: result.to ?? input.to,
  };
}
