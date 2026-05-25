import { parentPort, workerData } from "node:worker_threads";
import type {
  RemoveTextInput,
  RemoveTextResult,
} from "../../shared/image-types";
import {
  runTextlessPipeline,
  type PipelineProgress,
} from "../image/pipeline/run-textless-pipeline";

type WorkerData = {
  payload: RemoveTextInput;
  defaultOutputDirectory: string;
};

if (!parentPort) {
  throw new Error("remove-text.worker must be started as a worker thread.");
}

const port = parentPort;
const { payload, defaultOutputDirectory } = workerData as WorkerData;

async function run() {
  try {
    const result = await runTextlessPipeline(
      payload,
      (progress: PipelineProgress) => {
        port.postMessage({ type: "progress", progress });
      },
      { defaultOutputDirectory },
    );

    port.postMessage({ type: "result", result });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    port.postMessage({
      type: "error",
      error: err.message,
      stack: err.stack,
    });
  }
}

void run();
