import path from "node:path";
import { app, BrowserWindow } from "electron";
import { registerImageIpc } from "./ipc/image-ipc";
import fs from "node:fs";

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

app.whenReady().then(() => {
  registerImageIpc();

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
  const built = path.join(app.getAppPath(), "dist/renderer/index.html");

  if (fs.existsSync(built)) {
    console.log("Loading built renderer:", built);
    void win.loadFile(built);
  } else {
    // In dev, Vite will serve at localhost:5173 by default. Try loading it.
    const devUrl = "http://localhost:5173";
    console.log("Built renderer not found, loading dev server:", devUrl);
    void win.loadURL(devUrl);
  }
  // Open DevTools to help debug renderer issues (thumbnails, assets, console).
  win.webContents.openDevTools({ mode: "right" });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
