import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { graphCache } from "../../services/graphCache";
import { routingWorkerClient } from "../../services/routingWorkerClient";
import { loadRouteMetrics } from "../../services/routingMetrics";
import type {
  GetGraphQuery,
  GraphCacheQuery,
  InvalidateGraphQuery,
} from "../../../../types/bus";
import type {
  NavigationRouteRequestBody,
  NavigationRouteResult,
  RouteLiveMetricForRouting,
} from "../../../../types/navigation";
import { getEffectiveRoutingConfig } from "./busHandlers";
import { routeWithFallback } from "./routingHandlers";
import { requireAdminRole } from "../utils/adminAuth";
import {
  applyProfileConfig,
  buildAlternativeProfiles,
  isMeaningfullyDifferentRoute,
  normalizeRouteResultForSchema,
  routeFingerprint,
} from "../utils/busUtils";

type RouteProfile = ReturnType<typeof buildAlternativeProfiles>[number];
type WalkingMode = "api" | "dynamic" | "precomputed";

function scoreProfileCandidate(profileId: string, route: NavigationRouteResult): number {
  const transferCount = Number(route.transferCount ?? 0);
  const eta = Number(route.etaSeconds ?? Number.POSITIVE_INFINITY);
  const walking = Number(route.walkingDistanceM ?? Number.POSITIVE_INFINITY);
  const totalCost = Number(route.totalCost ?? Number.POSITIVE_INFINITY);

  switch (profileId) {
    case "fastest":
      return eta * 1_000 + walking * 5 + transferCount * 25_000;
    case "fewer_transfers":
      return transferCount * 1_000_000_000 + eta * 1_000 + walking * 10;
    case "less_walking":
      return walking * 1_000 + eta * 10 + transferCount * 25_000;
    case "cheaper":
      return totalCost * 1_000 + eta * 10 + transferCount * 10_000;
    default:
      return eta * 1_000 + walking;
  }
}

async function computeNavigationAlternatives(
  fastify: FastifyInstance,
  snapshot: Awaited<ReturnType<typeof graphCache.getSnapshot>>,
  body: NavigationRouteRequestBody,
  routeMetrics: RouteLiveMetricForRouting[],
  config: Awaited<ReturnType<typeof getEffectiveRoutingConfig>>,
  workerTimeoutMs: number,
) {
  const profiles = buildAlternativeProfiles(config.weights);
  const seenFingerprints = new Set<string>();
  const alternatives: NavigationRouteResult[] = [];
  const primaryProfile = profiles[0] as RouteProfile;
  const primaryResult = await routeWithFallback(fastify, {
    base: {
      from: body.from,
      to: body.to,
      graph: snapshot,
      routeMetrics,
      config: applyProfileConfig(config, primaryProfile),
    },
  });

  const normalizedPrimary = normalizeRouteResultForSchema(primaryResult, body.from, body.to);
  normalizedPrimary.routeLabel = primaryProfile.label;
  normalizedPrimary.profileId = primaryProfile.id;
  seenFingerprints.add(routeFingerprint(normalizedPrimary));
  alternatives.push(normalizedPrimary);

  const altProfiles = profiles.slice(1);
  for (const profile of altProfiles) {
    const profileConfig = applyProfileConfig(config, profile);
    const candidateWalkingModes: WalkingMode[] = ["api"];
    let bestCandidate: NavigationRouteResult | null = null;
    let bestCandidateScore = Number.POSITIVE_INFINITY;

    for (const walkingMode of candidateWalkingModes) {
      try {
        const computedResult = await routingWorkerClient.route(
          {
            from: body.from,
            to: body.to,
            graph: snapshot,
            routeMetrics,
            config: profileConfig,
            walkingMode,
          },
          { timeoutMs: Math.max(3500, Math.floor(workerTimeoutMs * 0.65)) },
        );

        const normalizedResult = normalizeRouteResultForSchema(computedResult, body.from, body.to);
        normalizedResult.routeLabel = profile.label;
        normalizedResult.profileId = profile.id;

        const fingerprint = routeFingerprint(normalizedResult);
        if (seenFingerprints.has(fingerprint)) {
          continue;
        }

        if (!isMeaningfullyDifferentRoute(normalizedResult, alternatives)) {
          continue;
        }

        const candidateScore = scoreProfileCandidate(profile.id, normalizedResult);
        if (candidateScore < bestCandidateScore) {
          bestCandidate = normalizedResult;
          bestCandidateScore = candidateScore;
        }
      } catch (error) {
        fastify.log.warn(
          {
            profile: profile.id,
            walkingMode,
            error: error instanceof Error ? error.message : String(error),
          },
          "Alternative routing profile failed",
        );
      }
    }

    if (bestCandidate) {
      seenFingerprints.add(routeFingerprint(bestCandidate));
      alternatives.push(bestCandidate);
    }

    if (alternatives.length >= 4) {
      break;
    }
  }

  if (alternatives.length < 2) {
    const exploratoryCandidates = [
      {
        id: "exploratory_low_transfer",
        config: {
          ...config,
          maxBusTransfers: Math.max(0, Math.min(config.maxBusTransfers, 2)),
        },
      },
      {
        id: "exploratory_bounded_walk",
        config: {
          ...config,
          maxWalkingDistanceM: Math.max(250, Math.round(config.maxWalkingDistanceM * 0.85)),
          maxTotalWalkingDistanceM: Math.max(
            Math.max(250, Math.round(config.maxWalkingDistanceM * 0.85)),
            Math.round(config.maxTotalWalkingDistanceM * 0.90),
          ),
        },
      },
    ];

    for (const exploratory of exploratoryCandidates) {
      if (alternatives.length >= 4) {
        break;
      }

      try {
        const exploratoryResult = await routingWorkerClient.route(
          {
            from: body.from,
            to: body.to,
            graph: snapshot,
            routeMetrics,
            config: exploratory.config,
            walkingMode: "api",
          },
          { timeoutMs: Math.max(2500, Math.floor(workerTimeoutMs * 0.5)) },
        );

        const normalizedResult = normalizeRouteResultForSchema(exploratoryResult, body.from, body.to);
        normalizedResult.routeLabel = `Alternative (${exploratory.id.replace("exploratory_", "").replace(/_/g, " ")})`;
        normalizedResult.profileId = exploratory.id;

        const fingerprint = routeFingerprint(normalizedResult);
        if (seenFingerprints.has(fingerprint)) {
          continue;
        }

        if (!isMeaningfullyDifferentRoute(normalizedResult, alternatives)) {
          continue;
        }

        seenFingerprints.add(fingerprint);
        alternatives.push(normalizedResult);
      } catch (error) {
        fastify.log.debug(
          {
            exploratory: exploratory.id,
            error: error instanceof Error ? error.message : String(error),
          },
          "Exploratory routing candidate failed",
        );
      }
    }
  }

  return alternatives;
}

export async function navigationRouteHandler(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = request.body as NavigationRouteRequestBody;
  const userPayload = request.user as { id?: number | string };
  const userId = Number(userPayload?.id);
  const workerTimeoutMs = Number(process.env.ROUTING_WORKER_TIMEOUT_MS ?? 12000);
  const debugRoutingLogs = process.env.DEBUG_ROUTING_LOGS === "1" || process.env.NODE_ENV !== "production";

  if (!Number.isFinite(userId)) {
    return reply.code(401).send({ error: "Unauthorized user payload" });
  }

  const snapshot = await graphCache.getSnapshot(fastify);

  const client = await fastify.pg.connect();
  try {
    if (debugRoutingLogs) {
      fastify.log.info(
        {
          userId,
          from: body.from,
          to: body.to,
          requestPreferences: body.preferences ?? null,
          requestOptions: body.options ?? null,
        },
        "Route request received",
      );
    }

    const routeMetrics: RouteLiveMetricForRouting[] = await loadRouteMetrics(client);
    const config = await getEffectiveRoutingConfig(client, userId, body);

    if (debugRoutingLogs) {
      fastify.log.info(
        {
          userId,
          effectiveConfig: {
            maxWalkingDistanceM: config.maxWalkingDistanceM,
            maxTotalWalkingDistanceM: config.maxTotalWalkingDistanceM,
            maxWalkingNeighbors: config.maxWalkingNeighbors,
            maxBusTransfers: config.maxBusTransfers,
            walkingSpeedMps: config.walkingSpeedMps,
            weights: config.weights,
          },
        },
        "Effective routing config resolved",
      );
    }

    const configJson = JSON.stringify(config);
    const cachedRes = await client.query<{
      graph_version: string | null;
      pathfinding_result: NavigationRouteResult | null;
    }>(
      `
      SELECT graph_version, pathfinding_result
      FROM travel_history
      WHERE user_id = $1
        AND origin_lat = $2
        AND origin_lng = $3
        AND dest_lat = $4
        AND dest_lng = $5
        AND pathfinding_result IS NOT NULL
      ORDER BY traveled_at DESC
      LIMIT 1
      `,
      [userId, body.from.lat, body.from.lng, body.to.lat, body.to.lng],
    );

    const cached = cachedRes.rows[0] ?? null;
    const cachedResult = cached?.pathfinding_result ?? null;
    if (
      cachedResult
      && cached.graph_version === snapshot.graphVersion
      && JSON.stringify(cachedResult.usedConfig) === configJson
      && cachedResult.walkingMode === "api"
    ) {
      return normalizeRouteResultForSchema(cachedResult, body.from, body.to);
    }

    let routeResult: NavigationRouteResult;
    try {
      const alternatives = await computeNavigationAlternatives(
        fastify,
        snapshot,
        body,
        routeMetrics,
        config,
        workerTimeoutMs,
      );

      routeResult = {
        ...alternatives[0],
        routes: alternatives,
        primaryRouteIndex: 0,
        alternatives: alternatives.slice(1),
        primaryAlternativeIndex: 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isTimeout = /timed out/i.test(message);
      const isSearchBudget = /search budget exceeded/i.test(message);
      const isNoRoute = /No route found|search budget exceeded/i.test(message);
      return reply.code(isTimeout ? 504 : isNoRoute ? 422 : 500).send({
        error: isTimeout
          ? "Routing timed out while searching for a path"
          : isSearchBudget
            ? "Route search needs more room. Try More options in preferences, fewer transfer limits, or closer start and destination points."
          : isNoRoute
            ? "No feasible route found under current constraints"
            : "Routing failed while searching for a path",
        details: process.env.NODE_ENV === "production" ? undefined : message,
      });
    }

    return routeResult;
  } finally {
    client.release();
  }
}

async function computeQuickRouteAlternatives(
  fastify: FastifyInstance,
  snapshot: Awaited<ReturnType<typeof graphCache.getSnapshot>>,
  body: NavigationRouteRequestBody,
  routeMetrics: RouteLiveMetricForRouting[],
  config: Awaited<ReturnType<typeof getEffectiveRoutingConfig>>,
  workerTimeoutMs: number,
) {
  const profiles = buildAlternativeProfiles(config.weights);
  const seenFingerprints = new Set<string>();
  const alternatives: NavigationRouteResult[] = [];
  const primaryProfile = profiles[0] as RouteProfile;
  const primaryResult = await routeWithFallback(fastify, {
    base: {
      from: body.from,
      to: body.to,
      graph: snapshot,
      routeMetrics,
      config: applyProfileConfig(config, primaryProfile),
    },
  });

  const normalizedPrimary = normalizeRouteResultForSchema(primaryResult, body.from, body.to);
  normalizedPrimary.routeLabel = primaryProfile.label;
  normalizedPrimary.profileId = primaryProfile.id;
  seenFingerprints.add(routeFingerprint(normalizedPrimary));
  alternatives.push(normalizedPrimary);

  const altProfiles = profiles.slice(1);
  for (const profile of altProfiles) {
    const profileConfig = applyProfileConfig(config, profile);
    const candidateWalkingModes: WalkingMode[] = ["api"];
    let bestCandidate: NavigationRouteResult | null = null;
    let bestCandidateScore = Number.POSITIVE_INFINITY;

    for (const walkingMode of candidateWalkingModes) {
      try {
        const computedResult = await routingWorkerClient.route(
          {
            from: body.from,
            to: body.to,
            graph: snapshot,
            routeMetrics,
            config: profileConfig,
            walkingMode,
          },
          { timeoutMs: Math.max(3500, Math.floor(workerTimeoutMs * 0.65)) },
        );

        const normalizedResult = normalizeRouteResultForSchema(computedResult, body.from, body.to);
        normalizedResult.routeLabel = profile.label;
        normalizedResult.profileId = profile.id;

        const fingerprint = routeFingerprint(normalizedResult);
        if (seenFingerprints.has(fingerprint)) {
          continue;
        }

        if (!isMeaningfullyDifferentRoute(normalizedResult, alternatives)) {
          continue;
        }

        const candidateScore = scoreProfileCandidate(profile.id, normalizedResult);
        if (candidateScore < bestCandidateScore) {
          bestCandidate = normalizedResult;
          bestCandidateScore = candidateScore;
        }
      } catch (error) {
        fastify.log.warn(
          {
            profile: profile.id,
            walkingMode,
            error: error instanceof Error ? error.message : String(error),
          },
          "Alternative routing profile failed",
        );
      }
    }

    if (bestCandidate) {
      seenFingerprints.add(routeFingerprint(bestCandidate));
      alternatives.push(bestCandidate);
    }

    if (alternatives.length >= 4) {
      break;
    }
  }

  if (alternatives.length < 2) {
    const exploratoryCandidates = [
      {
        id: "exploratory_low_transfer",
        config: {
          ...config,
          maxBusTransfers: Math.max(0, Math.min(config.maxBusTransfers, 2)),
        },
      },
      {
        id: "exploratory_bounded_walk",
        config: {
          ...config,
          maxWalkingDistanceM: Math.max(250, Math.round(config.maxWalkingDistanceM * 0.85)),
          maxTotalWalkingDistanceM: Math.max(
            Math.max(250, Math.round(config.maxWalkingDistanceM * 0.85)),
            Math.round(config.maxTotalWalkingDistanceM * 0.90),
          ),
        },
      },
    ];

    for (const exploratory of exploratoryCandidates) {
      if (alternatives.length >= 4) {
        break;
      }

      try {
        const exploratoryResult = await routingWorkerClient.route(
          {
            from: body.from,
            to: body.to,
            graph: snapshot,
            routeMetrics,
            config: exploratory.config,
            walkingMode: "api",
          },
          { timeoutMs: Math.max(2500, Math.floor(workerTimeoutMs * 0.5)) },
        );

        const normalizedResult = normalizeRouteResultForSchema(exploratoryResult, body.from, body.to);
        normalizedResult.routeLabel = `Alternative (${exploratory.id.replace("exploratory_", "").replace(/_/g, " ")})`;
        normalizedResult.profileId = exploratory.id;

        const fingerprint = routeFingerprint(normalizedResult);
        if (seenFingerprints.has(fingerprint)) {
          continue;
        }

        if (!isMeaningfullyDifferentRoute(normalizedResult, alternatives)) {
          continue;
        }

        seenFingerprints.add(fingerprint);
        alternatives.push(normalizedResult);
      } catch (error) {
        fastify.log.debug(
          {
            exploratory: exploratory.id,
            error: error instanceof Error ? error.message : String(error),
          },
          "Exploratory routing candidate failed",
        );
      }
    }
  }

  return alternatives;
}

export async function getGraphCacheHandler(
  fastify: FastifyInstance,
  request: FastifyRequest,
) {
  const query = request.query as GraphCacheQuery;
  await graphCache.getSnapshot(fastify, query.forceRefresh ?? false);
  return graphCache.getStatus();
}

export async function invalidateGraphCacheHandler(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const adminId = await requireAdminRole(fastify, request, reply);
  if (adminId == null) {
    return reply;
  }

  const query = request.query as InvalidateGraphQuery;
  const rebuild = query.rebuild ?? true;
  const wait = query.wait ?? false;

  if (!rebuild) {
    graphCache.invalidate();
    return { message: "Graph cache invalidated" };
  }

  if (wait) {
    await graphCache.invalidateAndRebuild(fastify, true);
    return { message: "Graph invalidated, rebuilt, and cache refreshed" };
  }

  void graphCache.invalidateAndRebuild(fastify, false);
  return reply.code(202).send({ message: "Graph invalidated; rebuild started in background" });
}

export async function getGraphHandler(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const query = request.query as GetGraphQuery;
  const snapshot = await graphCache.getSnapshot(fastify, query.forceRefresh ?? false);

  const graph = {
    loadedAt: snapshot.loadedAt,
    routes: query.includeRoutes === false ? [] : snapshot.routes,
    nodes: query.includeNodes === false ? [] : snapshot.nodes,
    edges: query.includeEdges === false ? [] : snapshot.edges,
    routeNodes: query.includeRouteNodes === false ? [] : snapshot.routeNodes,
  };

  reply.header("x-graph-loaded-at", snapshot.loadedAt);
  return graph;
}

export async function getRoutingPreferencesHandler(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userPayload = request.user as { id?: number | string };
  const userId = Number(userPayload?.id);

  if (!Number.isFinite(userId)) {
    return reply.code(401).send({ error: "Unauthorized user payload" });
  }

  const client = await fastify.pg.connect();
  try {
    const config = await getEffectiveRoutingConfig(
      client,
      userId,
      {
        from: { lat: 0, lng: 0 },
        to: { lat: 0, lng: 0 },
      },
    );

    if (process.env.DEBUG_ROUTING_LOGS === "1" || process.env.NODE_ENV !== "production") {
      fastify.log.info(
        {
          userId,
          preferences: config.weights,
          options: {
            maxWalkingDistanceM: config.maxWalkingDistanceM,
            maxTotalWalkingDistanceM: config.maxTotalWalkingDistanceM,
            maxWalkingNeighbors: config.maxWalkingNeighbors,
            maxBusTransfers: config.maxBusTransfers,
            walkingSpeedMps: config.walkingSpeedMps,
          },
        },
        "Routing preferences fetched",
      );
    }

    return {
      preferences: config.weights,
      options: {
        maxWalkingDistanceM: config.maxWalkingDistanceM,
        maxTotalWalkingDistanceM: config.maxTotalWalkingDistanceM,
        maxWalkingNeighbors: config.maxWalkingNeighbors,
        maxBusTransfers: config.maxBusTransfers,
        walkingSpeedMps: config.walkingSpeedMps,
      },
    };
  } finally {
    client.release();
  }
}

export async function quickNavigationRouteHandler(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const workerTimeoutMs = Number(process.env.ROUTING_WORKER_TIMEOUT_MS ?? 12000);
  const snapshot = await graphCache.getSnapshot(fastify);
  const body = request.body as NavigationRouteRequestBody;

  const client = await fastify.pg.connect();
  try {
    const routeMetrics: RouteLiveMetricForRouting[] = await loadRouteMetrics(client);
    const config = await getEffectiveRoutingConfig(client, 0, body);

    try {
      const alternatives = await computeNavigationAlternatives(
        fastify,
        snapshot,
        body,
        routeMetrics,
        config,
        workerTimeoutMs,
      );

      return {
        ...alternatives[0],
        routes: alternatives,
        primaryRouteIndex: 0,
        alternatives: alternatives.slice(1),
        primaryAlternativeIndex: 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isTimeout = /timed out/i.test(message);
      const isSearchBudget = /search budget exceeded/i.test(message);
      const isNoRoute = /No route found|search budget exceeded/i.test(message);
      return reply.code(isTimeout ? 504 : isNoRoute ? 422 : 500).send({
        error: isTimeout
          ? "Routing timed out while searching for a path"
          : isSearchBudget
            ? "Route search needs more room. Try More options in preferences, fewer transfer limits, or closer start and destination points."
          : isNoRoute
            ? "No feasible route found under current constraints"
            : "Routing failed while searching for a path",
        details: process.env.NODE_ENV === "production" ? undefined : message,
      });
    }
  } finally {
    client.release();
  }
}
