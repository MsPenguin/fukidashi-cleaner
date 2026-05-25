import * as ort from "onnxruntime-node";

export type RgbaCrop = {
  data: Uint8Array;
  width: number;
  height: number;
};

export function rgbaCropToPaddedRgbTensor(
  crop: RgbaCrop,
  bucketSize: number,
): ort.Tensor {
  const planeSize = bucketSize * bucketSize;
  const tensor = new Float32Array(3 * planeSize);

  for (let y = 0; y < bucketSize; y++) {
    const sy = Math.min(y, crop.height - 1);

    for (let x = 0; x < bucketSize; x++) {
      const sx = Math.min(x, crop.width - 1);

      const srcIndex = (sy * crop.width + sx) * 4;
      const dstIndex = y * bucketSize + x;

      tensor[dstIndex] = crop.data[srcIndex] / 255;
      tensor[planeSize + dstIndex] = crop.data[srcIndex + 1] / 255;
      tensor[planeSize * 2 + dstIndex] = crop.data[srcIndex + 2] / 255;
    }
  }

  return new ort.Tensor("float32", tensor, [1, 3, bucketSize, bucketSize]);
}

export function maskToPaddedTensor(params: {
  mask: Uint8Array;
  width: number;
  height: number;
  bucketSize: number;
}): ort.Tensor {
  const { mask, width, height, bucketSize } = params;

  const tensor = new Float32Array(bucketSize * bucketSize);

  for (let y = 0; y < bucketSize; y++) {
    for (let x = 0; x < bucketSize; x++) {
      const dstIndex = y * bucketSize + x;

      if (x >= width || y >= height) {
        tensor[dstIndex] = 0;
        continue;
      }

      const srcIndex = y * width + x;
      tensor[dstIndex] = mask[srcIndex] > 0 ? 1 : 0;
    }
  }

  return new ort.Tensor("float32", tensor, [1, 1, bucketSize, bucketSize]);
}

export function lamaOutputToRgbaCrop(params: {
  output: ort.Tensor;
  width: number;
  height: number;
  bucketSize: number;
  alphaSource: Uint8Array;
}): Uint8Array {
  const { output, width, height, bucketSize, alphaSource } = params;

  const data = output.data as Float32Array;
  const result = new Uint8Array(width * height * 4);

  const planeSize = bucketSize * bucketSize;
  const scale = shouldScaleUnitRange(data) ? 255 : 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIndex = y * bucketSize + x;
      const dstIndex = (y * width + x) * 4;
      const alphaIndex = (y * width + x) * 4 + 3;

      result[dstIndex] = clampByte(data[srcIndex] * scale);
      result[dstIndex + 1] = clampByte(data[planeSize + srcIndex] * scale);
      result[dstIndex + 2] = clampByte(data[planeSize * 2 + srcIndex] * scale);

      // alpha는 LaMa 결과가 아니라 원본 crop alpha 유지
      result[dstIndex + 3] = alphaSource[alphaIndex];
    }
  }

  return result;
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function shouldScaleUnitRange(values: Float32Array) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }

  return min >= -1 && max <= 1.5;
}
