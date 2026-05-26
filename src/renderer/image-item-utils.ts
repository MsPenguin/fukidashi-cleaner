import type { ImageItem } from "./app-types";

export function isAbsoluteFilePath(filePath: string) {
  return (
    filePath.startsWith("/") ||
    /^[a-zA-Z]:[\\/]/.test(filePath) ||
    filePath.startsWith("\\\\")
  );
}

export function getFileNameFromPath(filePath: string) {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

export function getBaseName(filePath: string) {
  return getFileNameFromPath(filePath).replace(/\.[^.]+$/, "");
}

export function createImageItemId(seed?: string) {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${seed ?? "image"}-${Math.random().toString(36).slice(2, 10)}`;
}

export function resolveDroppedFilePath(file: File) {
  const bridgedPath = window.imageAgent.getPathForFile(file);
  if (bridgedPath && isAbsoluteFilePath(bridgedPath)) {
    return bridgedPath;
  }

  const legacyPath = (file as File & { path?: string }).path;
  return legacyPath && isAbsoluteFilePath(legacyPath) ? legacyPath : undefined;
}

export function createPreviewItemFromFile(file: File): ImageItem {
  const filePath = resolveDroppedFilePath(file);

  return {
    id: createImageItemId(file.name),
    name: file.name,
    path: filePath,
    url: URL.createObjectURL(file),
  };
}

export function createPreviewItemFromPath(filePath: string): ImageItem {
  return {
    id: createImageItemId(filePath),
    name: getFileNameFromPath(filePath),
    path: filePath,
    url: "",
  };
}
