export type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type TextBox = Box & {
  score?: number;
  polygon?: Point[];
};

export type TextRegion = {
  polygon?: Point[];
  bbox: Box;
  score: number;
};

export type RemoveTextInput = {
  inputPath: string;
  outputPath?: string;
  outputDirectory?: string;
  outputPrefix?: string;
  outputPostfix?: string;
  allowLargeBucket?: boolean;
};

export type RemoveTextResult = {
  outputPath: string;
  width: number;
  height: number;
  changedPixelCount: number;
  regions: TextRegion[];
};

export type RemoveTextWorkerState = {
  state: "queued" | "running" | "completed" | "error" | "cancelled";
  message: string;
  waitingJobs: number;
  inputName: string;
  outputPath?: string;
  error?: string;
};
