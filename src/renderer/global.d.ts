// src/renderer/global.d.ts

import type {
  RemoveTextInput,
  RemoveTextResult,
  RemoveTextWorkerState,
} from "../shared/image-types";

declare global {
  interface Window {
    imageAgent: {
      selectFile: () => Promise<string | null>;
      selectFiles: () => Promise<string[] | null>;
      selectOutputDirectory: () => Promise<string | null>;
      removeText(payload: RemoveTextInput): Promise<RemoveTextResult>;
      cancelRemoveText: () => Promise<boolean>;
      openPath: (targetPath: string) => Promise<boolean>;
      showItemInFolder(path: string): Promise<boolean>;
      openOutputDirectory: (maybePath?: string) => Promise<boolean>;
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
      onRemoveTextState: (
        callback: (state: RemoveTextWorkerState) => void,
      ) => () => void;
    };
  }
}

export {};
