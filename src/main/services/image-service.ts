import sharp from "sharp";

export type RawImage = {
  data: Uint8Array;
  width: number;
  height: number;
  channels: number;
};

export async function loadImageAsRaw(inputPath: string): Promise<RawImage> {
  const image = sharp(inputPath).ensureAlpha();
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Invalid image metadata");
  }

  const data = await image.raw().toBuffer();

  return {
    data,
    width: metadata.width,
    height: metadata.height,
    channels: 4,
  };
}

export async function saveRawRgbaImage(
  outputPath: string,
  image: RawImage,
): Promise<string> {
  await sharp(image.data, {
    raw: {
      width: image.width,
      height: image.height,
      channels: image.channels as 1 | 2 | 3 | 4,
    },
  })
    .png()
    .toFile(outputPath);

  return outputPath;
}

export async function saveMaskPng(
  outputPath: string,
  mask: Uint8Array,
  width: number,
  height: number,
): Promise<string> {
  await sharp(mask, {
    raw: {
      width,
      height,
      channels: 1,
    },
  })
    .png()
    .toFile(outputPath);

  return outputPath;
}

export async function resizeRawRgbaImage(
  image: RawImage,
  width: number,
  height: number,
): Promise<RawImage> {
  const data = await sharp(image.data, {
    raw: {
      width: image.width,
      height: image.height,
      channels: image.channels as 1 | 2 | 3 | 4,
    },
  })
    .ensureAlpha()
    .resize(width, height, { fit: "fill" })
    .raw()
    .toBuffer();

  return {
    data,
    width,
    height,
    channels: 4,
  };
}

export async function resizeMask(
  mask: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Promise<Uint8Array> {
  const data = await sharp(mask, {
    raw: {
      width: sourceWidth,
      height: sourceHeight,
      channels: 1,
    },
  })
    .resize(targetWidth, targetHeight, {
      fit: "fill",
      kernel: "nearest",
    })
    .threshold(1)
    .raw()
    .toBuffer();

  return new Uint8Array(data);
}
