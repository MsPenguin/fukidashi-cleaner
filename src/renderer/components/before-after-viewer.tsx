import { useEffect, useRef } from "react";

type BeforeAfterViewerProps = {
  beforeUrl?: string | null;
  afterUrl?: string | null;
  onBeforeError?: () => void;
  onAfterError?: () => void;
  detectedBoxes?: {
    x: number;
    y: number;
    width: number;
    height: number;
    score?: number;
  }[];
};

export default function BeforeAfterViewer({
  beforeUrl,
  afterUrl,
  onBeforeError,
  onAfterError,
  detectedBoxes,
}: BeforeAfterViewerProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;

    function draw() {
      if (!img || !canvas) return;

      const naturalW = img.naturalWidth || img.width;
      const naturalH = img.naturalHeight || img.height;
      const displayW = img.clientWidth;
      const displayH = img.clientHeight;

      canvas.width = displayW;
      canvas.height = displayH;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!detectedBoxes || detectedBoxes.length === 0) return;

      const scaleX = displayW / naturalW;
      const scaleY = displayH / naturalH;

      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,128,0,0.9)";
      ctx.fillStyle = "rgba(255,128,0,0.15)";

      for (const b of detectedBoxes) {
        const x = Math.round(b.x * scaleX);
        const y = Math.round(b.y * scaleY);
        const w = Math.round(b.width * scaleX);
        const h = Math.round(b.height * scaleY);
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
    }

    draw();
  }, [detectedBoxes]);

  return (
    <main className="workspace">
      <section className="pane">
        <div className="pane-title">Before</div>
        <div className="preview preview-with-overlay">
          {beforeUrl ? (
            <>
              <img
                ref={imgRef}
                src={beforeUrl}
                alt="Before"
                onError={onBeforeError}
              />
              <canvas ref={canvasRef} className="detection-overlay" />
            </>
          ) : (
            <div className="empty">선택한 이미지가 여기에 표시됩니다.</div>
          )}
        </div>
      </section>

      <section className="pane">
        <div className="pane-title">After</div>
        <div className="preview">
          {afterUrl ? (
            <img src={afterUrl} alt="After" onError={onAfterError} />
          ) : (
            <div className="empty">처리 결과가 여기에 표시됩니다.</div>
          )}
        </div>
      </section>
    </main>
  );
}
