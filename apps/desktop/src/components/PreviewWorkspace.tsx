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
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,rgba(76,224,235,0.08),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(177,104,232,0.08),transparent_28%),linear-gradient(180deg,rgba(12,17,23,0.98),rgba(17,24,32,0.96))]">
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
      <div className="flex min-h-0 flex-1 px-4 py-4">
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
