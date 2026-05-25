export type LamaBucket = {
  name: string;
  size: 2048 | 3072 | 4096;
  fileName: string;
};

export const LAMA_BUCKETS: LamaBucket[] = [
  {
    name: "lama-2048",
    size: 2048,
    fileName: "lama-2048.onnx",
  },
  {
    name: "lama-3072",
    size: 3072,
    fileName: "lama-3072.onnx",
  },
  {
    name: "lama-4096",
    size: 4096,
    fileName: "lama-4096.onnx",
  },
];

export function chooseLamaBucket(params: {
  width: number;
  height: number;
  allowLargeBucket: boolean;
}): LamaBucket | null {
  const required = Math.max(params.width, params.height);

  if (required <= 2048) {
    return LAMA_BUCKETS[0];
  }

  if (required <= 3072 && params.allowLargeBucket) {
    return LAMA_BUCKETS[1];
  }

  if (required <= 4096 && params.allowLargeBucket) {
    return LAMA_BUCKETS[2];
  }

  return null;
}
