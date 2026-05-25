import * as ort from "onnxruntime-node";

const sessionCache = new Map<string, ort.InferenceSession>();

export async function getOnnxSession(modelPath: string) {
  const cached = sessionCache.get(`dml:${modelPath}`);
  if (cached) return cached;

  const session = await createSession(modelPath, ["dml", "cpu"]);
  sessionCache.set(`dml:${modelPath}`, session);

  return session;
}

export async function getCpuOnnxSession(modelPath: string) {
  const cached = sessionCache.get(`cpu:${modelPath}`);
  if (cached) return cached;

  const session = await createSession(modelPath, ["cpu"]);
  sessionCache.set(`cpu:${modelPath}`, session);

  return session;
}

async function createSession(modelPath: string, executionProviders: string[]) {
  return ort.InferenceSession.create(modelPath, {
    executionProviders:
      executionProviders as ort.InferenceSession.SessionOptions["executionProviders"],
  });
}
