import type { FastifyInstance } from "fastify";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

type RouteRow = {
  id: number;
  name: string;
  type: string;
  avg_speed_kmh: number | null;
  base_price: number | null;
  frequency_minutes: number | null;
  crowding_tendency: string | null;
};

type NodeRow = {
  id: number;
  latitude: number;
  longitude: number;
};

type EdgeRow = {
  id: number;
  from_node: number;
  to_node: number;
  route_id: number | null;
  travel_time: number;
  distance_km: number;
  geom: string | null;
};

type RouteNodeRow = {
  route_id: number;
  node_id: number;
  sequence_order: number;
};

export type GraphSnapshot = {
  routes: RouteRow[];
  nodes: NodeRow[];
  edges: EdgeRow[];
  routeNodes: RouteNodeRow[];
  loadedAt: string | null;
  graphVersion: string | null;
};

type RebuildStatus = {
  isRebuilding: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
};

class GraphCacheService {
  private snapshot: GraphSnapshot | null = null;
  private loadingPromise: Promise<GraphSnapshot> | null = null;
  private rebuildPromise: Promise<GraphSnapshot> | null = null;
  private lastInvalidatedAt: string | null = null;
  private rebuildStatus: RebuildStatus = {
    isRebuilding: false,
    startedAt: null,
    finishedAt: null,
    lastError: null,
  };

  async warmup(fastify: FastifyInstance): Promise<GraphSnapshot> {
    return this.getSnapshot(fastify, false);
  }

  invalidate(): void {
    this.snapshot = null;
    this.lastInvalidatedAt = new Date().toISOString();
  }

  async invalidateAndRebuild(
    fastify: FastifyInstance,
    waitForCompletion = false,
  ): Promise<GraphSnapshot | null> {
    this.invalidate();

    if (!this.rebuildPromise) {
      this.rebuildStatus = {
        isRebuilding: true,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        lastError: null,
      };

      this.rebuildPromise = this.rebuildGraph(fastify)
        .then((snapshot) => {
          this.rebuildStatus = {
            isRebuilding: false,
            startedAt: this.rebuildStatus.startedAt,
            finishedAt: new Date().toISOString(),
            lastError: null,
          };
          return snapshot;
        })
        .catch((error: unknown) => {
          this.rebuildStatus = {
            isRebuilding: false,
            startedAt: this.rebuildStatus.startedAt,
            finishedAt: new Date().toISOString(),
            lastError: error instanceof Error ? error.message : String(error),
          };
          throw error;
        })
        .finally(() => {
          this.rebuildPromise = null;
        });
    }

    if (waitForCompletion) {
      return this.rebuildPromise;
    }

    return null;
  }

  async getSnapshot(fastify: FastifyInstance, forceRefresh = false): Promise<GraphSnapshot> {
    if (!forceRefresh && this.snapshot) {
      return this.snapshot;
    }

    if (forceRefresh) {
      this.snapshot = null;
    }

    if (!this.loadingPromise) {
      this.loadingPromise = this.loadFromDb(fastify)
        .then((snapshot) => {
          this.snapshot = snapshot;
          return snapshot;
        })
        .finally(() => {
          this.loadingPromise = null;
        });
    }

    return this.loadingPromise;
  }

  getStatus() {
    return {
      isLoaded: this.snapshot !== null,
      loadedAt: this.snapshot?.loadedAt ?? null,
      graphVersion: this.snapshot?.graphVersion ?? null,
      lastInvalidatedAt: this.lastInvalidatedAt,
      rebuild: this.rebuildStatus,
      counts: this.snapshot
        ? {
            routes: this.snapshot.routes.length,
            nodes: this.snapshot.nodes.length,
            edges: this.snapshot.edges.length,
            routeNodes: this.snapshot.routeNodes.length,
          }
        : null,
    };
  }

  private async rebuildGraph(fastify: FastifyInstance): Promise<GraphSnapshot> {
    await this.clearGraphTables(fastify);
    await this.runBuildScript();
    return this.getSnapshot(fastify, true);
  }

  private async clearGraphTables(fastify: FastifyInstance): Promise<void> {
    const client = await fastify.pg.connect();
    try {
      await client.query("BEGIN");
      await client.query("TRUNCATE TABLE edges, route_nodes, nodes, routes RESTART IDENTITY CASCADE");
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async runBuildScript(): Promise<void> {
    const scriptPath = process.env.GRAPH_REBUILD_SCRIPT_PATH
      ?? path.resolve(process.cwd(), "../script/build_graph_from_kmz.py");

    const kmzPaths = (process.env.GRAPH_KMZ_FILES
      ?? path.resolve(process.cwd(), "../script/busses.kmz"))
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (!existsSync(scriptPath)) {
      throw new Error(`Graph rebuild script not found at: ${scriptPath}`);
    }

    if (kmzPaths.length === 0) {
      throw new Error("GRAPH_KMZ_FILES is empty. Provide at least one KMZ path.");
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required for graph rebuild.");
    }

    const parsed = new URL(databaseUrl);
    const dbname = parsed.pathname.replace(/^\//, "");
    const user = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password);
    const host = parsed.hostname;
    const port = parsed.port || "5432";

    const pythonExec = process.env.PYTHON_EXECUTABLE ?? "python";
    const args = [
      scriptPath,
      ...kmzPaths,
      "--dbname",
      dbname,
      "--user",
      user,
      "--password",
      password,
      "--host",
      host,
      "--port",
      port,
    ];

    await new Promise<void>((resolve, reject) => {
      const child = spawn(pythonExec, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        reject(error);
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`Graph build script failed with code ${code}. ${stderr.trim()}`));
      });
    });
  }

  private async loadFromDb(fastify: FastifyInstance): Promise<GraphSnapshot> {
    const client = await fastify.pg.connect();

    try {
      const routesResult = await client.query<RouteRow>(
        "SELECT id, name, type, avg_speed_kmh, base_price, frequency_minutes, crowding_tendency FROM routes WHERE type = $1 ORDER BY id",
        ["bus"],
      );
      const nodesResult = await client.query<NodeRow>(
        "SELECT id, latitude, longitude FROM nodes ORDER BY id",
      );
      const edgesResult = await client.query<EdgeRow>(
        "SELECT id, from_node, to_node, route_id, travel_time, distance_km, ST_AsGeoJSON(geom) AS geom FROM edges ORDER BY id",
      );
      const routeNodesResult = await client.query<RouteNodeRow>(
        "SELECT route_id, node_id, sequence_order FROM route_nodes ORDER BY route_id, sequence_order",
      );

      const graphVersion = await this.computeGraphVersion();

      return {
        routes: routesResult.rows,
        nodes: nodesResult.rows,
        edges: edgesResult.rows,
        routeNodes: routeNodesResult.rows,
        loadedAt: new Date().toISOString(),
        graphVersion,
      };
    } finally {
      client.release();
    }
  }

  private async computeGraphVersion(): Promise<string | null> {
    const kmzPaths = (process.env.GRAPH_KMZ_FILES
      ?? path.resolve(process.cwd(), "../script/busses.kmz"))
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (kmzPaths.length === 0) {
      return null;
    }

    const hasher = createHash("sha256");
    let hashedAny = false;

    for (const kmzPath of kmzPaths) {
      if (!existsSync(kmzPath)) {
        continue;
      }
      const content = await readFile(kmzPath);
      hasher.update(kmzPath);
      hasher.update(content);
      hashedAny = true;
    }

    return hashedAny ? hasher.digest("hex") : null;
  }
}

export const graphCache = new GraphCacheService();
