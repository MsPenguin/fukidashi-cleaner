import { useCallback, useEffect, useRef, useState } from "react";
import ImageDropzone from "./components/image-dropzone";
import BeforeAfterViewer from "./components/before-after-viewer";
import { toFileUrlFromPath } from "./utils";
import type { RemoveTextWorkerState } from "../shared/image-types";

type ImageItem = {
  id: string;
  name: string;
  path?: string;
  url: string;
  outputPath?: string;
};

function isAbsoluteFilePath(p: string) {
  return p.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\");
}

function getFileNameFromPath(filePath: string) {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function createImageItemId(seed?: string) {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${seed ?? "image"}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolveDroppedFilePath(file: File) {
  const bridgedPath = window.imageAgent.getPathForFile(file);
  if (bridgedPath && isAbsoluteFilePath(bridgedPath)) {
    return bridgedPath;
  }

  const legacyPath = (file as File & { path?: string }).path;
  return legacyPath && isAbsoluteFilePath(legacyPath) ? legacyPath : undefined;
}

type ProgressUpdate = {
  stage: string;
  current: number;
  total: number;
  message: string;
  boxes?: {
    x: number;
    y: number;
    width: number;
    height: number;
    score?: number;
  }[];
};

type OutputSettings = {
  directory: string;
  prefix: string;
  postfix: string;
};

function getBaseName(filePath: string) {
  return (
    filePath
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.[^.]+$/, "") ?? filePath
  );
}

function getPreviewItemFromFile(file: File): ImageItem {
  const filePath = resolveDroppedFilePath(file);

  return {
    id: createImageItemId(file.name),
    name: file.name,
    path: filePath,
    url: filePath ? toFileUrlFromPath(filePath) : URL.createObjectURL(file),
  };
}

export default function App() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [workerState, setWorkerState] = useState<RemoveTextWorkerState | null>(
    null,
  );
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [outputSettings, setOutputSettings] = useState<OutputSettings>({
    directory: "",
    prefix: "textless-",
    postfix: "",
  });
  const [lastOutputPath, setLastOutputPath] = useState<string | null>(null);
  const cancelRequestedRef = useRef(false);
  const isBridgeReady =
    typeof window.imageAgent?.openOutputDirectory === "function";

  useEffect(() => {
    const unsubscribe = window.imageAgent.onRemoveTextProgress((update) => {
      setProgress(update);
    });

    const unsubscribeState = window.imageAgent.onRemoveTextState((state) => {
      setWorkerState(state);
    });

    return () => {
      unsubscribe();
      unsubscribeState();
    };
  }, []);

  const handleDroppedFiles = useCallback((droppedFiles: File[]) => {
    const newItems = droppedFiles.map(getPreviewItemFromFile);

    setItems((s) => [...s, ...newItems]);
    setSelectedIndex((idx) => (idx === null ? 0 : idx));
  }, []);

  const handleSelectFiles = useCallback(async () => {
    const selectedFiles = await window.imageAgent.selectFiles();
    if (!selectedFiles?.length) return;

    const newItems = selectedFiles.map((filePath) => ({
      id: createImageItemId(filePath),
      name: getFileNameFromPath(filePath),
      path: filePath,
      url: toFileUrlFromPath(filePath),
    })) as ImageItem[];

    setItems((s) => [...s, ...newItems]);
    setSelectedIndex((idx) => (idx === null ? 0 : idx));
  }, []);

  const handlePickOutputDirectory = useCallback(async () => {
    const directory = await window.imageAgent.selectOutputDirectory();
    if (!directory) return;

    setOutputSettings((current) => ({ ...current, directory }));
  }, []);

  async function handleProcessAll() {
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

    for (const it of processableItems) {
      if (cancelRequestedRef.current) {
        break;
      }

      setActiveFileName(it.name);
      try {
        if (!it.path) {
          console.warn(`Skipping item without valid path: ${it.name}`);
          continue;
        }

        const result = await window.imageAgent.removeText({
          inputPath: it.path,
          outputDirectory: outputSettings.directory || undefined,
          outputPrefix: outputSettings.prefix || undefined,
          outputPostfix: outputSettings.postfix || undefined,
        });
        setLastOutputPath(result.outputPath);
        setItems((s) =>
          s.map((x) =>
            x.id === it.id ? { ...x, outputPath: result.outputPath } : x,
          ),
        );
      } catch (err) {
        console.error(`Failed processing ${it.name}`, err);
        if (cancelRequestedRef.current) {
          break;
        }
      }
    }

    setActiveFileName(null);
    setProgress(null);
    setIsRunning(false);
  }

  const selected = selectedIndex !== null ? items[selectedIndex] : null;

  function handleImageError(item: ImageItem, field: "url" | "output") {
    // If the item has a local path, ask preload to resolve an absolute file URL
    if (item.path) {
      const resolver = (window as any).imageAgent?.resolveToFileUrl;
      const fixed =
        typeof resolver === "function"
          ? resolver(item.path)
          : toFileUrlFromPath(item.path);
      setItems((s) =>
        s.map((x) => (x.id === item.id ? { ...x, url: fixed } : x)),
      );
    }
  }

  async function handleOpenOutput() {
    const targetPath = selected?.outputPath ?? lastOutputPath;
    console.debug("handleOpenOutput -> targetPath:", targetPath);
    if (!isBridgeReady) {
      console.warn(
        "imageAgent.openOutputDirectory is unavailable. Restart the Electron app so the latest preload bundle loads.",
      );
      return;
    }

    try {
      if (targetPath) {
        await window.imageAgent.openOutputDirectory(targetPath);
      } else {
        await window.imageAgent.openOutputDirectory(
          outputSettings.directory || undefined,
        );
      }
    } catch (err) {
      console.error("openOutputDirectory failed:", err);
    }
  }

  const outputPreviewName = `${outputSettings.prefix}${
    selected?.path ? getBaseName(selected.path) : "원본이름"
  }${outputSettings.postfix}.png`;

  const workerStatusMessage = workerState
    ? `${workerState.message}${workerState.state === "queued" && workerState.waitingJobs > 0 ? ` · 앞에 ${workerState.waitingJobs}개 대기` : ""}`
    : null;
  const queueCount = workerState?.waitingJobs ?? 0;

  return (
    <div className="app">
      <header>
        <h1>Fukidashi Cleaner</h1>
        <div className="controls">
          <label className="toggle">
            <input id="allowLargeBucket" type="checkbox" />
            4096 bucket 허용
          </label>
          <button
            onClick={handleProcessAll}
            disabled={isRunning || items.length === 0}
            className="primary"
          >
            {isRunning ? "처리 중..." : "문자 제거"}
          </button>
          <button
            onClick={async () => {
              cancelRequestedRef.current = true;
              await window.imageAgent.cancelRemoveText();
            }}
            disabled={!isRunning && queueCount === 0}
          >
            취소
          </button>
        </div>
      </header>

      {workerState ? (
        <section className={`worker-status worker-status-${workerState.state}`}>
          <div className="worker-status-header">
            <span className="worker-status-title">
              {workerState.state === "queued"
                ? "대기 중"
                : workerState.state === "running"
                  ? "worker 실행 중"
                  : workerState.state === "completed"
                    ? "완료"
                    : workerState.state === "cancelled"
                      ? "취소됨"
                      : "실패"}
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
      ) : null}

      <section className="settings-panel">
        <div className="setting-row">
          <div className="setting-label">출력 폴더</div>
          <div className="setting-input-group">
            <input
              className="setting-input"
              type="text"
              value={outputSettings.directory}
              placeholder="기본값: userData/outputs"
              onChange={(event) =>
                setOutputSettings((current) => ({
                  ...current,
                  directory: event.target.value,
                }))
              }
            />
            <button onClick={handlePickOutputDirectory}>폴더 선택</button>
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-label">파일명 규칙</div>
          <div className="setting-input-group setting-input-group-wide">
            <input
              className="setting-input"
              type="text"
              value={outputSettings.prefix}
              placeholder="prefix"
              onChange={(event) =>
                setOutputSettings((current) => ({
                  ...current,
                  prefix: event.target.value,
                }))
              }
            />
            <span className="setting-plus">+</span>
            <span className="setting-preview">원본이름</span>
            <span className="setting-plus">+</span>
            <input
              className="setting-input"
              type="text"
              value={outputSettings.postfix}
              placeholder="postfix"
              onChange={(event) =>
                setOutputSettings((current) => ({
                  ...current,
                  postfix: event.target.value,
                }))
              }
            />
            <span className="setting-plus">+</span>
            <span className="setting-preview">.png</span>
          </div>
        </div>

        <div className="setting-row setting-row-actions">
          <div className="setting-label">미리보기</div>
          <div className="setting-input-group">
            <div className="setting-preview">{outputPreviewName}</div>
            <button onClick={handleOpenOutput} disabled={!isBridgeReady}>
              결과 위치 열기
            </button>
          </div>
          {!isBridgeReady ? (
            <div className="setting-hint">
              preload 브리지가 아직 안 보입니다. 앱을 완전히 종료한 뒤 다시
              실행하세요.
            </div>
          ) : null}
        </div>
      </section>

      {isRunning && progress ? (
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
      ) : null}

      <ImageDropzone
        onFilesSelected={handleSelectFiles}
        onFilesDropped={handleDroppedFiles}
      />

      <div className="thumbnails">
        {items.map((it, idx) => (
          <div
            key={it.id}
            className={`thumb ${idx === selectedIndex ? "selected" : ""}`}
            onClick={() => setSelectedIndex(idx)}
          >
            <img src={it.url} alt={it.name} />
            <div className="name">{it.name}</div>
          </div>
        ))}
      </div>
      <BeforeAfterViewer
        beforeUrl={selected ? selected.url : null}
        afterUrl={
          selected && selected.outputPath
            ? toFileUrlFromPath(selected.outputPath)
            : null
        }
        onBeforeError={() => selected && handleImageError(selected, "url")}
        onAfterError={() => selected && handleImageError(selected, "output")}
        detectedBoxes={progress?.boxes}
      />
    </div>
  );
}
