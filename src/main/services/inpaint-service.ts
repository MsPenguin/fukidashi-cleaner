import * as ort from "onnxruntime-node";
import {
  resizeMask,
  resizeRawRgbaImage,
  type RawImage,
} from "./image-service";
import { getModelInfo, getSession } from "./model-manager";

type TensorMetadata = {
  name: string;
  isTensor: boolean;
  type?: string;
  shape?: ReadonlyArray<number | string>;
};

type LamaSpec = {
  imageInputName: string;
  maskInputName: string;
  outputName: string;
  width: number;
  height: number;
};

export async function inpaintImage(
  image: RawImage,
  mask: Uint8Array,
): Promise<RawImage> {
  assertMaskSize(mask, image.width, image.height);

  const model = await getModelInfo("inpainter");
  if (!model.exists || model.sizeBytes === 0) {
    return image;
  }

  const session = await getSession("inpainter");
  const spec = getLamaSpec(session, image.width, image.height);

  const needsResize = spec.width !== image.width || spec.height !== image.height;
  const modelImage = needsResize
    ? await resizeRawRgbaImage(image, spec.width, spec.height)
    : image;
  const modelMask = needsResize
    ? await resizeMask(mask, image.width, image.height, spec.width, spec.height)
    : mask;

  const feeds: Record<string, ort.Tensor> = {
    [spec.imageInputName]: rgbaToRgbNchwFloat(modelImage),
    [spec.maskInputName]: maskToNchwFloat(modelMask, spec.width, spec.height),
  };

  const results = await session.run(feeds);
  const output = results[spec.outputName];

  if (!(output instanceof ort.Tensor)) {
    throw new Error(`LaMa output "${spec.outputName}" is not a tensor.`);
  }

  const inpainted = rgbNchwTensorToRgba(output, spec.width, spec.height);
  return needsResize
    ? resizeRawRgbaImage(inpainted, image.width, image.height)
    : inpainted;
}

function getLamaSpec(
  session: ort.InferenceSession,
  sourceWidth: number,
  sourceHeight: number,
): LamaSpec {
  const inputs = session.inputMetadata.filter(isTensorMetadata) as TensorMetadata[];
  const outputs = session.outputMetadata.filter(isTensorMetadata) as TensorMetadata[];

  if (inputs.length < 2) {
    throw new Error(
      `LaMa ONNX model must expose image and mask tensor inputs. Found: ${formatMetadata(inputs)}`,
    );
  }

  const imageInput = findNchwInput(inputs, 3) ?? inputs[0];
  const maskInput =
    findNchwInput(
      inputs.filter((input) => input.name !== imageInput.name),
      1,
    ) ?? inputs.find((input) => input.name !== imageInput.name);

  if (!maskInput) {
    throw new Error(
      `LaMa ONNX model must expose a separate mask input. Found: ${formatMetadata(inputs)}`,
    );
  }

  validateNchwTensor(imageInput, 3, "LaMa image input");
  validateNchwTensor(maskInput, 1, "LaMa mask input");

  const output = outputs[0];
  if (!output) {
    throw new Error("LaMa ONNX model must expose at least one tensor output.");
  }
  validateNchwTensor(output, 3, "LaMa output");

  const imageShape = imageInput.shape ?? [];
  return {
    imageInputName: imageInput.name,
    maskInputName: maskInput.name,
    outputName: output.name,
    width: resolveDimension(imageShape[3], sourceWidth, "LaMa input width"),
    height: resolveDimension(imageShape[2], sourceHeight, "LaMa input height"),
  };
}

function rgbaToRgbNchwFloat(image: RawImage): ort.Tensor {
  const { data, width, height } = image;
  const out = new Float32Array(1 * 3 * height * width);
  const planeSize = width * height;

  for (let i = 0; i < planeSize; i++) {
    const rgbaIndex = i * 4;

    out[i] = data[rgbaIndex] / 255;
    out[planeSize + i] = data[rgbaIndex + 1] / 255;
    out[planeSize * 2 + i] = data[rgbaIndex + 2] / 255;
  }

  return new ort.Tensor("float32", out, [1, 3, height, width]);
}

function maskToNchwFloat(
  mask: Uint8Array,
  width: number,
  height: number,
): ort.Tensor {
  const out = new Float32Array(width * height);

  for (let i = 0; i < mask.length; i++) {
    out[i] = mask[i] > 0 ? 1 : 0;
  }

  return new ort.Tensor("float32", out, [1, 1, height, width]);
}

function rgbNchwTensorToRgba(
  tensor: ort.Tensor,
  width: number,
  height: number,
): RawImage {
  if (tensor.type !== "float32") {
    throw new Error(`LaMa output must be float32. Found: ${tensor.type}`);
  }

  const dims = tensor.dims;
  if (
    dims.length !== 4 ||
    dims[0] !== 1 ||
    dims[1] !== 3 ||
    dims[2] !== height ||
    dims[3] !== width
  ) {
    throw new Error(
      `LaMa output must be [1,3,${height},${width}]. Found: [${dims.join(",")}].`,
    );
  }

  const input = tensor.data as Float32Array;
  const output = new Uint8Array(width * height * 4);
  const planeSize = width * height;
  const scale = shouldScaleUnitRange(input) ? 255 : 1;

  for (let i = 0; i < planeSize; i++) {
    output[i * 4] = toByte(input[i] * scale);
    output[i * 4 + 1] = toByte(input[planeSize + i] * scale);
    output[i * 4 + 2] = toByte(input[planeSize * 2 + i] * scale);
    output[i * 4 + 3] = 255;
  }

  return {
    data: output,
    width,
    height,
    channels: 4,
  };
}

function validateNchwTensor(
  metadata: TensorMetadata,
  channels: number,
  label: string,
) {
  if (metadata.type !== "float32") {
    throw new Error(`${label} must be float32. Found: ${metadata.type ?? "unknown"}.`);
  }

  const shape = metadata.shape;
  if (!shape || shape.length !== 4) {
    throw new Error(
      `${label} must be rank-4 NCHW. Found: ${formatMetadata([metadata])}`,
    );
  }

  assertDimension(shape[0], 1, `${label} batch`);
  assertDimension(shape[1], channels, `${label} channels`);
}

function findNchwInput(inputs: TensorMetadata[], channels: number) {
  return inputs.find((input) => {
    const shape = input.shape;
    return shape?.length === 4 && isDimension(shape[1], channels);
  });
}

function isTensorMetadata(metadata: unknown): metadata is TensorMetadata {
  return Boolean(
    metadata &&
      typeof metadata === "object" &&
      "isTensor" in metadata &&
      metadata.isTensor,
  );
}

function assertMaskSize(mask: Uint8Array, width: number, height: number) {
  if (mask.length !== width * height) {
    throw new Error(
      `Mask size mismatch. Expected ${width * height} bytes, found ${mask.length}.`,
    );
  }
}

function assertDimension(
  actual: number | string | undefined,
  expected: number,
  label: string,
) {
  if (!isDimension(actual, expected)) {
    throw new Error(`${label} must be ${expected}. Found: ${String(actual)}.`);
  }
}

function isDimension(actual: number | string | undefined, expected: number) {
  return actual === expected || typeof actual === "string";
}

function resolveDimension(
  value: number | string | undefined,
  fallback: number,
  label: string,
) {
  if (typeof value === "number") {
    if (value <= 0) {
      throw new Error(`${label} must be positive. Found: ${value}.`);
    }

    return value;
  }

  return fallback;
}

function shouldScaleUnitRange(values: Float32Array) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < values.length; i++) {
    min = Math.min(min, values[i]);
    max = Math.max(max, values[i]);
  }

  return min >= -1 && max <= 1.5;
}

function toByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function formatMetadata(metadata: TensorMetadata[]) {
  if (metadata.length === 0) return "none";

  return metadata
    .map((item) => {
      const shape = item.shape ? `[${item.shape.join(",")}]` : "unknown-shape";
      return `${item.name}:${item.type ?? "unknown"}:${shape}`;
    })
    .join(", ");
}
