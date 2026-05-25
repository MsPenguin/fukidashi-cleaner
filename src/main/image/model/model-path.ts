// src/main/image/model/modelPath.ts

import path from "node:path";
import fs from "node:fs";
import { app } from "electron";

export function getResourcesRoot() {
  const localResourcesPath = path.resolve(process.cwd(), "resources");

  if (!app?.isPackaged && fs.existsSync(localResourcesPath)) {
    return localResourcesPath;
  }

  if (process.resourcesPath) {
    return process.resourcesPath;
  }

  return localResourcesPath;
}

export function getModelPath(...segments: string[]) {
  return path.join(getResourcesRoot(), "models", ...segments);
}
