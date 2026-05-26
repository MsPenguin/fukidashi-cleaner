import path from "node:path";
import { Worker } from "node:worker_threads";
import type {
  RemoveTextInput,
  RemoveTextResult,
  RemoveTextWorkerState,
} from "../../shared/image-types";
import type { PipelineProgress } from "../image/pipeline/run-textless-pipeline";

type WorkerMessage =
  | { type: "progress"; progress: PipelineProgress }
  | { type: "result"; result: RemoveTextResult }
  | { type: "error"; error: string; stack?: string };

type QueueItem = {
  payload: RemoveTextInput;
  defaultOutputDirectory: string;
  onProgress?: (progress: PipelineProgress) => void;
  onState?: (state: RemoveTextWorkerState) => void;
  resolve: (result: RemoveTextResult) => void;
  reject: (error: Error) => void;
};

const queue: QueueItem[] = [];
let isProcessingQueue = false;
let activeWorker: Worker | null = null;
let activeJob: QueueItem | null = null;
let cancelActiveJob: (() => Promise<boolean>) | null = null;

function getWaitingJobsCount() {
  return queue.length + (activeWorker ? 1 : 0);
}

export function runRemoveTextInWorker(params: {
  payload: RemoveTextInput;
  defaultOutputDirectory: string;
  onProgress?: (progress: PipelineProgress) => void;
  onState?: (state: RemoveTextWorkerState) => void;
}): Promise<RemoveTextResult> {
  return new Promise<RemoveTextResult>((resolve, reject) => {
    const inputName = path.basename(params.payload.inputPath);
    const waitingJobs = getWaitingJobsCount();

    queue.push({
      payload: params.payload,
      defaultOutputDirectory: params.defaultOutputDirectory,
      onProgress: params.onProgress,
      onState: params.onState,
      resolve,
      reject,
    });

    params.onState?.({
      state: "queued",
      message: `${inputName} 작업이 대기열에 들어갔습니다.`,
      waitingJobs,
      inputName,
    });

    void processQueue();
  });
}

async function processQueue() {
  if (isProcessingQueue) {
    return;
  }

  isProcessingQueue = true;

  try {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) {
        continue;
      }

      await executeQueuedJob(job);
    }
  } finally {
    isProcessingQueue = false;
  }
}

function executeQueuedJob(job: QueueItem): Promise<void> {
  const workerPath = path.join(__dirname, "./workers/remove-text.worker.mjs");
  const inputName = path.basename(job.payload.inputPath);

  return new Promise<void>((resolveJob) => {
    const worker = new Worker(workerPath, {
      workerData: {
        payload: job.payload,
        defaultOutputDirectory: job.defaultOutputDirectory,
      },
    });

    activeWorker = worker;
    activeJob = job;

    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      callback();
      resolveJob();
    };

    job.onState?.({
      state: "running",
      message: `${inputName} 작업을 시작합니다.`,
      waitingJobs: queue.length,
      inputName,
    });

    worker.on("message", (message: WorkerMessage) => {
      if (message.type === "progress") {
        job.onProgress?.(message.progress);
        return;
      }

      if (message.type === "result") {
        settle(() => {
          job.onState?.({
            state: "completed",
            message: `${inputName} 작업이 완료되었습니다.`,
            waitingJobs: queue.length,
            inputName,
            outputPath: message.result.outputPath,
          });
          job.resolve(message.result);
          worker.terminate().catch(() => undefined);
        });
        return;
      }

      settle(() => {
        const error = new Error(message.error);
        job.onState?.({
          state: "error",
          message: `${inputName} 작업에 실패했습니다.`,
          waitingJobs: queue.length,
          inputName,
          error: message.error,
        });
        job.reject(error);
        worker.terminate().catch(() => undefined);
      });
    });

    worker.on("error", (error) => {
      settle(() => {
        job.onState?.({
          state: "error",
          message: `${inputName} 작업에 실패했습니다.`,
          waitingJobs: queue.length,
          inputName,
          error: error.message,
        });
        job.reject(error);
      });
    });

    worker.on("exit", (code) => {
      if (activeWorker === worker) {
        activeWorker = null;
        activeJob = null;
        cancelActiveJob = null;
      }

      if (settled || code === 0) {
        return;
      }

      settle(() => {
        const error = new Error(`Remove-text worker exited with code ${code}`);
        job.onState?.({
          state: "error",
          message: `${inputName} 작업에 실패했습니다.`,
          waitingJobs: queue.length,
          inputName,
          error: error.message,
        });
        job.reject(error);
      });
    });

    cancelActiveJob = async () => {
      if (settled) {
        return false;
      }

      settled = true;
      job.onState?.({
        state: "cancelled",
        message: `${inputName} 작업을 취소했습니다.`,
        waitingJobs: queue.length,
        inputName,
      });
      job.reject(new Error("Remove-text job cancelled."));
      activeWorker = null;
      activeJob = null;
      await worker.terminate().catch(() => undefined);
      resolveJob();
      return true;
    };
  });
}

export async function cancelRemoveTextJobs() {
  queue.length = 0;

  const cancelCurrent = cancelActiveJob;

  if (!cancelCurrent) {
    return false;
  }

  return cancelCurrent();
}
