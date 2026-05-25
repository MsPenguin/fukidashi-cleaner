export function assertNoPixelChangeOutsideMask(params: {
  source: Uint8Array;
  output: Uint8Array;
  editableMask: Uint8Array;
}) {
  const { source, output, editableMask } = params;

  let changedPixelCount = 0;

  for (let i = 0; i < editableMask.length; i++) {
    if (editableMask[i] !== 0) continue;

    const base = i * 4;

    if (
      source[base] !== output[base] ||
      source[base + 1] !== output[base + 1] ||
      source[base + 2] !== output[base + 2] ||
      source[base + 3] !== output[base + 3]
    ) {
      changedPixelCount++;

      throw new Error(`Pixel changed outside editable mask at index=${i}`);
    }
  }

  return changedPixelCount;
}
