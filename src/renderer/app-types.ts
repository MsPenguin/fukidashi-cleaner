import type { TextBox } from "../shared/image-types";

export type ImageItem = {
  id: string;
  name: string;
  path?: string;
  url: string;
  outputPath?: string;
};

export type ProgressUpdate = {
  stage: string;
  current: number;
  total: number;
  message: string;
  boxes?: TextBox[];
};

export type OutputSettings = {
  directory: string;
  prefix: string;
  postfix: string;
};
