import { useCallback, useMemo, useState } from "react";

type ImageDropzoneProps = {
  onFilesSelected: () => Promise<void> | void;
  onFilesDropped: (files: File[]) => void;
};

export default function ImageDropzone({
  onFilesSelected,
  onFilesDropped,
}: ImageDropzoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);

  const className = useMemo(
    () => `dropzone${isDragActive ? " is-active" : ""}`,
    [isDragActive],
  );

  const handleClick = useCallback(() => {
    void onFilesSelected();
  }, [onFilesSelected]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        void onFilesSelected();
      }
    },
    [onFilesSelected],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragActive(true);
    },
    [],
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragActive(false);
    },
    [],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragActive(false);
      onFilesDropped(Array.from(event.dataTransfer.files));
    },
    [onFilesDropped],
  );

  return (
    <div
      className={className}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragActive ? (
        <p>드롭하여 추가하세요...</p>
      ) : (
        <p>여기에 파일을 드래그하거나 클릭해 선택하세요 (여러 파일 가능)</p>
      )}
    </div>
  );
}
