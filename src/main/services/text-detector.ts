import * as ort from "onnxruntime-node";
import type { TextBox } from "../../shared/image-types";
import { resizeRawRgbaImage, type RawImage } from "./image-service";
import { getModelConfig, getModelInfo, getSession } from "./model-manager";

const DETECTOR_SIZE_MULTIPLE = 32;
const MIN_TEXT_AREA = 6;

type DetectorConfig = {
  resizeLong: number;
  thresh: number;
  boxThresh: number;
  maxCandidates: number;
  inputLayout: "nchw";
  imageRange: "0_1";
  mean: [number, number, number];
  std: [number, number, number];
};

const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
  resizeLong: 960,
  thresh: 0.18,
  boxThresh: 0.35,
  maxCandidates: 1000,
  inputLayout: "nchw",
  imageRange: "0_1",
  mean: [0, 0, 0],
  std: [1, 1, 1],
};

type TensorMetadata = {
  name: string;
  isTensor: boolean;
  type?: string;
  shape?: ReadonlyArray<number | string>;
};

type DetectorSpec = {
  inputName: string;
  width: number;
  height: number;
};

type ProbabilityMap = {
  data: Float32Array;
  width: number;
  height: number;
};

export async function detectTextBoxes(image: RawImage): Promise<TextBox[]> {
  const model = await getModelInfo("textDetector");

  if (!model.exists || model.sizeBytes === 0) {
    return createTemporaryBoxes(image);
  }

  const config = {
    ...DEFAULT_DETECTOR_CONFIG,
    ...(await getModelConfig<DetectorConfig>("textDetector")),
  };
  const session = await getSession("textDetector");
  const spec = getDetectorSpec(session, image.width, image.height, config);
  const modelImage =
    spec.width === image.width && spec.height === image.height
      ? image
      : await resizeRawRgbaImage(image, spec.width, spec.height);

  const feeds: Record<string, ort.Tensor> = {
    [spec.inputName]: rgbaToRgbNchwFloat(modelImage, config),
  };

  const results = await session.run(feeds);
  const outputName = session.outputNames[0];
  const output = results[outputName];

  if (!(output instanceof ort.Tensor)) {
    throw new Error(`Text detector output "${outputName}" is not a tensor.`);
  }

  const probabilityMap = extractProbabilityMap(output);
  const modelBoxes = probabilityMapToBoxes(
    probabilityMap,
    image.width,
    image.height,
    config,
  );

  return augmentWithFooterFallback(image, modelBoxes);
}

function getDetectorSpec(
  session: ort.InferenceSession,
  sourceWidth: number,
  sourceHeight: number,
  config: DetectorConfig,
): DetectorSpec {
  const inputs = session.inputMetadata.filter(
    isTensorMetadata,
  ) as TensorMetadata[];
  const input = inputs[0];

  if (!input) {
    throw new Error(
      "Text detector ONNX model must expose at least one tensor input.",
    );
  }

  validateDetectorInput(input);

  const shape = input.shape ?? [];
  const fallback = fitWithinSizeMultiple(
    sourceWidth,
    sourceHeight,
    config.resizeLong,
    DETECTOR_SIZE_MULTIPLE,
  );

  return {
    inputName: input.name,
    width: resolveDimension(
      shape[3],
      fallback.width,
      "text detector input width",
    ),
    height: resolveDimension(
      shape[2],
      fallback.height,
      "text detector input height",
    ),
  };
}

function validateDetectorInput(metadata: TensorMetadata) {
  if (metadata.type !== "float32") {
    throw new Error(
      `Text detector input must be float32. Found: ${metadata.type ?? "unknown"}.`,
    );
  }

  const shape = metadata.shape;
  if (!shape || shape.length !== 4) {
    throw new Error(
      `Text detector input must be rank-4 NCHW. Found: ${formatMetadata(metadata)}.`,
    );
  }

  if (!isDimension(shape[0], 1) || !isDimension(shape[1], 3)) {
    throw new Error(
      `Text detector input must be [1,3,H,W]. Found: ${formatMetadata(metadata)}.`,
    );
  }
}

function rgbaToRgbNchwFloat(
  image: RawImage,
  config: DetectorConfig,
): ort.Tensor {
  const { data, width, height } = image;
  const out = new Float32Array(1 * 3 * height * width);
  const planeSize = width * height;

  for (let i = 0; i < planeSize; i++) {
    const rgbaIndex = i * 4;

    out[i] = data[rgbaIndex] / 255;
    out[planeSize + i] = data[rgbaIndex + 1] / 255;
    out[planeSize * 2 + i] = data[rgbaIndex + 2] / 255;
  }

  for (let channel = 0; channel < 3; channel++) {
    const offset = planeSize * channel;
    const mean = config.mean[channel];
    const std = config.std[channel] || 1;

    for (let i = 0; i < planeSize; i++) {
      out[offset + i] = (out[offset + i] - mean) / std;
    }
  }

  return new ort.Tensor("float32", out, [1, 3, height, width]);
}

function extractProbabilityMap(tensor: ort.Tensor): ProbabilityMap {
  if (
    tensor.type !== "float32" &&
    tensor.type !== "uint8" &&
    tensor.type !== "int32"
  ) {
    throw new Error(
      `Text detector output must be numeric. Found: ${tensor.type}.`,
    );
  }

  const source = tensor.data as Float32Array | Uint8Array | Int32Array;
  const dims = tensor.dims;

  if (dims.length === 2) {
    return normalizeMap(source, dims[1], dims[0], (x, y) => y * dims[1] + x);
  }

  if (dims.length === 3 && dims[0] === 1) {
    return normalizeMap(source, dims[2], dims[1], (x, y) => y * dims[2] + x);
  }

  if (dims.length === 4 && dims[0] === 1 && dims[1] >= 1 && dims[1] <= 4) {
    return normalizeMap(source, dims[3], dims[2], (x, y) => y * dims[3] + x);
  }

  if (dims.length === 4 && dims[0] === 1 && dims[3] >= 1 && dims[3] <= 4) {
    return normalizeMap(
      source,
      dims[2],
      dims[1],
      (x, y) => (y * dims[2] + x) * dims[3],
    );
  }

  throw new Error(
    `Unsupported text detector output shape. Expected probability map, found [${dims.join(",")}].`,
  );
}

function normalizeMap(
  source: Float32Array | Uint8Array | Int32Array,
  width: number,
  height: number,
  indexAt: (x: number, y: number) => number,
): ProbabilityMap {
  const data = new Float32Array(width * height);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = source[indexAt(x, y)];
      min = Math.min(min, value);
      max = Math.max(max, value);
      data[y * width + x] = value;
    }
  }

  for (let i = 0; i < data.length; i++) {
    data[i] = normalizeProbability(data[i], min, max);
  }

  return { data, width, height };
}

function normalizeMapIfNeeded(
  source: Float32Array | Uint8Array | Int32Array,
  width: number,
  height: number,
  indexAt: (x: number, y: number) => number,
): ProbabilityMap {
  const data = new Float32Array(width * height);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = Number(source[indexAt(x, y)]);
      min = Math.min(min, value);
      max = Math.max(max, value);
      data[y * width + x] = value;
    }
  }

  if (min >= 0 && max <= 1.5) {
    return { data, width, height };
  }

  for (let i = 0; i < data.length; i++) {
    data[i] = normalizeProbability(data[i], min, max);
  }

  return { data, width, height };
}

function probabilityMapToBoxes(
  map: ProbabilityMap,
  sourceWidth: number,
  sourceHeight: number,
  config: DetectorConfig,
): TextBox[] {
  const visited = new Uint8Array(map.width * map.height);
  const boxes: TextBox[] = [];
  const scaleX = sourceWidth / map.width;
  const scaleY = sourceHeight / map.height;

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const index = y * map.width + x;
      if (visited[index] || map.data[index] < config.thresh) continue;

      const component = collectComponent(map, visited, x, y, config.thresh);
      if (component.area < MIN_TEXT_AREA) continue;

      const score = component.scoreSum / component.area;
      if (score < config.boxThresh) continue;

      const rawBox = expandBox(
        {
          x: component.minX * scaleX,
          y: component.minY * scaleY,
          width: (component.maxX - component.minX + 1) * scaleX,
          height: (component.maxY - component.minY + 1) * scaleY,
        },
        Math.max(scaleX, scaleY) * 0.15,
        sourceWidth,
        sourceHeight,
      );

      boxes.push({
        x: rawBox.x,
        y: rawBox.y,
        width: rawBox.width,
        height: rawBox.height,
        score,
      });
    }
  }

  return sortBoxes(
    boxes
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, config.maxCandidates),
  );
}

function collectComponent(
  map: ProbabilityMap,
  visited: Uint8Array,
  startX: number,
  startY: number,
  threshold: number,
) {
  const stack: Array<[number, number]> = [[startX, startY]];
  let minX = startX;
  let maxX = startX;
  let minY = startY;
  let maxY = startY;
  let area = 0;
  let scoreSum = 0;

  while (stack.length > 0) {
    const [x, y] = stack.pop() as [number, number];
    const index = y * map.width + x;

    if (visited[index] || map.data[index] < threshold) continue;

    visited[index] = 1;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    area += 1;
    scoreSum += map.data[index];

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;

        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;

        const nextIndex = ny * map.width + nx;
        if (!visited[nextIndex] && map.data[nextIndex] >= threshold) {
          stack.push([nx, ny]);
        }
      }
    }
  }

  return { minX, maxX, minY, maxY, area, scoreSum };
}

function sortBoxes(boxes: TextBox[]) {
  return boxes
    .filter((box) => box.width >= 2 && box.height >= 2)
    .sort((a, b) => {
      if (a.y === b.y) return a.x - b.x;
      return a.y - b.y;
    });
}

function augmentWithFooterFallback(image: RawImage, boxes: TextBox[]) {
  const hasLowerBoxes = boxes.some(
    (box) => box.y + box.height >= image.height * 0.72,
  );

  if (hasLowerBoxes || boxes.length >= 4) {
    return boxes;
  }

  const fallback = detectFooterTextBands(image);
  if (fallback.length === 0) {
    return boxes;
  }

  return sortBoxes([...boxes, ...fallback]);
}

function detectFooterTextBands(image: RawImage): TextBox[] {
  const { width, height, data } = image;
  const startY = Math.floor(height * 0.58);
  const minRowScore = Math.max(10, Math.round(width * 0.012));
  const boxes: TextBox[] = [];

  let runStart = -1;
  let runMinX = width;
  let runMaxX = -1;

  for (let y = startY; y < height; y++) {
    let rowScore = 0;
    let rowMinX = width;
    let rowMaxX = -1;

    for (let x = 1; x < width - 1; x++) {
      const index = (y * width + x) * 4;
      const center = lumaAt(data, index);
      const gradient = Math.max(
        Math.abs(center - lumaAt(data, index - 4)),
        Math.abs(center - lumaAt(data, index + 4)),
        Math.abs(center - lumaAt(data, index - width * 4)),
      );

      if (gradient < 18) continue;

      rowScore += 1;
      rowMinX = Math.min(rowMinX, x);
      rowMaxX = Math.max(rowMaxX, x);
    }

    if (rowScore >= minRowScore && rowMaxX > rowMinX) {
      if (runStart < 0) {
        runStart = y;
      }
      runMinX = Math.min(runMinX, rowMinX);
      runMaxX = Math.max(runMaxX, rowMaxX);
      continue;
    }

    if (runStart >= 0) {
      pushFooterBox(boxes, image, runStart, y - 1, runMinX, runMaxX);
      runStart = -1;
      runMinX = width;
      runMaxX = -1;
    }
  }

  if (runStart >= 0) {
    pushFooterBox(boxes, image, runStart, height - 1, runMinX, runMaxX);
  }

  return boxes;
}

function pushFooterBox(
  boxes: TextBox[],
  image: RawImage,
  y1: number,
  y2: number,
  minX: number,
  maxX: number,
) {
  const width = maxX - minX + 1;
  const height = y2 - y1 + 1;

  if (width < 18 || height < 4) {
    return;
  }

  const expanded = expandBox(
    {
      x: minX,
      y: y1,
      width,
      height,
    },
    10,
    image.width,
    image.height,
  );

  boxes.push({
    x: expanded.x,
    y: expanded.y,
    width: expanded.width,
    height: expanded.height,
    score: 0.45,
  });
}

function expandBox(
  box: { x: number; y: number; width: number; height: number },
  padding: number,
  imageWidth: number,
  imageHeight: number,
) {
  const x = clamp(Math.floor(box.x - padding), 0, imageWidth - 1);
  const y = clamp(Math.floor(box.y - padding), 0, imageHeight - 1);
  const right = clamp(
    Math.ceil(box.x + box.width + padding),
    0,
    imageWidth - 1,
  );
  const bottom = clamp(
    Math.ceil(box.y + box.height + padding),
    0,
    imageHeight - 1,
  );

  return {
    x,
    y,
    width: Math.max(1, right - x + 1),
    height: Math.max(1, bottom - y + 1),
  };
}

function lumaAt(data: Uint8Array, index: number) {
  return (
    data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function createTemporaryBoxes(image: RawImage): TextBox[] {
  return [
    {
      x: Math.round(image.width * 0.25),
      y: Math.round(image.height * 0.4),
      width: Math.round(image.width * 0.5),
      height: Math.round(image.height * 0.12),
      score: 1,
    },
  ];
}

function fitWithinSizeMultiple(
  width: number,
  height: number,
  maxSize: number,
  multiple: number,
) {
  const scale = Math.min(1, maxSize / Math.max(width, height));
  return {
    width: Math.max(
      multiple,
      Math.round((width * scale) / multiple) * multiple,
    ),
    height: Math.max(
      multiple,
      Math.round((height * scale) / multiple) * multiple,
    ),
  };
}

function normalizeProbability(value: number, min: number, max: number) {
  if (max <= min) return 0;

  // If values already look like probabilities in [0,1], keep them.
  if (min >= 0 && max <= 1) return value;

  // If values are in 0..255 (uint8), scale down.
  if (min >= 0 && max <= 255) return value / 255;

  // As a fallback, perform min-max normalization.
  return (value - min) / (max - min);
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

function isDimension(actual: number | string | undefined, expected: number) {
  return actual === expected || typeof actual === "string";
}

function isTensorMetadata(metadata: unknown): metadata is TensorMetadata {
  return Boolean(
    metadata &&
    typeof metadata === "object" &&
    "isTensor" in metadata &&
    metadata.isTensor,
  );
}

function formatMetadata(metadata: TensorMetadata) {
  const shape = metadata.shape
    ? `[${metadata.shape.join(",")}]`
    : "unknown-shape";
  return `${metadata.name}:${metadata.type ?? "unknown"}:${shape}`;
}
