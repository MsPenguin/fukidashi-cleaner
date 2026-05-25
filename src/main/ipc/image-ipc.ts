import { dialog, ipcMain, app } from "electron";
import path from "node:path";
import type {
  RemoveTextInput,
  RemoveTextWorkerState,
} from "../../shared/image-types";
import type { PipelineProgress } from "../image/pipeline/run-textless-pipeline";
import {
  cancelRemoveTextJobs,
  runRemoveTextInWorker,
} from "../services/remove-text-worker";

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

  ipcMain.handle("image:select-output-directory", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });

    if (result.canceled) return null;
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle("image:open-path", async (_event, targetPath: string) => {
    console.log("image:open-path invoked with:", targetPath);

    if (!targetPath) {
      console.warn("image:open-path called with empty targetPath");
      return false;
    }

    const { shell } = await import("electron");
    try {
      await shell.showItemInFolder(targetPath);
      return true;
    } catch {
      const fallbackPath = path.extname(targetPath)
        ? path.dirname(targetPath)
        : targetPath;
      const errorMessage = await shell.openPath(fallbackPath);
      if (errorMessage) {
        console.warn("Failed to open output location:", errorMessage);
        return false;
      }
    }

    return true;
  });

  ipcMain.handle(
    "image:open-output-directory",
    async (_event, maybePath?: string) => {
      const { shell } = await import("electron");

      const target = maybePath
        ? maybePath
        : path.join(app.getPath("userData"), "outputs");

      console.log("image:open-output-directory ->", target);

      try {
        // Prefer showing the item (selecting file) when a file is provided.
        await shell.showItemInFolder(target);
        return true;
      } catch (err) {
        // Fallback to opening the folder path
        const folderPath = path.extname(target) ? path.dirname(target) : target;
        const errorMessage = await shell.openPath(folderPath);
        if (errorMessage) {
          console.warn("Failed to open output directory:", errorMessage);
          return false;
        }
        return true;
      }
    },
  );

  ipcMain.handle(
    "image:remove-text",
    async (event, payload: RemoveTextInput) => {
      if (!payload?.inputPath) {
        throw new Error("inputPath is required.");
      }

      const sendProgress = (progress: PipelineProgress) => {
        event.sender.send("image:remove-text-progress", progress);
      };

      const sendState = (state: RemoveTextWorkerState) => {
        event.sender.send("image:remove-text-state", state);
      };

      return runRemoveTextInWorker({
        payload,
        defaultOutputDirectory: path.join(app.getPath("userData"), "outputs"),
        onProgress: sendProgress,
        onState: sendState,
      });
    },
  );

  ipcMain.handle("image:cancel-remove-text", async () => {
    return cancelRemoveTextJobs();
  });
}
