import type { RemoveTextWorkerState } from "../../shared/image-types";
import type { ImageItem, OutputSettings, ProgressUpdate } from "../app-types";

const DEFAULT_OUTPUT_SETTINGS: OutputSettings = {
  directory: "",
  prefix: "textless-",
  postfix: "",
};

export type ImageWorkspaceState = {
  items: ImageItem[];
  selectedIndex: number | null;
  isRunning: boolean;
  progress: ProgressUpdate | null;
  workerState: RemoveTextWorkerState | null;
  activeFileName: string | null;
  outputSettings: OutputSettings;
  lastOutputPath: string | null;
  selectedAfterUrl: string | null;
};

export type ImageWorkspaceAction =
  | { type: "items/appended"; items: ImageItem[] }
  | { type: "items/previewLoaded"; itemId: string; url: string }
  | { type: "items/removedById"; itemId: string }
  | { type: "items/completedRemoved" }
  | { type: "selection/set"; index: number | null }
  | { type: "processing/started"; progress: ProgressUpdate }
  | { type: "processing/activeFileChanged"; fileName: string | null }
  | { type: "processing/itemCompleted"; itemId: string; outputPath: string }
  | { type: "processing/finished" }
  | { type: "progress/updated"; progress: ProgressUpdate | null }
  | {
      type: "worker/stateUpdated";
      workerState: RemoveTextWorkerState | null;
    }
  | {
      type: "outputSettings/updated";
      patch: Partial<OutputSettings>;
    }
  | { type: "selectedPreview/updated"; url: string | null };

export const INITIAL_IMAGE_WORKSPACE_STATE: ImageWorkspaceState = {
  items: [],
  selectedIndex: null,
  isRunning: false,
  progress: null,
  workerState: null,
  activeFileName: null,
  outputSettings: DEFAULT_OUTPUT_SETTINGS,
  lastOutputPath: null,
  selectedAfterUrl: null,
};

export function imageWorkspaceReducer(
  state: ImageWorkspaceState,
  action: ImageWorkspaceAction,
): ImageWorkspaceState {
  switch (action.type) {
    case "items/appended":
      return appendItems(state, action.items);
    case "items/previewLoaded":
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.itemId ? { ...item, url: action.url } : item,
        ),
      };
    case "items/removedById":
      return removeItems(state, (item) => item.id === action.itemId);
    case "items/completedRemoved":
      return removeItems(state, (item) => Boolean(item.outputPath));
    case "selection/set":
      return {
        ...state,
        selectedIndex: action.index,
      };
    case "processing/started":
      return {
        ...state,
        isRunning: true,
        progress: action.progress,
        workerState: null,
        activeFileName: null,
      };
    case "processing/activeFileChanged":
      return {
        ...state,
        activeFileName: action.fileName,
      };
    case "processing/itemCompleted":
      return {
        ...state,
        lastOutputPath: action.outputPath,
        items: state.items.map((item) =>
          item.id === action.itemId
            ? { ...item, outputPath: action.outputPath }
            : item,
        ),
      };
    case "processing/finished":
      return {
        ...state,
        activeFileName: null,
        progress: null,
        isRunning: false,
      };
    case "progress/updated":
      return {
        ...state,
        progress: action.progress,
      };
    case "worker/stateUpdated":
      return {
        ...state,
        workerState: action.workerState,
      };
    case "outputSettings/updated":
      return {
        ...state,
        outputSettings: {
          ...state.outputSettings,
          ...action.patch,
        },
      };
    case "selectedPreview/updated":
      return {
        ...state,
        selectedAfterUrl: action.url,
      };
    default:
      return state;
  }
}

function appendItems(state: ImageWorkspaceState, items: ImageItem[]) {
  if (items.length === 0) {
    return state;
  }

  return {
    ...state,
    items: [...state.items, ...items],
    selectedIndex: state.selectedIndex === null ? 0 : state.selectedIndex,
  };
}

function removeItems(
  state: ImageWorkspaceState,
  predicate: (item: ImageItem) => boolean,
) {
  const removedIndices: number[] = [];

  state.items.forEach((item, index) => {
    if (predicate(item)) {
      removedIndices.push(index);
    }
  });

  if (removedIndices.length === 0) {
    return state;
  }

  const nextItems = state.items.filter((item) => !predicate(item));

  return {
    ...state,
    items: nextItems,
    selectedIndex: resolveSelectedIndexAfterRemoval(
      state.selectedIndex,
      removedIndices,
      state.items.length,
      nextItems.length,
    ),
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
