export type CodexStatusKind = "ready" | "unauthenticated" | "notInstalled" | "error";
export type SessionStatus = "disconnected" | "connecting" | "ready" | "running" | "error";

export interface CodexStatus {
  status: CodexStatusKind;
  version: string | null;
  message: string;
  binaryPath: string;
  homePath: string | null;
}

export interface SessionState {
  connected: boolean;
  status: SessionStatus;
  workspacePath: string | null;
  providerThreadId: string | null;
  activeTurnId: string | null;
  lastError: string | null;
}

export interface BootstrapState {
  workspacePath: string | null;
  codexBinaryPath: string | null;
  codexHomePath: string | null;
  codexStatus: CodexStatus;
  session: SessionState;
}

export interface WorkspaceSelection {
  workspacePath: string | null;
}

export interface CodexSettingsInput {
  codexBinaryPath?: string | null;
  codexHomePath?: string | null;
}

export interface TurnAck {
  accepted: boolean;
  turnId: string | null;
  message: string | null;
}

export interface ChatMessage {
  id: string;
  kind: "user" | "assistant" | "system" | "error";
  text: string;
  createdAt: string;
  turnId?: string;
  pending?: boolean;
}

export interface CodexEventEnvelope {
  id: string;
  method: string;
  message: string | null;
  delta: string | null;
  status: string | null;
  turnId: string | null;
  threadId: string | null;
}
