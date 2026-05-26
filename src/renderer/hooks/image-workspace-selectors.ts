import type { RemoveTextWorkerState } from "../../shared/image-types";
import type { ImageItem, OutputSettings } from "../app-types";
import { getBaseName } from "../image-item-utils";

export function getSelectedImageItem(
  items: ImageItem[],
  selectedIndex: number | null,
) {
  return selectedIndex !== null ? items[selectedIndex] ?? null : null;
}

export function getQueueCount(workerState: RemoveTextWorkerState | null) {
  return workerState?.waitingJobs ?? 0;
}

export function getWorkerStatusMessage(
  workerState: RemoveTextWorkerState | null,
) {
  if (!workerState) {
    return null;
  }

  const waitingSuffix =
    workerState.state === "queued" && workerState.waitingJobs > 0
      ? ` · 앞에 ${workerState.waitingJobs}개 대기`
      : "";

  return `${workerState.message}${waitingSuffix}`;
}

export function getOutputPreviewName(
  outputSettings: OutputSettings,
  selected: ImageItem | null,
) {
  const baseName = selected?.path ? getBaseName(selected.path) : "원본이름";
  return `${outputSettings.prefix}${baseName}${outputSettings.postfix}.png`;
}

export function countCompletedItems(items: ImageItem[]) {
  return items.filter((item) => Boolean(item.outputPath)).length;
}
