// src/main/image/pipeline/runTextlessPipeline.ts

import path from "node:path";
import type {
  RemoveTextInput,
  RemoveTextResult,
  TextRegion,
  TextBox,
} from "../../../shared/image-types";
import { decodeToCanonicalRgba } from "../io/image-input-adapter";
import { writePngLossless } from "../io/output-writer";
import { cropMask, cropRgba } from "../region/crop";
import { inpaintWithLama } from "../inpaint/lama-onnx-inpainter";
import { chooseLamaBucket } from "../inpaint/bucket-selector";
import { compositePatchOnlyInsideMask } from "../compose/masked-compositor";
import { assertNoPixelChangeOutsideMask } from "../compose/pixel-equality-verifier";
import { detectTextBoxes } from "../../services/text-detector";

export type PipelineProgress = {
  stage:
    | "decode"
    | "detect"
    | "mask"
    | "inpaint"
    | "composite"
    | "save"
    | "done";
  current: number;
  total: number;
  message: string;
  boxes?: TextBox[];
};

type ProgressReporter = (progress: PipelineProgress) => void;

export async function runTextlessPipeline(
  input: RemoveTextInput,
  onProgress?: ProgressReporter,
  options?: {
    defaultOutputDirectory?: string;
  },
): Promise<RemoveTextResult> {
  const reportProgress = (progress: PipelineProgress) => {
    onProgress?.(progress);
  };
  reportProgress({
    stage: "decode",
    current: 0,
    total: 100,
    message: "이미지를 불러오는 중...",
  });

  const image = await decodeToCanonicalRgba(input.inputPath);

  const sourceBuffer = image.data;
  const outputBuffer = new Uint8Array(sourceBuffer);

  reportProgress({
    stage: "detect",
    current: 15,
    total: 100,
    message: "문자 영역을 찾는 중...",
  });

  const detectedBoxes = await detectTextBoxes(image);
  console.log(`detectTextBoxes -> found ${detectedBoxes.length} boxes`);
  for (const [i, b] of detectedBoxes.entries()) {
    console.log(
      `box[${i}] = x=${Math.round(b.x)} y=${Math.round(b.y)} w=${Math.round(b.width)} h=${Math.round(b.height)} score=${(b.score || 0).toFixed(2)}`,
    );
  }

  // Inform renderer about detected boxes so it can draw overlays.
  reportProgress({
    stage: "detect",
    current: 15,
    total: 100,
    message: "문자 영역을 찾는 중...",
    boxes: detectedBoxes,
  });

  const regions = detectedBoxes.map((box) => ({
    bbox: box as TextRegion["bbox"],
    score: box.score ?? 1,
    polygon: box.polygon,
  }));

  if (regions.length === 0) {
    reportProgress({
      stage: "done",
      current: 100,
      total: 100,
      message: "검출된 문자가 없어 원본을 저장합니다.",
    });

    const outputPath = resolveOutputPath(
      input,
      options?.defaultOutputDirectory,
    );

    await writePngLossless({
      outputPath,
      data: outputBuffer,
      width: image.width,
      height: image.height,
      channels: 4,
    });

    return {
      outputPath,
      width: image.width,
      height: image.height,
      changedPixelCount: 0,
      regions: [],
    };
  }

  reportProgress({
    stage: "mask",
    current: 25,
    total: 100,
    message: "편집 가능한 마스크를 만드는 중...",
  });

  const editableMask = buildEditableMaskStub({
    width: image.width,
    height: image.height,
    regions,
  });

  // Use a single conservative context padding to ensure high-quality, lossless
  // inpainting around text regions. We no longer offer `fast`/`quality` modes.
  const inpaintRegions = planInpaintRegionsStub({
    width: image.width,
    height: image.height,
    regions,
    contextPadding: 256,
    allowLargeBucket: input.allowLargeBucket ?? true,
  });

  const totalRegions = inpaintRegions.length;

  for (const [index, region] of inpaintRegions.entries()) {
    reportProgress({
      stage: "inpaint",
      current: 25 + Math.round((index / Math.max(totalRegions, 1)) * 55),
      total: 100,
      message: `문자 제거 중... (${index + 1}/${totalRegions})`,
    });

    const crop = {
      width: region.width,
      height: region.height,
      data: cropRgba({
        source: sourceBuffer,
        imageWidth: image.width,
        cropBox: region,
      }),
    };

    const regionMask = cropMask({
      mask: editableMask,
      imageWidth: image.width,
      cropBox: region,
    });

    let patch: Uint8Array;
    try {
      patch = await inpaintWithLama({
        crop,
        cropMask: regionMask,
        allowLargeBucket: input.allowLargeBucket ?? true,
      });
    } catch (error) {
      console.warn("LaMa inpaint failed, using fallback fill.", error);
      patch = fallbackInpaintCrop(crop, regionMask);
    }

    compositePatchOnlyInsideMask({
      source: sourceBuffer,
      output: outputBuffer,
      patch,
      editableMask,
      imageWidth: image.width,
      cropBox: region,
    });
  }

  reportProgress({
    stage: "composite",
    current: 90,
    total: 100,
    message: "결과를 합성하는 중...",
  });

  assertNoPixelChangeOutsideMask({
    source: sourceBuffer,
    output: outputBuffer,
    editableMask,
  });

  reportProgress({
    stage: "save",
    current: 95,
    total: 100,
    message: "파일로 저장하는 중...",
  });

  const outputPath = resolveOutputPath(input, options?.defaultOutputDirectory);

  await writePngLossless({
    outputPath,
    data: outputBuffer,
    width: image.width,
    height: image.height,
    channels: 4,
  });

  return {
    outputPath,
    width: image.width,
    height: image.height,
    changedPixelCount: countMaskPixels(editableMask),
    regions,
  };
}

function resolveOutputPath(
  input: RemoveTextInput,
  defaultOutputDirectory?: string,
) {
  if (input.outputPath) {
    return input.outputPath;
  }

  const outputDirectory =
    input.outputDirectory ??
    defaultOutputDirectory ??
    path.join(process.cwd(), "outputs");
  const sourceName = path.parse(input.inputPath).name;
  const prefix = sanitizeFileNamePart(input.outputPrefix ?? "");
  const postfix = sanitizeFileNamePart(input.outputPostfix ?? "");

  return path.join(outputDirectory, `${prefix}${sourceName}${postfix}.png`);
}

function sanitizeFileNamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_");
}

function buildEditableMaskStub(params: {
  width: number;
  height: number;
  regions: TextRegion[];
}) {
  const { width, height, regions } = params;
  const mask = new Uint8Array(width * height);

  const dilation = 12;

  for (const region of regions) {
    const x1 = clamp(region.bbox.x - dilation, 0, width - 1);
    const y1 = clamp(region.bbox.y - dilation, 0, height - 1);
    const x2 = clamp(
      region.bbox.x + region.bbox.width + dilation,
      0,
      width - 1,
    );
    const y2 = clamp(
      region.bbox.y + region.bbox.height + dilation,
      0,
      height - 1,
    );

    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        mask[y * width + x] = 255;
      }
    }
  }

  return mask;
}

function planInpaintRegionsStub(params: {
  width: number;
  height: number;
  regions: TextRegion[];
  contextPadding: number;
  allowLargeBucket: boolean;
}) {
  const { width, height, regions, contextPadding, allowLargeBucket } = params;

  const planned = regions.map((region) => {
    const x1 = clamp(region.bbox.x - contextPadding, 0, width - 1);
    const y1 = clamp(region.bbox.y - contextPadding, 0, height - 1);
    const x2 = clamp(
      region.bbox.x + region.bbox.width + contextPadding,
      0,
      width - 1,
    );
    const y2 = clamp(
      region.bbox.y + region.bbox.height + contextPadding,
      0,
      height - 1,
    );

    return {
      x: x1,
      y: y1,
      width: x2 - x1 + 1,
      height: y2 - y1 + 1,
    };
  });

  return mergeInpaintRegions(planned, allowLargeBucket);
}

type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function mergeInpaintRegions(
  regions: CropBox[],
  allowLargeBucket: boolean,
): CropBox[] {
  const pending = [...regions].sort((a, b) => {
    if (a.y === b.y) return a.x - b.x;
    return a.y - b.y;
  });
  const merged: CropBox[] = [];

  while (pending.length > 0) {
    let current = pending.shift() as CropBox;
    let changed = true;

    while (changed) {
      changed = false;

      for (let index = 0; index < pending.length; index++) {
        const candidate = pending[index];
        if (!boxesOverlap(current, candidate)) {
          continue;
        }

        const combined = unionBox(current, candidate);
        const currentBucket = chooseLamaBucket({
          width: current.width,
          height: current.height,
          allowLargeBucket,
        });
        const candidateBucket = chooseLamaBucket({
          width: candidate.width,
          height: candidate.height,
          allowLargeBucket,
        });
        const combinedBucket = chooseLamaBucket({
          width: combined.width,
          height: combined.height,
          allowLargeBucket,
        });

        if (
          !currentBucket ||
          !candidateBucket ||
          !combinedBucket ||
          combinedBucket.size >
            Math.max(currentBucket.size, candidateBucket.size)
        ) {
          continue;
        }

        current = combined;
        pending.splice(index, 1);
        changed = true;
        break;
      }
    }

    merged.push(current);
  }

  return merged;
}

function boxesOverlap(a: CropBox, b: CropBox) {
  const aRight = a.x + a.width - 1;
  const bRight = b.x + b.width - 1;
  const aBottom = a.y + a.height - 1;
  const bBottom = b.y + b.height - 1;

  return !(aRight < b.x || bRight < a.x || aBottom < b.y || bBottom < a.y);
}

function unionBox(a: CropBox, b: CropBox): CropBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width - 1, b.x + b.width - 1);
  const bottom = Math.max(a.y + a.height - 1, b.y + b.height - 1);

  return {
    x,
    y,
    width: right - x + 1,
    height: bottom - y + 1,
  };
}

function countMaskPixels(mask: Uint8Array) {
  let count = 0;

  for (const value of mask) {
    if (value !== 0) count++;
  }

  return count;
}

function fallbackInpaintCrop(
  crop: { data: Uint8Array; width: number; height: number },
  cropMask: Uint8Array,
) {
  const output = new Uint8Array(crop.data);
  const average = computeBackgroundAverage(crop.data, cropMask);

  for (let y = 0; y < crop.height; y++) {
    for (let x = 0; x < crop.width; x++) {
      const maskIndex = y * crop.width + x;
      if (cropMask[maskIndex] === 0) continue;

      const base = maskIndex * 4;
      output[base] = average[0];
      output[base + 1] = average[1];
      output[base + 2] = average[2];
      output[base + 3] = crop.data[base + 3];
    }
  }

  return output;
}

function computeBackgroundAverage(data: Uint8Array, mask: Uint8Array) {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 0) continue;

    const base = i * 4;
    sumR += data[base];
    sumG += data[base + 1];
    sumB += data[base + 2];
    count += 1;
  }

  if (count === 0) {
    return [0, 0, 0] as const;
  }

  return [
    Math.round(sumR / count),
    Math.round(sumG / count),
    Math.round(sumB / count),
  ] as const;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
