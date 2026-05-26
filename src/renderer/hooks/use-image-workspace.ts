import { useCallback, useEffect, useRef, useState } from "react";
import type { RemoveTextWorkerState } from "../../shared/image-types";
import type { ImageItem, OutputSettings, ProgressUpdate } from "../app-types";
import {
  createPreviewItemFromFile,
  createPreviewItemFromPath,
  getBaseName,
  isAbsoluteFilePath,
} from "../image-item-utils";
import { toFileUrlFromPath } from "../utils";

const DEFAULT_OUTPUT_SETTINGS: OutputSettings = {
  directory: "",
  prefix: "textless-",
  postfix: "",
};

export function useImageWorkspace() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [workerState, setWorkerState] = useState<RemoveTextWorkerState | null>(
    null,
  );
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [outputSettings, setOutputSettings] = useState<OutputSettings>(
    DEFAULT_OUTPUT_SETTINGS,
  );
  const [lastOutputPath, setLastOutputPath] = useState<string | null>(null);
  const [selectedAfterUrl, setSelectedAfterUrl] = useState<string | null>(null);
  const cancelRequestedRef = useRef(false);

  const removeItems = useCallback(
    (predicate: (item: ImageItem) => boolean) => {
      const currentItems = items;
      const removedIndices: number[] = [];

      currentItems.forEach((item, index) => {
        if (predicate(item)) {
          removedIndices.push(index);
        }
      });

      if (removedIndices.length === 0) {
        return;
      }

      const nextItems = currentItems.filter((item) => !predicate(item));
      setItems(nextItems);

      setSelectedIndex((currentSelected) =>
        resolveSelectedIndexAfterRemoval(
          currentSelected,
          removedIndices,
          currentItems.length,
          nextItems.length,
        ),
      );
    },
    [items],
  );

  useEffect(() => {
    const unsubscribeProgress = window.imageAgent.onRemoveTextProgress(
      (update) => {
        setProgress(update);
      },
    );
    const unsubscribeState = window.imageAgent.onRemoveTextState((state) => {
      setWorkerState(state);
    });

    return () => {
      unsubscribeProgress();
      unsubscribeState();
    };
  }, []);

  const handleDroppedFiles = useCallback((droppedFiles: File[]) => {
    const newItems = droppedFiles.map(createPreviewItemFromFile);

    setItems((currentItems) => [...currentItems, ...newItems]);
    setSelectedIndex((currentIndex) =>
      currentIndex === null ? 0 : currentIndex,
    );
  }, []);

  const handleSelectFiles = useCallback(async () => {
    const selectedFiles = await window.imageAgent.selectFiles();
    if (!selectedFiles?.length) return;

    const newItems = selectedFiles.map(createPreviewItemFromPath);
    setItems((currentItems) => [...currentItems, ...newItems]);
    setSelectedIndex((currentIndex) =>
      currentIndex === null ? 0 : currentIndex,
    );

    for (const item of newItems) {
      const filePath = item.path;
      if (!filePath) {
        continue;
      }

      const reader = window.imageAgent.readImageAsDataUrl;
      const loadPreview = async () => {
        try {
          const url =
            typeof reader === "function"
              ? await reader(filePath)
              : toFileUrlFromPath(filePath);

          setItems((currentItems) =>
            currentItems.map((currentItem) =>
              currentItem.id === item.id
                ? { ...currentItem, url }
                : currentItem,
            ),
          );
        } catch (error) {
          console.warn(`Failed to load preview for ${item.name}`, error);
          setItems((currentItems) =>
            currentItems.map((currentItem) =>
              currentItem.id === item.id
                ? { ...currentItem, url: toFileUrlFromPath(filePath) }
                : currentItem,
            ),
          );
        }
      };

      void loadPreview();
    }
  }, []);

  const handlePickOutputDirectory = useCallback(async () => {
    const directory = await window.imageAgent.selectOutputDirectory();
    if (!directory) return;

    setOutputSettings((currentSettings) => ({
      ...currentSettings,
      directory,
    }));
  }, []);

  const handleRemoveItem = useCallback(
    (itemId: string) => {
      removeItems((item) => item.id === itemId);
    },
    [removeItems],
  );

  const handleRemoveCompletedFiles = useCallback(() => {
    removeItems((item) => Boolean(item.outputPath));
  }, [removeItems]);

  const handleProcessAll = useCallback(async () => {
    const processableItems = items.filter(
      (item) => item.path && isAbsoluteFilePath(item.path),
    );

    if (processableItems.length === 0) {
      console.warn("No processable items with absolute file paths.");
      return;
    }

    setIsRunning(true);
    cancelRequestedRef.current = false;
    setWorkerState(null);
    setProgress({
      stage: "decode",
      current: 0,
      total: 100,
      message: "작업을 시작하는 중...",
    });

    for (const item of processableItems) {
      if (cancelRequestedRef.current) {
        break;
      }

      setActiveFileName(item.name);

      try {
        if (!item.path) {
          console.warn(`Skipping item without valid path: ${item.name}`);
          continue;
        }

        const result = await window.imageAgent.removeText({
          inputPath: item.path,
          outputDirectory: outputSettings.directory || undefined,
          outputPrefix: outputSettings.prefix || undefined,
          outputPostfix: outputSettings.postfix || undefined,
        });

        setLastOutputPath(result.outputPath);
        setItems((currentItems) =>
          currentItems.map((currentItem) =>
            currentItem.id === item.id
              ? { ...currentItem, outputPath: result.outputPath }
              : currentItem,
          ),
        );
      } catch (error) {
        console.error(`Failed processing ${item.name}`, error);
        if (cancelRequestedRef.current) {
          break;
        }
      }
    }

    setActiveFileName(null);
    setProgress(null);
    setIsRunning(false);
  }, [items, outputSettings]);

  const handleCancelProcessing = useCallback(async () => {
    cancelRequestedRef.current = true;
    await window.imageAgent.cancelRemoveText();
  }, []);

  const handleImageError = useCallback((item: ImageItem) => {
    if (!item.path) {
      return;
    }
  }, []);

  const handleOpenOutput = useCallback(async () => {
    const targetPath =
      selectedIndex !== null ? items[selectedIndex]?.outputPath : null;
    const fallbackPath = targetPath ?? lastOutputPath;
    const isBridgeReady =
      typeof window.imageAgent.openOutputDirectory === "function";

    console.debug("handleOpenOutput -> targetPath:", fallbackPath);

    if (!isBridgeReady) {
      console.warn(
        "imageAgent.openOutputDirectory is unavailable. Restart the Electron app so the latest preload bundle loads.",
      );
      return;
    }

    try {
      if (fallbackPath) {
        await window.imageAgent.openOutputDirectory(fallbackPath);
      } else {
        await window.imageAgent.openOutputDirectory(
          outputSettings.directory || undefined,
        );
      }
    } catch (error) {
      console.error("openOutputDirectory failed:", error);
    }
  }, [items, lastOutputPath, outputSettings.directory, selectedIndex]);

  const selected = selectedIndex !== null ? items[selectedIndex] : null;
  useEffect(() => {
    let cancelled = false;

    async function loadSelectedOutput() {
      if (!selected?.outputPath) {
        setSelectedAfterUrl(null);
        return;
      }

      try {
        const reader = window.imageAgent.readImageAsDataUrl;
        const url =
          typeof reader === "function"
            ? await reader(selected.outputPath)
            : toFileUrlFromPath(selected.outputPath);

        if (!cancelled) {
          setSelectedAfterUrl(url);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("Failed to load output preview", error);
          setSelectedAfterUrl(toFileUrlFromPath(selected.outputPath));
        }
      }
    }

    void loadSelectedOutput();

    return () => {
      cancelled = true;
    };
  }, [selected?.outputPath]);

  const queueCount = workerState?.waitingJobs ?? 0;
  const workerStatusMessage = workerState
    ? `${workerState.message}${
        workerState.state === "queued" && workerState.waitingJobs > 0
          ? ` · 앞에 ${workerState.waitingJobs}개 대기`
          : ""
      }`
    : null;
  const outputPreviewName = `${outputSettings.prefix}${
    selected?.path ? getBaseName(selected.path) : "원본이름"
  }${outputSettings.postfix}.png`;
  const isBridgeReady =
    typeof window.imageAgent.openOutputDirectory === "function";
  const completedCount = items.filter((item) => Boolean(item.outputPath)).length;

  return {
    activeFileName,
    handleCancelProcessing,
    handleRemoveCompletedFiles,
    handleRemoveItem,
    handleDroppedFiles,
    handleImageError,
    handleOpenOutput,
    handlePickOutputDirectory,
    handleProcessAll,
    handleSelectFiles,
    isBridgeReady,
    isRunning,
    items,
    outputPreviewName,
    outputSettings,
    progress,
    completedCount,
    queueCount,
    selected,
    selectedIndex,
    setOutputSettings,
    setSelectedIndex,
    workerState,
    workerStatusMessage,
    selectedAfterUrl,
  };
}

function resolveSelectedIndexAfterRemoval(
  currentSelected: number | null,
  removedIndices: number[],
  currentLength: number,
  nextLength: number,
) {
  if (currentSelected === null) {
    return null;
  }

  if (currentSelected >= currentLength) {
    return nextLength > 0 ? nextLength - 1 : null;
  }

  const removedSet = new Set(removedIndices);

  if (removedSet.has(currentSelected)) {
    return nextLength > 0 ? Math.min(currentSelected, nextLength - 1) : null;
  }

  let shift = 0;
  for (const removedIndex of removedIndices) {
    if (removedIndex < currentSelected) {
      shift += 1;
    }
  }

  return currentSelected - shift;
}
