import path from "node:path";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { registerImageIpc } from "./ipc/image-ipc";
import fs from "node:fs";
import {
  installExtension,
  REACT_DEVELOPER_TOOLS,
} from "electron-devtools-installer";

// Configure Chromium/Electron command line switches early to reduce noisy warnings
// (disk cache/GPU issues on some Windows profiles). Use app.getPath('userData')
// for a writable cache directory and disable GPU features that trigger cache errors.
try {
  const cacheDir = path.join(app.getPath("userData"), "chromium-cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  app.commandLine.appendSwitch("disk-cache-dir", cacheDir);
} catch (err) {
  // If we cannot create the directory, continue without failing — warnings may persist.
  console.warn("Could not configure disk cache dir:", err);
}

app.commandLine.appendSwitch("use-angle", "d3d11on12");

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 920,
    minHeight: 620,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "../preload/index.js"),
    },
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  const builtHtml = path.join(__dirname, "../renderer/index.html");

  if (!app.isPackaged && devServerUrl) {
    console.log("Loading renderer from dev server:", devServerUrl);
    void win.loadURL(devServerUrl);
  } else {
    console.log("Loading built renderer:", builtHtml);
    void win.loadFile(builtHtml);
  }

  if (!app.isPackaged) {
    win.webContents.openDevTools({ mode: "right" });
  }

  return win;
}

app.whenReady().then(() => {
  installExtension([REACT_DEVELOPER_TOOLS])
    .then(([react]) => console.log(`Added Extensions:  ${react.name}`))
    .catch((err) => console.log("An error occurred: ", err));

  registerImageIpc();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("system:open-path", async (_event, targetPath: string) => {
  const errorMessage = await shell.openPath(targetPath);

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  return true;
});

ipcMain.handle("system:show-item-in-folder", (_event, targetPath: string) => {
  shell.showItemInFolder(targetPath);
  return true;
});
