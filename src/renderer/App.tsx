import { useCallback, useEffect, useState } from "react";
import ImageDropzone from "./components/image-dropzone";
import BeforeAfterViewer from "./components/before-after-viewer";
import { toFileUrlFromPath } from "./utils";

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
  const [activeFileName, setActiveFileName] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = window.imageAgent.onRemoveTextProgress((update) => {
      setProgress(update);
    });

    return unsubscribe;
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

  async function handleProcessAll() {
    const processableItems = items.filter(
      (item) => item.path && isAbsoluteFilePath(item.path),
    );

    if (processableItems.length === 0) {
      console.warn("No processable items with absolute file paths.");
      return;
    }

    setIsRunning(true);
    setProgress({
      stage: "decode",
      current: 0,
      total: 100,
      message: "작업을 시작하는 중...",
    });

    for (const it of processableItems) {
      setActiveFileName(it.name);
      try {
        if (!it.path) {
          console.warn(`Skipping item without valid path: ${it.name}`);
          continue;
        }

        const result = await window.imageAgent.removeText({
          inputPath: it.path,
        });
        setItems((s) =>
          s.map((x) =>
            x.id === it.id ? { ...x, outputPath: result.outputPath } : x,
          ),
        );
      } catch (err) {
        console.error(`Failed processing ${it.name}`, err);
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
        </div>
      </header>

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
