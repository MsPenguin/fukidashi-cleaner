// src/main/image/model/modelPath.ts

import path from "node:path";
import fs from "node:fs";

export function getResourcesRoot() {
  const localResourcesPath = path.resolve(process.cwd(), "resources");

  // Prefer the project's local `resources/` folder when it exists (works well during dev).
  if (fs.existsSync(localResourcesPath)) {
    const resolved = localResourcesPath;
    console.log(`[model-path] using local resources: ${resolved}`);
    return resolved;
  }

  // Fall back to Electron's resourcesPath (used in packaged apps).
  if (process.resourcesPath) {
    const resolved = process.resourcesPath;
    console.log(`[model-path] using process.resourcesPath: ${resolved}`);
    return resolved;
  }

  // As a last resort, return the local path we computed.
  console.log(
    `[model-path] falling back to local resources path: ${localResourcesPath}`,
  );
  return localResourcesPath;
}

export function getModelPath(...segments: string[]) {
  return path.join(getResourcesRoot(), "models", ...segments);
}
