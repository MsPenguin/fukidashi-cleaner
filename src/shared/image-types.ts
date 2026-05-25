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
  allowLargeBucket?: boolean;
};

export type RemoveTextResult = {
  outputPath: string;
  width: number;
  height: number;
  changedPixelCount: number;
  regions: TextRegion[];
};
