import { useEffect } from "react";
import type { ImageWorkspaceAction } from "./image-workspace-reducer";

type ImageWorkspaceDispatch = (action: ImageWorkspaceAction) => void;

export function useImageWorkspaceWorkerEvents(
  dispatch: ImageWorkspaceDispatch,
) {
  useEffect(() => {
    const unsubscribeProgress = window.imageAgent.onRemoveTextProgress(
      (progress) => {
        dispatch({ type: "progress/updated", progress });
      },
    );
    const unsubscribeState = window.imageAgent.onRemoveTextState(
      (workerState) => {
        dispatch({ type: "worker/stateUpdated", workerState });
      },
    );

    return () => {
      unsubscribeProgress();
      unsubscribeState();
    };
  }, [dispatch]);
}
