import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";

export async function writePngLossless(params: {
  outputPath: string;
  data: Uint8Array;
  width: number;
  height: number;
  channels: 4;
}) {
  const { outputPath, data, width, height, channels } = params;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await sharp(data, {
    raw: {
      width,
      height,
      channels,
    },
    limitInputPixels: false,
  })
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
    })
    .toFile(outputPath);

  return outputPath;
}
