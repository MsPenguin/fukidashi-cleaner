import type { Box } from "../../../shared/image-types";

export function compositePatchOnlyInsideMask(params: {
  source: Uint8Array;
  output: Uint8Array;
  patch: Uint8Array;
  editableMask: Uint8Array;
  imageWidth: number;
  cropBox: Box;
}) {
  const { source, output, patch, editableMask, imageWidth, cropBox } = params;

  for (let y = 0; y < cropBox.height; y++) {
    for (let x = 0; x < cropBox.width; x++) {
      const globalX = cropBox.x + x;
      const globalY = cropBox.y + y;

      const globalPixelIndex = globalY * imageWidth + globalX;

      if (editableMask[globalPixelIndex] === 0) {
        continue;
      }

      const globalBase = globalPixelIndex * 4;
      const patchBase = (y * cropBox.width + x) * 4;

      output[globalBase] = patch[patchBase];
      output[globalBase + 1] = patch[patchBase + 1];
      output[globalBase + 2] = patch[patchBase + 2];

      // alpha는 원본 유지
      output[globalBase + 3] = source[globalBase + 3];
    }
  }
}
