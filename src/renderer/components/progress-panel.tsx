import type { ProgressUpdate } from "../app-types";

type ProgressPanelProps = {
  activeFileName: string | null;
  progress: ProgressUpdate | null;
};

export default function ProgressPanel({
  activeFileName,
  progress,
}: ProgressPanelProps) {
  if (!progress) {
    return null;
  }

  return (
    <section className="progress-panel" aria-live="polite">
      <div className="progress-header">
        <span className="progress-title">처리 중</span>
        <span className="progress-meta">
          {activeFileName ? `${activeFileName} · ` : ""}
          {progress.message}
        </span>
      </div>
      <progress
        className="progress-track"
        max={progress.total}
        value={Math.max(0, Math.min(progress.total, progress.current))}
      />
    </section>
  );
}
