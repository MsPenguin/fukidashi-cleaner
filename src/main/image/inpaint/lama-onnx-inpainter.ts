import { getModelPath } from "../model/model-path";
import {
  getCpuOnnxSession,
  getOnnxSession,
} from "../model/onnx-session-manager";
import { chooseLamaBucket } from "./bucket-selector";
import {
  maskToPaddedTensor,
  rgbaCropToPaddedRgbTensor,
  lamaOutputToRgbaCrop,
} from "./tensor-adapter";

const webgpuUnavailableModelPaths = new Set<string>();

export async function inpaintWithLama(params: {
  crop: {
    data: Uint8Array;
    width: number;
    height: number;
  };
  cropMask: Uint8Array;
  allowLargeBucket: boolean;
}): Promise<Uint8Array> {
  const { crop, cropMask, allowLargeBucket } = params;

  const bucket = chooseLamaBucket({
    width: crop.width,
    height: crop.height,
    allowLargeBucket,
  });

  if (!bucket) {
    throw new Error(
      `Crop too large for single LaMa bucket: ${crop.width}x${crop.height}`,
    );
  }

  const modelPath = getModelPath("inpaint", bucket.fileName);
  const imageTensor = rgbaCropToPaddedRgbTensor(crop, bucket.size);
  const maskTensor = maskToPaddedTensor({
    mask: cropMask,
    width: crop.width,
    height: crop.height,
    bucketSize: bucket.size,
  });
  const inputs = {
    imageTensor,
    maskTensor,
  };

  let result;

  // Allow forcing CPU execution via env var for debugging: set DEBUG_FORCE_CPU_LAMA=1
  const forceCpu = process.env.DEBUG_FORCE_CPU_LAMA === "1";

  try {
    if (forceCpu) {
      console.log(
        `[lama] DEBUG_FORCE_CPU_LAMA set — running ${modelPath} on CPU`,
      );
      result = await runLamaOnCpu(
        modelPath,
        bucket.size,
        bucket.fileName,
        inputs,
      );
    } else {
      result = webgpuUnavailableModelPaths.has(modelPath)
        ? await runLamaOnCpu(modelPath, bucket.size, bucket.fileName, inputs)
        : await runLamaOnPreferredProvider(
            modelPath,
            bucket.size,
            bucket.fileName,
            crop.width,
            crop.height,
            inputs,
          );
    }
  } catch (error) {
    console.warn("WebGPU LaMa execution failed. Retrying on CPU.", error);
    webgpuUnavailableModelPaths.add(modelPath);
    result = await runLamaOnCpu(
      modelPath,
      bucket.size,
      bucket.fileName,
      inputs,
    );
  }

  const outputName = Object.keys(result)[0] ?? "";

  return lamaOutputToRgbaCrop({
    output: result[outputName],
    width: crop.width,
    height: crop.height,
    bucketSize: bucket.size,
    alphaSource: crop.data,
  });
}

async function runLamaOnPreferredProvider(
  modelPath: string,
  bucketSize: number,
  modelName: string,
  cropWidth: number,
  cropHeight: number,
  inputs: {
    imageTensor: ReturnType<typeof rgbaCropToPaddedRgbTensor>;
    maskTensor: ReturnType<typeof maskToPaddedTensor>;
  },
) {
  const session = await getOnnxSession(modelPath);
  assertLamaSessionShape(session, bucketSize, modelName);

  const feeds = {
    [session.inputNames[0]]: inputs.imageTensor,
    [session.inputNames[1]]: inputs.maskTensor,
  };

  console.log(
    `Running LaMa on webGPU: crop=${cropWidth}x${cropHeight}, bucket=${bucketSize}, model=${modelName}`,
  );

  return session.run(feeds);
}

async function runLamaOnCpu(
  modelPath: string,
  bucketSize: number,
  modelName: string,
  inputs: {
    imageTensor: ReturnType<typeof rgbaCropToPaddedRgbTensor>;
    maskTensor: ReturnType<typeof maskToPaddedTensor>;
  },
) {
  const cpuSession = await getCpuOnnxSession(modelPath);
  assertLamaSessionShape(cpuSession, bucketSize, modelName);

  const feeds = {
    [cpuSession.inputNames[0]]: inputs.imageTensor,
    [cpuSession.inputNames[1]]: inputs.maskTensor,
  };

  return cpuSession.run(feeds);
}

function assertLamaSessionShape(
  session: Awaited<ReturnType<typeof getOnnxSession>>,
  bucketSize: number,
  modelName: string,
) {
  const imageInput = session.inputMetadata[0];
  const maskInput = session.inputMetadata[1];
  const output = session.outputMetadata[0];

  assertNchwShape(imageInput, 3, bucketSize, `${modelName} image input`);
  assertNchwShape(maskInput, 1, bucketSize, `${modelName} mask input`);
  assertNchwShape(output, 3, bucketSize, `${modelName} output`);
}

function assertNchwShape(
  metadata:
    | {
        isTensor: boolean;
        type?: string;
        shape?: ReadonlyArray<number | string>;
      }
    | undefined,
  channels: number,
  bucketSize: number,
  label: string,
) {
  const shape = metadata?.shape;

  if (
    !metadata?.isTensor ||
    metadata.type !== "float32" ||
    !shape ||
    shape.length !== 4 ||
    !isCompatibleDimension(shape[1], channels) ||
    !isCompatibleDimension(shape[2], bucketSize) ||
    !isCompatibleDimension(shape[3], bucketSize)
  ) {
    throw new Error(
      `${label} must be float32 [batch,${channels},${bucketSize},${bucketSize}].`,
    );
  }
}

function isCompatibleDimension(
  actual: number | string | undefined,
  expected: number,
) {
  return (
    actual === expected ||
    typeof actual === "string" ||
    typeof actual === "undefined"
  );
}
