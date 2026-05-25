import { useState } from "react";

type Props = {
  inputPath: string;
};

export function ImageRemoveButton({ inputPath }: Props) {
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  async function handleRemove() {
    setIsRunning(true);

    try {
      const result = await window.imageAgent.removeText({
        inputPath,
      });

      setOutputPath(result.outputPath);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div>
      <button onClick={handleRemove} disabled={isRunning}>
        {isRunning ? "처리 중..." : "문자 제거"}
      </button>

      {outputPath && (
        <p>
          결과 저장됨: <code>{outputPath}</code>
        </p>
      )}
    </div>
  );
}
