import type { RefObject } from "react";

import type { ChatMessage, CodexStatus, SessionState } from "../types";
import { CodexHeader } from "./CodexHeader";
import { ComposerBar } from "./ComposerBar";
import { SettingsPanel } from "./SettingsPanel";
import { TranscriptTimeline } from "./TranscriptTimeline";

interface CodexSidebarProps {
  bootstrapping: boolean;
  bootstrapError: string | null;
  workspacePath: string;
  codexStatus: CodexStatus | null;
  session: SessionState;
  messages: ChatMessage[];
  transcriptRef: RefObject<HTMLDivElement | null>;
  composer: string;
  selectedModel: string;
  defaultModel: string;
  codexBinaryPath: string;
  codexHomePath: string;
  previewCommand: string;
  settingsOpen: boolean;
  isConnecting: boolean;
  isRefreshingStatus: boolean;
  isSavingSettings: boolean;
  isSending: boolean;
  isSwitchingModel: boolean;
  canConnect: boolean;
  canSend: boolean;
  canInterrupt: boolean;
  modelSuggestions: string[];
  onPickWorkspace: () => void;
  onRefreshStatus: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onSend: () => void;
  onInterrupt: () => void;
  onComposerChange: (value: string) => void;
  onSelectedModelChange: (value: string) => void;
  onCodexBinaryPathChange: (value: string) => void;
  onCodexHomePathChange: (value: string) => void;
  onDefaultModelChange: (value: string) => void;
  onPreviewCommandChange: (value: string) => void;
  onSettingsOpenChange: (open: boolean) => void;
  onSaveSettings: () => void;
}

function GearIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M10 1.5v2m0 13v2m-7.07-3.93 1.41-1.41m11.32-5.32 1.41-1.41M1.5 10h2m13 0h2M4.34 4.34l1.41 1.41m8.5 8.5 1.41 1.41" />
    </svg>
  );
}

export function CodexSidebar({
  bootstrapping,
  bootstrapError,
  workspacePath,
  codexStatus,
  session,
  messages,
  transcriptRef,
  composer,
  defaultModel,
  codexBinaryPath,
  codexHomePath,
  previewCommand,
  settingsOpen,
  isConnecting,
  isSavingSettings,
  isSending,
  canConnect,
  canSend,
  canInterrupt,
  onPickWorkspace,
  onConnect,
  onDisconnect,
  onSend,
  onInterrupt,
  onComposerChange,
  onCodexBinaryPathChange,
  onCodexHomePathChange,
  onDefaultModelChange,
  onPreviewCommandChange,
  onSettingsOpenChange,
  onSaveSettings,
}: CodexSidebarProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-ink-950/60">
      {/* Header + gear button row */}
      <div className="relative">
        <CodexHeader
          workspacePath={workspacePath}
          codexStatus={codexStatus}
          session={session}
          onPickWorkspace={onPickWorkspace}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          isConnecting={isConnecting}
          canConnect={canConnect}
        />
        {/* Gear icon to toggle settings */}
        <button
          type="button"
          className={`absolute right-5 bottom-3 rounded-lg p-1.5 text-cloud-300/50 transition hover:bg-white/[0.06] hover:text-cloud-100 ${
            settingsOpen ? "text-cyan-400" : ""
          }`}
          onClick={() => onSettingsOpenChange(!settingsOpen)}
          aria-label="Toggle settings"
        >
          <GearIcon />
        </button>
      </div>

      {/* Collapsible settings */}
      {settingsOpen ? (
        <div className="border-b border-white/[0.06] px-5 py-3">
          <SettingsPanel
            codexBinaryPath={codexBinaryPath}
            codexHomePath={codexHomePath}
            defaultModel={defaultModel}
            previewCommand={previewCommand}
            open={settingsOpen}
            isSaving={isSavingSettings}
            onOpenChange={onSettingsOpenChange}
            onCodexBinaryPathChange={onCodexBinaryPathChange}
            onCodexHomePathChange={onCodexHomePathChange}
            onDefaultModelChange={onDefaultModelChange}
            onPreviewCommandChange={onPreviewCommandChange}
            onSave={onSaveSettings}
          />
        </div>
      ) : null}

      <TranscriptTimeline
        bootstrapping={bootstrapping}
        bootstrapError={bootstrapError}
        messages={messages}
        transcriptRef={transcriptRef}
      />

      <ComposerBar
        composer={composer}
        sessionConnected={session.connected}
        isSending={isSending}
        canSend={canSend}
        canInterrupt={canInterrupt}
        onComposerChange={onComposerChange}
        onSend={onSend}
        onInterrupt={onInterrupt}
      />
    </div>
  );
}
