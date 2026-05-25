import { dialog, ipcMain } from "electron";
import type { RemoveTextInput } from "../../shared/image-types";
import {
  runTextlessPipeline,
  type PipelineProgress,
} from "../image/pipeline/run-textless-pipeline";

export function registerImageIpc() {
  ipcMain.handle("image:select-file", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "webp", "tif", "tiff"],
        },
      ],
    });

    if (result.canceled) {
      return null;
    }

    return result.filePaths[0] ?? null;
  });

  ipcMain.handle("image:select-files", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "webp", "tif", "tiff"],
        },
      ],
    });

    if (result.canceled) return null;
    return result.filePaths ?? null;
  });

  ipcMain.handle(
    "image:remove-text",
    async (event, payload: RemoveTextInput) => {
      if (!payload?.inputPath) {
        throw new Error("inputPath is required.");
      }

      const sendProgress = (progress: PipelineProgress) => {
        event.sender.send("image:remove-text-progress", progress);
      };

      return runTextlessPipeline(payload, sendProgress);
    },
  );
}
