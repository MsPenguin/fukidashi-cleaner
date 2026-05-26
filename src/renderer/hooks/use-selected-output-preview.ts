import { useEffect } from "react";
import { toFileUrlFromPath } from "../utils";
import { loadPreviewUrl } from "./image-workspace-bridge";
import type { ImageWorkspaceAction } from "./image-workspace-reducer";

type ImageWorkspaceDispatch = (action: ImageWorkspaceAction) => void;

export function useSelectedOutputPreview(
  selectedOutputPath: string | undefined,
  dispatch: ImageWorkspaceDispatch,
) {
  useEffect(() => {
    let cancelled = false;

    async function loadSelectedOutput() {
      if (!selectedOutputPath) {
        dispatch({ type: "selectedPreview/updated", url: null });
        return;
      }

      try {
        const url = await loadPreviewUrl(selectedOutputPath);

        if (!cancelled) {
          dispatch({ type: "selectedPreview/updated", url });
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("Failed to load output preview", error);
          dispatch({
            type: "selectedPreview/updated",
            url: toFileUrlFromPath(selectedOutputPath),
          });
        }
      }
    }

    void loadSelectedOutput();

    return () => {
      cancelled = true;
    };
  }, [dispatch, selectedOutputPath]);
}
