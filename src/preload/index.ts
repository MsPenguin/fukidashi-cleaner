import path from "node:path";
import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  RemoveTextInput,
  RemoveTextResult,
  RemoveTextWorkerState,
} from "../shared/image-types";

function toFileUrl(p: string) {
  let s = p.replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(s)) s = "/" + s;
  return `file://${encodeURI(s)}`;
}

function getMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".bmp":
      return "image/bmp";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    default:
      return "application/octet-stream";
  }
}

// Log preload startup for diagnostics in main/renderer logs.
try {
  // eslint-disable-next-line no-console
  console.log("[preload] preload script executed. exposing imageAgent");
} catch (e) {
  // ignore
}

contextBridge.exposeInMainWorld("imageAgent", {
  selectFile(): Promise<string | null> {
    return ipcRenderer.invoke("image:select-file");
  },

  selectFiles(): Promise<string[] | null> {
    return ipcRenderer.invoke("image:select-files");
  },

  selectOutputDirectory(): Promise<string | null> {
    return ipcRenderer.invoke("image:select-output-directory");
  },

  removeText(payload: RemoveTextInput): Promise<RemoveTextResult> {
    return ipcRenderer.invoke("image:remove-text", payload);
  },

  cancelRemoveText(): Promise<boolean> {
    return ipcRenderer.invoke("image:cancel-remove-text");
  },

  openPath(targetPath: string): Promise<boolean> {
    if (!targetPath) {
      return Promise.reject(new Error("targetPath is required"));
    }
    return ipcRenderer.invoke("image:open-path", targetPath);
  },

  // Backwards-compatible alias used in some places/tests.
  showItemInFolder(path: string): Promise<boolean> {
    return this.openPath(path as unknown as string);
  },

  openOutputDirectory(maybePath?: string): Promise<boolean> {
    return ipcRenderer.invoke(
      "image:open-output-directory",
      maybePath ?? undefined,
    );
  },

  resolveToFileUrl(p: string) {
    return toFileUrl(p);
  },

  readImageAsDataUrl(filePath: string) {
    return ipcRenderer.invoke("image:read-image-as-data-url", filePath);
  },

  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  onRemoveTextProgress(
    callback: (progress: {
      stage: string;
      current: number;
      total: number;
      message: string;
    }) => void,
  ) {
    const listener = (
      _event: Electron.IpcRendererEvent,
      progress: {
        stage: string;
        current: number;
        total: number;
        message: string;
      },
    ) => {
      callback(progress);
    };

    ipcRenderer.on("image:remove-text-progress", listener);

    return () => {
      ipcRenderer.removeListener("image:remove-text-progress", listener);
    };
  },

  onRemoveTextState(callback: (state: RemoveTextWorkerState) => void) {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: RemoveTextWorkerState,
    ) => {
      callback(state);
    };

    ipcRenderer.on("image:remove-text-state", listener);

    return () => {
      ipcRenderer.removeListener("image:remove-text-state", listener);
    };
  },
});
