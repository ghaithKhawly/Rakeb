import { parentPort } from "node:worker_threads";

type LocationDTO = {
  lat: number;
  lng: number;
  label?: string;
};

type RoutingWorkerRequest = {
  id: number;
  payload: {
    from: LocationDTO;
    to: LocationDTO;
    graphLoadedAt: string | null;
  };
};

type RoutingWorkerResponse = {
  id: number;
  result?: {
    from: LocationDTO;
    to: LocationDTO;
    message: string;
    executedInWorker: true;
    graphLoadedAt: string | null;
  };
  error?: string;
};

if (!parentPort) {
  throw new Error("routingWorker must run inside a worker thread");
}

const port = parentPort;

port.on("message", (message: RoutingWorkerRequest) => {
  try {
    const { from, to, graphLoadedAt } = message.payload;

    const response: RoutingWorkerResponse = {
      id: message.id,
      result: {
        from,
        to,
        message: "Routing placeholder executed in worker thread",
        executedInWorker: true,
        graphLoadedAt,
      },
    };

    port.postMessage(response);
  } catch (error) {
    port.postMessage({
      id: message.id,
      error: error instanceof Error ? error.message : String(error),
    } satisfies RoutingWorkerResponse);
  }
});
