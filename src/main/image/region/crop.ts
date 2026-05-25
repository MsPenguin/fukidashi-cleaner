import type { Box } from "../../../shared/image-types";

export function cropRgba(params: {
  source: Uint8Array;
  imageWidth: number;
  cropBox: Box;
}): Uint8Array {
  const { source, imageWidth, cropBox } = params;

  const result = new Uint8Array(cropBox.width * cropBox.height * 4);

  for (let y = 0; y < cropBox.height; y++) {
    const srcStart = ((cropBox.y + y) * imageWidth + cropBox.x) * 4;
    const srcEnd = srcStart + cropBox.width * 4;
    const dstStart = y * cropBox.width * 4;

    result.set(source.subarray(srcStart, srcEnd), dstStart);
  }

  return result;
}

export function cropMask(params: {
  mask: Uint8Array;
  imageWidth: number;
  cropBox: Box;
}): Uint8Array {
  const { mask, imageWidth, cropBox } = params;

  const result = new Uint8Array(cropBox.width * cropBox.height);

  for (let y = 0; y < cropBox.height; y++) {
    const srcStart = (cropBox.y + y) * imageWidth + cropBox.x;
    const srcEnd = srcStart + cropBox.width;
    const dstStart = y * cropBox.width;

    result.set(mask.subarray(srcStart, srcEnd), dstStart);
  }

  return result;
}
