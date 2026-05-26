import { useCallback, useReducer, useRef } from "react";
import type { ImageItem, OutputSettings } from "../app-types";
import { createPreviewItemFromFile } from "../image-item-utils";
import {
  hydrateImageItemPreviews,
  isOutputDirectoryBridgeReady,
  openOutputDirectory,
  selectImageItemsFromDialog,
  selectOutputDirectory,
} from "./image-workspace-bridge";
import { processImageItems } from "./image-workspace-processing";
import {
  imageWorkspaceReducer,
  INITIAL_IMAGE_WORKSPACE_STATE,
} from "./image-workspace-reducer";
import {
  countCompletedItems,
  getOutputPreviewName,
  getQueueCount,
  getSelectedImageItem,
  getWorkerStatusMessage,
} from "./image-workspace-selectors";
import { useImageWorkspaceWorkerEvents } from "./use-image-workspace-worker-events";
import { useSelectedOutputPreview } from "./use-selected-output-preview";

export function useImageWorkspace() {
  const [state, dispatch] = useReducer(
    imageWorkspaceReducer,
    INITIAL_IMAGE_WORKSPACE_STATE,
  );
  const cancelRequestedRef = useRef(false);
  useImageWorkspaceWorkerEvents(dispatch);

  const handleDroppedFiles = useCallback((droppedFiles: File[]) => {
    const items = droppedFiles.map(createPreviewItemFromFile);
    dispatch({ type: "items/appended", items });
  }, []);

  const handleSelectFiles = useCallback(async () => {
    const items = await selectImageItemsFromDialog();
    if (items.length === 0) {
      return;
    }

    dispatch({ type: "items/appended", items });
    hydrateImageItemPreviews(items, (itemId, url) => {
      dispatch({
        type: "items/previewLoaded",
        itemId,
        url,
      });
    });
  }, []);

  const handlePickOutputDirectory = useCallback(async () => {
    const directory = await selectOutputDirectory();
    if (!directory) {
      return;
    }

    dispatch({
      type: "outputSettings/updated",
      patch: { directory },
    });
  }, []);

  const handleOutputSettingsChange = useCallback(
    (patch: Partial<OutputSettings>) => {
      dispatch({ type: "outputSettings/updated", patch });
    },
    [],
  );

  const handleRemoveItem = useCallback((itemId: string) => {
    dispatch({ type: "items/removedById", itemId });
  }, []);

  const handleRemoveCompletedFiles = useCallback(() => {
    dispatch({ type: "items/completedRemoved" });
  }, []);

  const handleSelectItem = useCallback((index: number) => {
    dispatch({ type: "selection/set", index });
  }, []);

  const handleProcessAll = useCallback(async () => {
    await processImageItems({
      items: state.items,
      outputSettings: state.outputSettings,
      cancelRequestedRef,
      dispatch,
    });
  }, [state.items, state.outputSettings]);

  const handleCancelProcessing = useCallback(async () => {
    cancelRequestedRef.current = true;
    await window.imageAgent.cancelRemoveText();
  }, []);

  const handleImageError = useCallback((item: ImageItem) => {
    if (!item.path) {
      return;
    }
  }, []);

  const selected = getSelectedImageItem(state.items, state.selectedIndex);
  useSelectedOutputPreview(selected?.outputPath, dispatch);

  const handleOpenOutput = useCallback(async () => {
    await openOutputDirectory(
      selected?.outputPath ?? state.lastOutputPath,
      state.outputSettings.directory,
    );
  }, [selected?.outputPath, state.lastOutputPath, state.outputSettings.directory]);

  const queueCount = getQueueCount(state.workerState);
  const workerStatusMessage = getWorkerStatusMessage(state.workerState);
  const outputPreviewName = getOutputPreviewName(
    state.outputSettings,
    selected,
  );
  const isBridgeReady = isOutputDirectoryBridgeReady();
  const completedCount = countCompletedItems(state.items);

  return {
    activeFileName: state.activeFileName,
    completedCount,
    handleCancelProcessing,
    handleDroppedFiles,
    handleImageError,
    handleOpenOutput,
    handleOutputSettingsChange,
    handlePickOutputDirectory,
    handleProcessAll,
    handleRemoveCompletedFiles,
    handleRemoveItem,
    handleSelectFiles,
    handleSelectItem,
    isBridgeReady,
    isRunning: state.isRunning,
    items: state.items,
    outputPreviewName,
    outputSettings: state.outputSettings,
    progress: state.progress,
    queueCount,
    selected,
    selectedAfterUrl: state.selectedAfterUrl,
    selectedIndex: state.selectedIndex,
    workerState: state.workerState,
    workerStatusMessage,
  };
}
