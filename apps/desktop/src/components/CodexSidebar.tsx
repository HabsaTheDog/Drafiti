import type { RefObject } from "react";

import type { ChatMessage, CodexStatus, PromptProfile, SessionState } from "../types";
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
  buildProfile: PromptProfile;
  buildProfileHighlights: string[];
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

export function CodexSidebar({
  bootstrapping,
  bootstrapError,
  workspacePath,
  codexStatus,
  session,
  messages,
  transcriptRef,
  composer,
  selectedModel,
  defaultModel,
  codexBinaryPath,
  codexHomePath,
  previewCommand,
  settingsOpen,
  isConnecting,
  isRefreshingStatus,
  isSavingSettings,
  isSending,
  isSwitchingModel,
  canConnect,
  canSend,
  canInterrupt,
  modelSuggestions,
  buildProfile,
  buildProfileHighlights,
  onPickWorkspace,
  onRefreshStatus,
  onConnect,
  onDisconnect,
  onSend,
  onInterrupt,
  onComposerChange,
  onSelectedModelChange,
  onCodexBinaryPathChange,
  onCodexHomePathChange,
  onDefaultModelChange,
  onPreviewCommandChange,
  onSettingsOpenChange,
  onSaveSettings,
}: CodexSidebarProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-ink-950/72">
      <CodexHeader
        workspacePath={workspacePath}
        codexStatus={codexStatus}
        session={session}
        selectedModel={selectedModel || defaultModel}
        buildProfile={buildProfile}
        buildProfileHighlights={buildProfileHighlights}
        onPickWorkspace={onPickWorkspace}
        onRefreshStatus={onRefreshStatus}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        isConnecting={isConnecting}
        isRefreshingStatus={isRefreshingStatus}
        canConnect={canConnect}
      />

      <div className="border-b border-white/8 px-5 py-3">
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

      <TranscriptTimeline
        bootstrapping={bootstrapping}
        bootstrapError={bootstrapError}
        messages={messages}
        transcriptRef={transcriptRef}
      />

      <ComposerBar
        composer={composer}
        selectedModel={selectedModel}
        sessionConnected={session.connected}
        isSending={isSending}
        isSwitchingModel={isSwitchingModel}
        canSend={canSend}
        canInterrupt={canInterrupt}
        modelSuggestions={modelSuggestions}
        onComposerChange={onComposerChange}
        onSelectedModelChange={onSelectedModelChange}
        onSend={onSend}
        onInterrupt={onInterrupt}
      />
    </div>
  );
}
