import { Worker } from "node:worker_threads";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  NavigationRouteResult,
  RoutingWorkerPayload,
} from "../../../types/navigation";

type RoutingPayload = RoutingWorkerPayload;
type RoutingResult = NavigationRouteResult;

type WorkerResponse = {
  id: number;
  result?: RoutingResult;
  error?: string;
};

type RouteCallOptions = {
  timeoutMs?: number;
};

type PendingRequest = {
  resolve: (value: RoutingResult) => void;
  reject: (reason?: unknown) => void;
  timeoutHandle?: NodeJS.Timeout;
};

class RoutingWorkerClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private restarting = false;

  constructor() {
    this.worker = this.createWorker();
  }

  private createWorker(): Worker {
    const workerPath = this.resolveWorkerPath();
    const workerExecArgv = workerPath.endsWith(".ts")
      ? ["--import", "tsx"]
      : undefined;

    const worker = new Worker(workerPath, {
      name: "routing-worker",
      execArgv: workerExecArgv,
    });

    worker.on("message", (message: WorkerResponse) => {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      
      this.pending.delete(message.id);
      if (pending.timeoutHandle) {
        clearTimeout(pending.timeoutHandle);
      }

      if (message.error) {
        pending.reject(new Error(message.error));
        return;
      }

      if (!message.result) {
        pending.reject(new Error("Routing worker returned no result"));
        return;
      }

      pending.resolve(message.result);
    });

    worker.on("error", (error) => {
      for (const entry of this.pending.values()) {
        if (entry.timeoutHandle) {
          clearTimeout(entry.timeoutHandle);
        }
        entry.reject(error);
      }
      this.pending.clear();
      this.restartWorker();
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        const error = new Error(`Routing worker exited with code ${code}`);
        for (const entry of this.pending.values()) {
          if (entry.timeoutHandle) {
            clearTimeout(entry.timeoutHandle);
          }
          entry.reject(error);
        }
        this.pending.clear();
        this.restartWorker();
      }
    });

    return worker;
  }

  private restartWorker(): void {
    if (this.restarting) {
      return;
    }

    this.restarting = true;
    const oldWorker = this.worker;

    void oldWorker.terminate().catch(() => {
      // noop
    }).finally(() => {
      this.worker = this.createWorker();
      this.restarting = false;
    });
  }

  route(payload: RoutingPayload, options?: RouteCallOptions): Promise<RoutingResult> {
    const id = this.nextId++;
    const timeoutMs = options?.timeoutMs;

    return new Promise<RoutingResult>((resolve, reject) => {
      const pendingEntry: PendingRequest = { resolve, reject };

      if (typeof timeoutMs === "number" && timeoutMs > 0) {
        pendingEntry.timeoutHandle = setTimeout(() => {
          const existing = this.pending.get(id);
          if (!existing) {
            return;
          }
          this.pending.delete(id);
          reject(new Error(`Routing worker timed out after ${timeoutMs}ms`));
          this.restartWorker();
        }, timeoutMs);
      }

      this.pending.set(id, pendingEntry);
      this.worker.postMessage({ id, payload });
    });
  }

  private resolveWorkerPath(): string {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const distJsPath = path.resolve(currentDir, "../../dist/back/src/workers/routingWorker.js");
    const tsPath = path.resolve(currentDir, "../workers/routingWorker.ts");
    const jsPath = path.resolve(currentDir, "../workers/routingWorker.js");

    if (existsSync(distJsPath)) {
      return distJsPath;
    }

    if (existsSync(tsPath)) {
      return tsPath;
    }

    if (existsSync(jsPath)) {
      return jsPath;
    }

    throw new Error(`Routing worker file not found. Checked: ${distJsPath}, ${tsPath}, ${jsPath}`);
  }
}

export const routingWorkerClient = new RoutingWorkerClient();
