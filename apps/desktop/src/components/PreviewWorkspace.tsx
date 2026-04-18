import type { ChangeSummary, PreviewState, PreviewViewportMode } from "../types";
import { PreviewFooterSummary } from "./PreviewFooterSummary";
import { PreviewFrame } from "./PreviewFrame";
import { PreviewToolbar } from "./PreviewToolbar";

interface PreviewWorkspaceProps {
  workspacePath: string;
  preview: PreviewState;
  previewViewportMode: PreviewViewportMode;
  latestChangeSummary: ChangeSummary | null;
  canStart: boolean;
  canRestart: boolean;
  onPreviewViewportModeChange: (mode: PreviewViewportMode) => void;
  onStart: () => void;
  onRestart: () => void;
  onStop: () => void;
  onOpen: () => void;
}

export function PreviewWorkspace({
  workspacePath,
  preview,
  previewViewportMode,
  latestChangeSummary,
  canStart,
  canRestart,
  onPreviewViewportModeChange,
  onStart,
  onRestart,
  onStop,
  onOpen,
}: PreviewWorkspaceProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,rgba(217,82,53,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(76,129,197,0.18),transparent_24%),linear-gradient(180deg,rgba(16,19,19,0.98),rgba(20,25,24,0.96))]">
      <PreviewToolbar
        workspacePath={workspacePath}
        preview={preview}
        canStart={canStart}
        canRestart={canRestart}
        onStart={onStart}
        onRestart={onRestart}
        onStop={onStop}
        onOpen={onOpen}
      />
      <div className="flex min-h-0 flex-1 px-5 py-5">
        <PreviewFrame preview={preview} previewViewportMode={previewViewportMode} />
      </div>
      <PreviewFooterSummary
        summary={latestChangeSummary}
        previewViewportMode={previewViewportMode}
        onPreviewViewportModeChange={onPreviewViewportModeChange}
      />
    </div>
  );
}
