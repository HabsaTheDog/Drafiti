export type CodexStatusKind = "ready" | "unauthenticated" | "notInstalled" | "error";
export type SessionStatus = "disconnected" | "connecting" | "ready" | "running" | "error";
export type PreviewStatus = "idle" | "booting" | "ready" | "crashed";
export type PreviewCommandSource = "manual" | "expo" | "npmDev" | "none";

export interface CodexStatus {
  status: CodexStatusKind;
  version: string | null;
  message: string;
  binaryPath: string;
  homePath: string | null;
}

export interface PreviewCommandResolution {
  source: PreviewCommandSource;
  label: string;
  command: string | null;
  defaultUrl: string | null;
}

export interface PreviewState {
  status: PreviewStatus;
  workspacePath: string | null;
  command: string | null;
  url: string | null;
  lastError: string | null;
  pid: number | null;
  lastStartedAt: string | null;
  commandResolution: PreviewCommandResolution | null;
}

export interface ChangeSummary {
  turnId: string | null;
  summary: string;
  added: string[];
  modified: string[];
  deleted: string[];
  changedFiles: string[];
  capturedAt: string;
}

export interface SessionState {
  connected: boolean;
  status: SessionStatus;
  workspacePath: string | null;
  providerThreadId: string | null;
  activeTurnId: string | null;
  lastError: string | null;
  activeModel: string | null;
}

export interface BootstrapState {
  workspacePath: string | null;
  codexBinaryPath: string | null;
  codexHomePath: string | null;
  defaultModel: string | null;
  previewCommand: string | null;
  codexStatus: CodexStatus;
  preview: PreviewState;
  session: SessionState;
}

export interface WorkspaceSelection {
  workspacePath: string | null;
}

export interface CodexSettingsInput {
  codexBinaryPath?: string | null;
  codexHomePath?: string | null;
  defaultModel?: string | null;
  previewCommand?: string | null;
}

export interface TurnAck {
  accepted: boolean;
  turnId: string | null;
  message: string | null;
}

export interface ChatMessage {
  id: string;
  kind: "user" | "assistant" | "system" | "error" | "changeSummary";
  text: string;
  createdAt: string;
  turnId?: string;
  pending?: boolean;
  changeSummary?: ChangeSummary;
}

export interface CodexEventEnvelope {
  id: string;
  method: string;
  message: string | null;
  delta: string | null;
  status: string | null;
  turnId: string | null;
  threadId: string | null;
  activeModel: string | null;
  preview: PreviewState | null;
  changeSummary: ChangeSummary | null;
}

export interface PromptProfileSummary {
  stack: string[];
  design: string[];
}

export interface PromptRules {
  stack: string[];
  design: string[];
  delivery: string[];
}

export interface PromptProfile {
  id: string;
  label: string;
  version: string;
  summary: PromptProfileSummary;
  rules: PromptRules;
}
