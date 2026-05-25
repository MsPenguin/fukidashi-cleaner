import path from "node:path";
import fs from "node:fs/promises";
import * as ort from "onnxruntime-node";
import { getResourcesRoot } from "../image/model/model-path";

type SessionKey = "textDetector" | "inpainter";

const sessions = new Map<SessionKey, ort.InferenceSession>();

const modelFiles: Record<
  SessionKey,
  { candidates: string[]; configPath: string }
> = {
  textDetector: {
    candidates: ["models/text-detector/det.onnx", "models/text-detector.onnx"],
    configPath: "models/text-detector/config.json",
  },
  inpainter: {
    candidates: ["models/inpaint/lama_fp32.onnx", "models/lama.onnx"],
    configPath: "models/inpaint/config.json",
  },
};

function modelRootPath() {
  return getResourcesRoot();
}

function modelPath(relativePath: string) {
  return path.join(modelRootPath(), ...relativePath.split("/"));
}

export async function getModelInfo(key: SessionKey) {
  const configPath = modelPath(modelFiles[key].configPath);
  const fallbackPath = modelPath(modelFiles[key].candidates[0]);

  for (const candidate of modelFiles[key].candidates) {
    const filePath = modelPath(candidate);
    const stats = await statFile(filePath);

    if (stats?.isFile()) {
      return {
        filePath,
        configPath,
        exists: true,
        sizeBytes: stats.size,
      };
    }
  }

  return {
    filePath: fallbackPath,
    configPath,
    exists: false,
    sizeBytes: 0,
  };
}

export async function getModelConfig<T extends object>(
  key: SessionKey,
): Promise<Partial<T>> {
  const model = await getModelInfo(key);

  try {
    const contents = await fs.readFile(model.configPath, "utf8");
    return JSON.parse(contents) as Partial<T>;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

export async function getSession(key: SessionKey) {
  const cached = sessions.get(key);
  if (cached) return cached;

  const model = await getModelInfo(key);
  if (!model.exists || model.sizeBytes === 0) {
    throw new Error(
      `Model file is missing or empty: ${model.filePath}. Put a valid ONNX model in resources/models before running ${key}.`,
    );
  }

  const session = await createSession(model.filePath);

  sessions.set(key, session);
  return session;
}

async function createSession(filePath: string) {
  if (process.platform !== "win32") {
    return ort.InferenceSession.create(filePath, {
      executionProviders: ["cpu"],
    });
  }

  try {
    return await ort.InferenceSession.create(filePath, {
      executionProviders: ["dml", "cpu"],
    });
  } catch {
    return ort.InferenceSession.create(filePath, {
      executionProviders: ["cpu"],
    });
  }
}

async function statFile(filePath: string) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
