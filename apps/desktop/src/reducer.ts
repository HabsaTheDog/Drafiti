import type {
  BootstrapState,
  ChatMessage,
  CodexEventEnvelope,
  CodexStatus,
  SessionState,
} from "./types";

export interface AppState {
  bootstrapping: boolean;
  bootstrapError: string | null;
  workspacePath: string;
  codexBinaryPath: string;
  codexHomePath: string;
  codexStatus: CodexStatus | null;
  session: SessionState;
  messages: ChatMessage[];
  composer: string;
  isConnecting: boolean;
  isRefreshingStatus: boolean;
  isSavingSettings: boolean;
  isSending: boolean;
  settingsOpen: boolean;
}

export const disconnectedSession: SessionState = {
  connected: false,
  status: "disconnected",
  workspacePath: null,
  providerThreadId: null,
  activeTurnId: null,
  lastError: null,
};

export const initialState: AppState = {
  bootstrapping: true,
  bootstrapError: null,
  workspacePath: "",
  codexBinaryPath: "",
  codexHomePath: "",
  codexStatus: null,
  session: disconnectedSession,
  messages: [],
  composer: "",
  isConnecting: false,
  isRefreshingStatus: false,
  isSavingSettings: false,
  isSending: false,
  settingsOpen: false,
};

type SessionStatus = SessionState["status"];

type Action =
  | { type: "bootstrapResolved"; payload: BootstrapState }
  | { type: "bootstrapFailed"; error: string }
  | { type: "setWorkspacePath"; workspacePath: string }
  | { type: "setCodexBinaryPath"; codexBinaryPath: string }
  | { type: "setCodexHomePath"; codexHomePath: string }
  | { type: "setComposer"; composer: string }
  | { type: "setSettingsOpen"; open: boolean }
  | { type: "setRefreshingStatus"; value: boolean }
  | { type: "setSavingSettings"; value: boolean }
  | { type: "setConnecting"; value: boolean }
  | { type: "setSending"; value: boolean }
  | { type: "replaceStatus"; status: CodexStatus }
  | { type: "replaceSession"; session: SessionState }
  | { type: "appendUserMessage"; text: string }
  | { type: "createAssistantDraft"; turnId: string | null }
  | { type: "codexEvent"; event: CodexEventEnvelope }
  | { type: "resetTranscript" };

function makeMessage(
  kind: ChatMessage["kind"],
  text: string,
  extras?: Pick<ChatMessage, "turnId" | "pending">,
): ChatMessage {
  return {
    id: `${kind}:${crypto.randomUUID()}`,
    kind,
    text,
    createdAt: new Date().toISOString(),
    ...(extras?.turnId ? { turnId: extras.turnId } : {}),
    ...(extras?.pending !== undefined ? { pending: extras.pending } : {}),
  };
}

function appendMessage(state: AppState, message: ChatMessage): AppState {
  return {
    ...state,
    messages: [...state.messages, message],
  };
}

function upsertAssistantDraft(messages: ChatMessage[], turnId: string | null): ChatMessage[] {
  if (!turnId) {
    return [...messages, makeMessage("assistant", "", { pending: true })];
  }

  const existingIndex = messages.findIndex(
    (message) => message.kind === "assistant" && message.turnId === turnId,
  );
  if (existingIndex >= 0) {
    return messages.map((message, index) =>
      index === existingIndex ? { ...message, pending: true } : message,
    );
  }

  return [...messages, makeMessage("assistant", "", { pending: true, turnId })];
}

function appendAssistantDelta(
  messages: ChatMessage[],
  turnId: string | null,
  delta: string,
): ChatMessage[] {
  const existingIndex = turnId
    ? messages.findIndex((message) => message.kind === "assistant" && message.turnId === turnId)
    : -1;

  if (existingIndex === -1) {
    return [
      ...messages,
      makeMessage("assistant", delta, {
        pending: true,
        ...(turnId ? { turnId } : {}),
      }),
    ];
  }

  return messages.map((message, index) =>
    index === existingIndex
      ? {
          ...message,
          text: `${message.text}${delta}`,
          pending: true,
        }
      : message,
  );
}

function finalizeAssistant(messages: ChatMessage[], turnId: string | null): ChatMessage[] {
  return messages.map((message) =>
    message.kind === "assistant" && (!turnId || message.turnId === turnId)
      ? { ...message, pending: false }
      : message,
  );
}

export function reduceCodexEvent(state: AppState, event: CodexEventEnvelope): AppState {
  switch (event.method) {
    case "session/connecting":
      return appendMessage(
        {
          ...state,
          isConnecting: false,
          session: { ...state.session, connected: true, status: "connecting" },
        },
        makeMessage("system", event.message ?? "Starting Codex app-server."),
      );
    case "session/ready":
      return appendMessage(
        {
          ...state,
          session: {
            ...state.session,
            connected: true,
            status: "ready",
            lastError: null,
            ...(event.threadId ? { providerThreadId: event.threadId } : {}),
          },
        },
        makeMessage("system", event.message ?? "Codex session ready."),
      );
    case "session/error":
      return appendMessage(
        {
          ...state,
          isConnecting: false,
          isSending: false,
          session: {
            ...state.session,
            connected: false,
            status: "error",
            activeTurnId: null,
            lastError: event.message ?? "Codex session error.",
          },
        },
        makeMessage("error", event.message ?? "Codex session error."),
      );
    case "thread/started":
      return {
        ...state,
        session: {
          ...state.session,
          connected: true,
          providerThreadId: event.threadId ?? state.session.providerThreadId,
        },
      };
    case "turn/started":
      return {
        ...state,
        isSending: false,
        session: {
          ...state.session,
          connected: true,
          status: "running",
          activeTurnId: event.turnId ?? state.session.activeTurnId,
        },
        messages: upsertAssistantDraft(state.messages, event.turnId),
      };
    case "item/agentMessage/delta":
      if (!event.delta) {
        return state;
      }
      return {
        ...state,
        messages: appendAssistantDelta(state.messages, event.turnId, event.delta),
      };
    case "turn/completed": {
      const nextSessionStatus: SessionStatus =
        event.status === "failed" ? "error" : "ready";
      const completionMessage =
        event.status === "interrupted"
          ? "Turn interrupted."
          : event.status === "failed"
            ? event.message ?? "Turn failed."
            : null;
      const nextState = {
        ...state,
        isSending: false,
        session: {
          ...state.session,
          connected: true,
          status: nextSessionStatus,
          activeTurnId: null,
          lastError: event.status === "failed" ? event.message : null,
        },
        messages: finalizeAssistant(state.messages, event.turnId),
      };
      return completionMessage
        ? appendMessage(
            nextState,
            makeMessage(event.status === "failed" ? "error" : "system", completionMessage),
          )
        : nextState;
    }
    case "process/stderr":
    case "error":
      return appendMessage(
        state,
        makeMessage("error", event.message ?? "Codex emitted an error notification."),
      );
    default:
      return state;
  }
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "bootstrapResolved":
      return {
        ...state,
        bootstrapping: false,
        bootstrapError: null,
        workspacePath: action.payload.workspacePath ?? "",
        codexBinaryPath: action.payload.codexBinaryPath ?? "",
        codexHomePath: action.payload.codexHomePath ?? "",
        codexStatus: action.payload.codexStatus,
        session: action.payload.session,
      };
    case "bootstrapFailed":
      return {
        ...state,
        bootstrapping: false,
        bootstrapError: action.error,
      };
    case "setWorkspacePath":
      return {
        ...state,
        workspacePath: action.workspacePath,
      };
    case "setCodexBinaryPath":
      return {
        ...state,
        codexBinaryPath: action.codexBinaryPath,
      };
    case "setCodexHomePath":
      return {
        ...state,
        codexHomePath: action.codexHomePath,
      };
    case "setComposer":
      return {
        ...state,
        composer: action.composer,
      };
    case "setSettingsOpen":
      return {
        ...state,
        settingsOpen: action.open,
      };
    case "setRefreshingStatus":
      return {
        ...state,
        isRefreshingStatus: action.value,
      };
    case "setSavingSettings":
      return {
        ...state,
        isSavingSettings: action.value,
      };
    case "setConnecting":
      return {
        ...state,
        isConnecting: action.value,
      };
    case "setSending":
      return {
        ...state,
        isSending: action.value,
      };
    case "replaceStatus":
      return {
        ...state,
        codexStatus: action.status,
      };
    case "replaceSession":
      return {
        ...state,
        isConnecting: false,
        isSending: false,
        session: action.session,
      };
    case "appendUserMessage":
      return {
        ...state,
        composer: "",
        messages: [...state.messages, makeMessage("user", action.text)],
      };
    case "createAssistantDraft":
      return {
        ...state,
        messages: upsertAssistantDraft(state.messages, action.turnId),
      };
    case "codexEvent":
      return reduceCodexEvent(state, action.event);
    case "resetTranscript":
      return {
        ...state,
        messages: [],
        composer: "",
      };
    default:
      return state;
  }
}
