import sharp from "sharp";

const MAX_INPUT_SIDE = 4096;
const MAX_INPUT_PIXELS = MAX_INPUT_SIDE * MAX_INPUT_SIDE;

export type CanonicalImage = {
  width: number;
  height: number;
  channels: 4;
  data: Uint8Array;
  sourcePath: string;
};

export async function decodeToCanonicalRgba(
  inputPath: string,
): Promise<CanonicalImage> {
  const image = sharp(inputPath, {
    failOn: "error",
    limitInputPixels: false,
  })
    .rotate()
    .ensureAlpha();

  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Invalid image dimensions.");
  }

  if (
    metadata.width > MAX_INPUT_SIDE ||
    metadata.height > MAX_INPUT_SIDE ||
    metadata.width * metadata.height > MAX_INPUT_PIXELS
  ) {
    throw new Error(
      `Image is too large. Max supported size is ${MAX_INPUT_SIDE}x${MAX_INPUT_SIDE}. Found ${metadata.width}x${metadata.height}.`,
    );
  }

  const buffer = await image.raw().toBuffer();

  return {
    width: metadata.width,
    height: metadata.height,
    channels: 4,
    data: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    sourcePath: inputPath,
  };
}
