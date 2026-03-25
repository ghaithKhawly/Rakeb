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

class RoutingWorkerClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: RoutingResult) => void; reject: (reason?: unknown) => void }>();

  constructor() {
    const workerPath = this.resolveWorkerPath();
    this.worker = new Worker(workerPath, {
      name: "routing-worker",
    });

    this.worker.on("message", (message: WorkerResponse) => {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      
      this.pending.delete(message.id);

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

    this.worker.on("error", (error) => {
      for (const entry of this.pending.values()) {
        entry.reject(error);
      }
      this.pending.clear();
    });

    this.worker.on("exit", (code) => {
      if (code !== 0) {
        const error = new Error(`Routing worker exited with code ${code}`);
        for (const entry of this.pending.values()) {
          entry.reject(error);
        }
        this.pending.clear();
      }
    });
  }

  route(payload: RoutingPayload): Promise<RoutingResult> {
    const id = this.nextId++;

    return new Promise<RoutingResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, payload });
    });
  }

  private resolveWorkerPath(): string {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const tsPath = path.resolve(currentDir, "../workers/routingWorker.ts");
    const jsPath = path.resolve(currentDir, "../workers/routingWorker.js");

    if (existsSync(tsPath)) {
      return tsPath;
    }

    if (existsSync(jsPath)) {
      return jsPath;
    }

    throw new Error(`Routing worker file not found. Checked: ${tsPath}, ${jsPath}`);
  }
}

export const routingWorkerClient = new RoutingWorkerClient();
