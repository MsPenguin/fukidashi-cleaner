import type { RemoveTextWorkerState } from "../../shared/image-types";

type WorkerStatusPanelProps = {
  queueCount: number;
  workerState: RemoveTextWorkerState | null;
  workerStatusMessage: string | null;
};

export default function WorkerStatusPanel({
  queueCount,
  workerState,
  workerStatusMessage,
}: WorkerStatusPanelProps) {
  if (!workerState) {
    return null;
  }

  return (
    <section className={`worker-status worker-status-${workerState.state}`}>
      <div className="worker-status-header">
        <span className="worker-status-title">
          {getWorkerStatusTitle(workerState.state)}
        </span>
        <span className="worker-status-file">{workerState.inputName}</span>
      </div>
      <div className="worker-status-message">
        <span>{workerStatusMessage}</span>
        <span className="worker-status-queue">대기열 {queueCount}개</span>
      </div>
      {workerState.outputPath ? (
        <div className="worker-status-path">{workerState.outputPath}</div>
      ) : null}
      {workerState.error ? (
        <div className="worker-status-path">{workerState.error}</div>
      ) : null}
    </section>
  );
}

function getWorkerStatusTitle(state: RemoveTextWorkerState["state"]) {
  switch (state) {
    case "queued":
      return "대기 중";
    case "running":
      return "worker 실행 중";
    case "completed":
      return "완료";
    case "cancelled":
      return "취소됨";
    case "error":
      return "실패";
    default:
      return state;
  }
}
