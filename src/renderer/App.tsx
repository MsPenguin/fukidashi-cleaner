import AppHeader from "./components/app-header";
import BeforeAfterViewer from "./components/before-after-viewer";
import ImageDropzone from "./components/image-dropzone";
import ImageThumbnailList from "./components/image-thumbnail-list";
import OutputSettingsPanel from "./components/output-settings-panel";
import ProgressPanel from "./components/progress-panel";
import WorkerStatusPanel from "./components/worker-status-panel";
import { useImageWorkspace } from "./hooks/use-image-workspace";

export default function App() {
  const {
    activeFileName,
    handleCancelProcessing,
    handleDroppedFiles,
    handleImageError,
    handleOpenOutput,
    handlePickOutputDirectory,
    handleProcessAll,
    handleRemoveCompletedFiles,
    handleRemoveItem,
    handleSelectFiles,
    isBridgeReady,
    isRunning,
    completedCount,
    items,
    outputPreviewName,
    outputSettings,
    progress,
    queueCount,
    selected,
    selectedIndex,
    setOutputSettings,
    setSelectedIndex,
    selectedAfterUrl,
    workerState,
    workerStatusMessage,
  } = useImageWorkspace();

  return (
    <div className="app">
      <AppHeader
        completedCount={completedCount}
        isRunning={isRunning}
        itemCount={items.length}
        onCancel={handleCancelProcessing}
        onRemoveCompletedFiles={handleRemoveCompletedFiles}
        onProcessAll={handleProcessAll}
      />

      <WorkerStatusPanel
        queueCount={queueCount}
        workerState={workerState}
        workerStatusMessage={workerStatusMessage}
      />

      <OutputSettingsPanel
        isBridgeReady={isBridgeReady}
        onDirectoryChange={(directory) =>
          setOutputSettings((currentSettings) => ({
            ...currentSettings,
            directory,
          }))
        }
        onOpenOutput={handleOpenOutput}
        onPickOutputDirectory={handlePickOutputDirectory}
        onPostfixChange={(postfix) =>
          setOutputSettings((currentSettings) => ({
            ...currentSettings,
            postfix,
          }))
        }
        onPrefixChange={(prefix) =>
          setOutputSettings((currentSettings) => ({
            ...currentSettings,
            prefix,
          }))
        }
        outputPreviewName={outputPreviewName}
        outputSettings={outputSettings}
      />

      <ProgressPanel activeFileName={activeFileName} progress={progress} />

      <ImageDropzone
        onFilesSelected={handleSelectFiles}
        onFilesDropped={handleDroppedFiles}
      />

      <ImageThumbnailList
        items={items}
        selectedIndex={selectedIndex}
        onRemove={handleRemoveItem}
        onSelect={setSelectedIndex}
      />

      <BeforeAfterViewer
        beforeUrl={selected ? selected.url : null}
        afterUrl={selectedAfterUrl}
        onBeforeError={() => selected && handleImageError(selected)}
        onAfterError={() => selected && handleImageError(selected)}
        detectedBoxes={progress?.boxes}
      />
    </div>
  );
}
