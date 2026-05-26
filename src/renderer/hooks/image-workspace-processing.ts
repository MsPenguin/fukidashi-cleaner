import type { MutableRefObject } from "react";
import type { ImageItem, OutputSettings, ProgressUpdate } from "../app-types";
import { isAbsoluteFilePath } from "../image-item-utils";
import type { ImageWorkspaceAction } from "./image-workspace-reducer";

const STARTING_PROGRESS: ProgressUpdate = {
  stage: "decode",
  current: 0,
  total: 100,
  message: "작업을 시작하는 중...",
};

type ProcessImageItemsOptions = {
  items: ImageItem[];
  outputSettings: OutputSettings;
  cancelRequestedRef: MutableRefObject<boolean>;
  dispatch: (action: ImageWorkspaceAction) => void;
};

export async function processImageItems({
  items,
  outputSettings,
  cancelRequestedRef,
  dispatch,
}: ProcessImageItemsOptions) {
  const processableItems = items.filter(
    (item) => item.path && isAbsoluteFilePath(item.path),
  );

  if (processableItems.length === 0) {
    console.warn("No processable items with absolute file paths.");
    return;
  }

  dispatch({
    type: "processing/started",
    progress: STARTING_PROGRESS,
  });
  cancelRequestedRef.current = false;

  for (const item of processableItems) {
    if (cancelRequestedRef.current) {
      break;
    }

    dispatch({
      type: "processing/activeFileChanged",
      fileName: item.name,
    });

    try {
      if (!item.path) {
        console.warn(`Skipping item without valid path: ${item.name}`);
        continue;
      }

      const result = await window.imageAgent.removeText({
        inputPath: item.path,
        outputDirectory: outputSettings.directory || undefined,
        outputPrefix: outputSettings.prefix || undefined,
        outputPostfix: outputSettings.postfix || undefined,
      });

      dispatch({
        type: "processing/itemCompleted",
        itemId: item.id,
        outputPath: result.outputPath,
      });
    } catch (error) {
      console.error(`Failed processing ${item.name}`, error);
      if (cancelRequestedRef.current) {
        break;
      }
    }
  }

  dispatch({ type: "processing/finished" });
}
