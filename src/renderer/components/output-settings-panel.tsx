import type { ChangeEvent } from "react";
import type { OutputSettings } from "../app-types";

type OutputSettingsPanelProps = {
  isBridgeReady: boolean;
  onDirectoryChange: (value: string) => void;
  onOpenOutput: () => Promise<void>;
  onPickOutputDirectory: () => Promise<void>;
  onPostfixChange: (value: string) => void;
  onPrefixChange: (value: string) => void;
  outputPreviewName: string;
  outputSettings: OutputSettings;
};

export default function OutputSettingsPanel({
  isBridgeReady,
  onDirectoryChange,
  onOpenOutput,
  onPickOutputDirectory,
  onPostfixChange,
  onPrefixChange,
  outputPreviewName,
  outputSettings,
}: OutputSettingsPanelProps) {
  return (
    <section className="settings-panel">
      <div className="setting-row">
        <div className="setting-label">출력 폴더</div>
        <div className="setting-input-group">
          <input
            className="setting-input"
            type="text"
            value={outputSettings.directory}
            placeholder="기본값: userData/outputs"
            onChange={createValueHandler(onDirectoryChange)}
          />
          <button onClick={() => void onPickOutputDirectory()}>폴더 선택</button>
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
            onChange={createValueHandler(onPrefixChange)}
          />
          <span className="setting-plus">+</span>
          <span className="setting-preview">원본이름</span>
          <span className="setting-plus">+</span>
          <input
            className="setting-input"
            type="text"
            value={outputSettings.postfix}
            placeholder="postfix"
            onChange={createValueHandler(onPostfixChange)}
          />
          <span className="setting-plus">+</span>
          <span className="setting-preview">.png</span>
        </div>
      </div>

      <div className="setting-row setting-row-actions">
        <div className="setting-label">미리보기</div>
        <div className="setting-input-group">
          <div className="setting-preview">{outputPreviewName}</div>
          <button
            onClick={() => void onOpenOutput()}
            disabled={!isBridgeReady}
          >
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
  );
}

function createValueHandler(onChange: (value: string) => void) {
  return (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };
}
