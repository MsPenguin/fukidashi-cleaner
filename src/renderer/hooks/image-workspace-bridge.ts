import type { ImageItem } from "../app-types";
import { createPreviewItemFromPath } from "../image-item-utils";
import { toFileUrlFromPath } from "../utils";

export async function selectImageItemsFromDialog(): Promise<ImageItem[]> {
  const selectedFiles = await window.imageAgent.selectFiles();
  return selectedFiles?.map(createPreviewItemFromPath) ?? [];
}

export function hydrateImageItemPreviews(
  items: ImageItem[],
  onResolved: (itemId: string, url: string) => void,
) {
  for (const item of items) {
    if (!item.path) {
      continue;
    }

    void loadPreviewForItem(item, onResolved);
  }
}

export async function loadPreviewUrl(filePath: string) {
  const reader = window.imageAgent.readImageAsDataUrl;
  return typeof reader === "function"
    ? await reader(filePath)
    : toFileUrlFromPath(filePath);
}

export async function selectOutputDirectory() {
  return await window.imageAgent.selectOutputDirectory();
}

export function isOutputDirectoryBridgeReady() {
  return typeof window.imageAgent.openOutputDirectory === "function";
}

export async function openOutputDirectory(
  targetPath: string | null | undefined,
  outputDirectory: string | undefined,
) {
  console.debug("handleOpenOutput -> targetPath:", targetPath);

  if (!isOutputDirectoryBridgeReady()) {
    console.warn(
      "imageAgent.openOutputDirectory is unavailable. Restart the Electron app so the latest preload bundle loads.",
    );
    return;
  }

  try {
    if (targetPath) {
      await window.imageAgent.openOutputDirectory(targetPath);
      return;
    }

    await window.imageAgent.openOutputDirectory(outputDirectory || undefined);
  } catch (error) {
    console.error("openOutputDirectory failed:", error);
  }
}

async function loadPreviewForItem(
  item: ImageItem,
  onResolved: (itemId: string, url: string) => void,
) {
  const filePath = item.path;
  if (!filePath) {
    return;
  }

  try {
    const url = await loadPreviewUrl(filePath);
    onResolved(item.id, url);
  } catch (error) {
    console.warn(`Failed to load preview for ${item.name}`, error);
    onResolved(item.id, toFileUrlFromPath(filePath));
  }
}
