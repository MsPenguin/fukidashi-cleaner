// src/renderer/global.d.ts

import type { RemoveTextInput, RemoveTextResult } from "../shared/image-types";

declare global {
  interface Window {
    imageAgent: {
      selectFile: () => Promise<string | null>;
      selectFiles: () => Promise<string[] | null>;
      removeText(payload: RemoveTextInput): Promise<RemoveTextResult>;
      resolveToFileUrl?: (p: string) => string;
      getPathForFile: (file: File) => string;
      onRemoveTextProgress: (
        callback: (progress: {
          stage: string;
          current: number;
          total: number;
          message: string;
        }) => void,
      ) => () => void;
    };
  }
}

export {};
