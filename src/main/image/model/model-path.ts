// src/main/image/model/modelPath.ts

import path from "node:path";
import { app } from "electron";

export function getResourcesRoot() {
  return app.isPackaged
    ? process.resourcesPath
    : path.resolve(process.cwd(), "resources");
}

export function getModelPath(...segments: string[]) {
  return path.join(getResourcesRoot(), "models", ...segments);
}
