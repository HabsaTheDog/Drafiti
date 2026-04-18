import type {
  BootstrapState,
  ChangeSummary,
  ChatMessage,
  CodexEventEnvelope,
  CodexStatus,
  PreviewState,
  SessionState,
} from "./types";

export interface AppState {
  bootstrapping: boolean;
  bootstrapError: string | null;
  workspacePath: string;
  codexBinaryPath: string;
  codexHomePath: string;
  defaultModel: string;
  previewCommand: string;
  codexStatus: CodexStatus | null;
  preview: PreviewState;
  session: SessionState;
  messages: ChatMessage[];
  changeSummaries: ChangeSummary[];
  latestChangeSummary: ChangeSummary | null;
  composer: string;
  pendingPrompt: string | null;
  selectedModel: string;
  activeView: "chat" | "preview";
  isConnecting: boolean;
  isRefreshingStatus: boolean;
  isSavingSettings: boolean;
  isSending: boolean;
  isSwitchingModel: boolean;
  settingsOpen: boolean;
}

export const disconnectedSession: SessionState = {
  connected: false,
  status: "disconnected",
  workspacePath: null,
  providerThreadId: null,
  activeTurnId: null,
  lastError: null,
  activeModel: null,
};

export const idlePreviewState: PreviewState = {
  status: "idle",
  workspacePath: null,
  command: null,
  url: null,
  lastError: null,
  pid: null,
  lastStartedAt: null,
  commandResolution: null,
};

export const initialState: AppState = {
  bootstrapping: true,
  bootstrapError: null,
  workspacePath: "",
  codexBinaryPath: "",
  codexHomePath: "",
  defaultModel: "",
  previewCommand: "",
  codexStatus: null,
  preview: idlePreviewState,
  session: disconnectedSession,
  messages: [],
  changeSummaries: [],
  latestChangeSummary: null,
  composer: "",
  pendingPrompt: null,
  selectedModel: "",
  activeView: "chat",
  isConnecting: false,
  isRefreshingStatus: false,
  isSavingSettings: false,
  isSending: false,
  isSwitchingModel: false,
  settingsOpen: false,
};

type SessionStatus = SessionState["status"];

type Action =
  | { type: "bootstrapResolved"; payload: BootstrapState }
  | { type: "bootstrapFailed"; error: string }
  | { type: "setWorkspacePath"; workspacePath: string }
  | { type: "setCodexBinaryPath"; codexBinaryPath: string }
  | { type: "setCodexHomePath"; codexHomePath: string }
  | { type: "setDefaultModel"; defaultModel: string }
  | { type: "setPreviewCommand"; previewCommand: string }
  | { type: "setSelectedModel"; selectedModel: string }
  | { type: "setComposer"; composer: string }
  | { type: "setActiveView"; activeView: AppState["activeView"] }
  | { type: "setSettingsOpen"; open: boolean }
  | { type: "setRefreshingStatus"; value: boolean }
  | { type: "setSavingSettings"; value: boolean }
  | { type: "setConnecting"; value: boolean }
  | { type: "setSending"; value: boolean }
  | { type: "setSwitchingModel"; value: boolean }
  | { type: "setPendingPrompt"; pendingPrompt: string | null }
  | { type: "replaceStatus"; status: CodexStatus }
  | { type: "replacePreview"; preview: PreviewState }
  | { type: "replaceSession"; session: SessionState }
  | { type: "commitSentPrompt"; text: string; turnId: string | null }
  | { type: "codexEvent"; event: CodexEventEnvelope }
  | { type: "resetTranscript" };

function makeMessage(
  kind: ChatMessage["kind"],
  text: string,
  extras?: Pick<ChatMessage, "turnId" | "pending" | "changeSummary">,
): ChatMessage {
  return {
    id: `${kind}:${crypto.randomUUID()}`,
    kind,
    text,
    createdAt: new Date().toISOString(),
    ...(extras?.turnId ? { turnId: extras.turnId } : {}),
    ...(extras?.pending !== undefined ? { pending: extras.pending } : {}),
    ...(extras?.changeSummary ? { changeSummary: extras.changeSummary } : {}),
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

function stripAnsi(text: string) {
  return text.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "");
}

function normalizeProcessStderr(message: string | null) {
  if (!message) {
    return null;
  }

  const normalized = stripAnsi(message).replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const lowered = normalized.toLowerCase();
  if (normalized === "Output:" || normalized.startsWith("Wall time:")) {
    return null;
  }

  if (normalized.includes("codex_core::tools::router") && normalized.includes("Exit code:")) {
    return null;
  }

  const lowSignalNpmPrefixes = [
    "npm error code ",
    "npm error path ",
    "npm error command ",
    "npm error a complete log of this run can be found in:",
    "npm err! code ",
    "npm err! path ",
    "npm err! command ",
    "npm err! a complete log of this run can be found in:",
  ];
  if (lowSignalNpmPrefixes.some((prefix) => lowered.startsWith(prefix))) {
    return null;
  }

  if (
    lowered.startsWith("loading project files:") ||
    lowered.includes("downloading and extracting the project files") ||
    lowered.includes("cannot read properties of undefined (reading 'match')")
  ) {
    return null;
  }

  return normalized;
}

function appendUniqueMessage(state: AppState, message: ChatMessage): AppState {
  const lastMessage = state.messages.at(-1);
  if (
    lastMessage &&
    lastMessage.kind === message.kind &&
    lastMessage.text === message.text &&
    lastMessage.turnId === message.turnId
  ) {
    return state;
  }

  return appendMessage(state, message);
}

function appendChangeSummary(state: AppState, summary: ChangeSummary): AppState {
  return {
    ...state,
    changeSummaries: [...state.changeSummaries, summary],
    latestChangeSummary: summary,
    messages: [
      ...state.messages,
      makeMessage("changeSummary", summary.summary, { changeSummary: summary }),
    ],
  };
}

export function reduceCodexEvent(state: AppState, event: CodexEventEnvelope): AppState {
  switch (event.method) {
    case "session/connecting":
      return appendMessage(
        {
          ...state,
          isConnecting: false,
          session: {
            ...state.session,
            connected: true,
            status: "connecting",
          },
        },
        makeMessage("system", event.message ?? "Starting Codex app-server."),
      );
    case "session/ready":
      return appendMessage(
        {
          ...state,
          isSwitchingModel: false,
          session: {
            ...state.session,
            connected: true,
            status: "ready",
            lastError: null,
            activeModel: event.activeModel ?? state.session.activeModel,
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
          isSwitchingModel: false,
          pendingPrompt: null,
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
        isSwitchingModel: false,
        pendingPrompt: null,
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
      const nextSessionStatus: SessionStatus = event.status === "failed" ? "error" : "ready";
      const completionMessage =
        event.status === "interrupted"
          ? "Turn interrupted."
          : event.status === "failed"
            ? event.message ?? "Turn failed."
            : null;
      const nextState = {
        ...state,
        isSending: false,
        isSwitchingModel: false,
        pendingPrompt: null,
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
    case "preview/state":
      return {
        ...state,
        preview: event.preview ?? state.preview,
      };
    case "workspace/changes":
      return event.changeSummary ? appendChangeSummary(state, event.changeSummary) : state;
    case "process/stderr":
      {
        const normalizedMessage = normalizeProcessStderr(event.message);
        if (!normalizedMessage) {
          return state;
        }
        return appendUniqueMessage(
          state,
          makeMessage("error", normalizedMessage, event.turnId ? { turnId: event.turnId } : undefined),
        );
      }
    case "error":
      return appendUniqueMessage(
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
        defaultModel: action.payload.defaultModel ?? "",
        previewCommand: action.payload.previewCommand ?? "",
        codexStatus: action.payload.codexStatus,
        preview: action.payload.preview,
        session: action.payload.session,
        selectedModel:
          action.payload.session.activeModel ?? action.payload.defaultModel ?? state.selectedModel,
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
    case "setDefaultModel":
      return {
        ...state,
        defaultModel: action.defaultModel,
      };
    case "setPreviewCommand":
      return {
        ...state,
        previewCommand: action.previewCommand,
      };
    case "setSelectedModel":
      return {
        ...state,
        selectedModel: action.selectedModel,
      };
    case "setComposer":
      return {
        ...state,
        composer: action.composer,
      };
    case "setActiveView":
      return {
        ...state,
        activeView: action.activeView,
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
    case "setSwitchingModel":
      return {
        ...state,
        isSwitchingModel: action.value,
      };
    case "setPendingPrompt":
      return {
        ...state,
        pendingPrompt: action.pendingPrompt,
      };
    case "replaceStatus":
      return {
        ...state,
        codexStatus: action.status,
      };
    case "replacePreview":
      return {
        ...state,
        preview: action.preview,
      };
    case "replaceSession":
      return {
        ...state,
        isConnecting: false,
        isSending: false,
        isSwitchingModel: false,
        pendingPrompt: null,
        session: action.session,
        selectedModel: action.session.activeModel ?? state.selectedModel,
      };
    case "commitSentPrompt":
      return {
        ...state,
        composer: "",
        pendingPrompt: null,
        messages: [
          ...state.messages,
          makeMessage(
            "user",
            action.text,
            action.turnId ? { turnId: action.turnId } : undefined,
          ),
        ],
      };
    case "codexEvent":
      return reduceCodexEvent(state, action.event);
    case "resetTranscript":
      return {
        ...state,
        messages: [],
        changeSummaries: [],
        latestChangeSummary: null,
        composer: "",
        pendingPrompt: null,
      };
    default:
      return state;
  }
}
