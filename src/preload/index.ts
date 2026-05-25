import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { RemoveTextInput, RemoveTextResult } from "../shared/image-types";

function toFileUrl(p: string) {
  let s = p.replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(s)) s = "/" + s;
  return `file://${encodeURI(s)}`;
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

  removeText(payload: RemoveTextInput): Promise<RemoveTextResult> {
    return ipcRenderer.invoke("image:remove-text", payload);
  },

  resolveToFileUrl(p: string) {
    return toFileUrl(p);
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
});
