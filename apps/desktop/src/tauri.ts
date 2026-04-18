import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type {
  BootstrapState,
  CodexEventEnvelope,
  CodexSettingsInput,
  CodexStatus,
  PreviewState,
  SessionState,
  TurnAck,
  WorkspaceSelection,
} from "./types";

const CODEX_EVENT_NAME = "codex-event";

function assertTauriAvailable() {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    throw new Error("Draffiti desktop commands are only available inside Tauri.");
  }
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  assertTauriAvailable();
  return invoke<T>(command, args);
}

export const desktopApi = {
  bootstrap: () => call<BootstrapState>("bootstrap"),
  pickWorkspace: () => call<WorkspaceSelection>("pick_workspace"),
  refreshCodexStatus: () => call<CodexStatus>("refresh_codex_status"),
  refreshPreviewState: () => call<PreviewState>("refresh_preview_state"),
  updateCodexSettings: (input: CodexSettingsInput) =>
    call<BootstrapState>("update_codex_settings", { input }),
  connectCodex: (workspacePath: string, model?: string | null) =>
    call<SessionState>("connect_codex", { input: { workspacePath, model } }),
  disconnectCodex: () => call<SessionState>("disconnect_codex"),
  startPreview: () => call<PreviewState>("start_preview"),
  stopPreview: () => call<PreviewState>("stop_preview"),
  restartPreview: () => call<PreviewState>("restart_preview"),
  sendTurn: (text: string, model?: string | null) =>
    call<TurnAck>("send_turn", { input: { text, model } }),
  interruptTurn: () => call<TurnAck>("interrupt_turn"),
  listenCodexEvents: async (
    handler: (event: CodexEventEnvelope) => void,
  ): Promise<UnlistenFn> => {
    assertTauriAvailable();
    return listen<CodexEventEnvelope>(CODEX_EVENT_NAME, (event) => handler(event.payload));
  },
};
