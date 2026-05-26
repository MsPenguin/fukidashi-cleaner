type AppHeaderProps = {
  completedCount: number;
  isRunning: boolean;
  itemCount: number;
  onCancel: () => Promise<void>;
  onRemoveCompletedFiles: () => void;
  onProcessAll: () => Promise<void>;
};

export default function AppHeader({
  completedCount,
  isRunning,
  itemCount,
  onCancel,
  onRemoveCompletedFiles,
  onProcessAll,
}: AppHeaderProps) {
  return (
    <header>
      <h1>Fukidashi Cleaner</h1>
      <div className="controls">
        <label className="toggle">
          <input id="allowLargeBucket" type="checkbox" />
          4096 bucket 허용
        </label>
        <button
          onClick={() => void onProcessAll()}
          disabled={isRunning || itemCount === 0}
          className="primary"
        >
          {isRunning ? "처리 중..." : "문자 제거"}
        </button>
        <button onClick={() => void onCancel()} disabled={!isRunning}>
          취소
        </button>
        <button
          onClick={onRemoveCompletedFiles}
          disabled={completedCount === 0}
        >
          완료된 파일 제거 ({completedCount})
        </button>
      </div>
    </header>
  );
}
