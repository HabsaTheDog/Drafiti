import { useEffect, useMemo, useReducer, useRef } from "react";

import { CodexSidebar } from "./components/CodexSidebar";
import { PreviewWorkspace } from "./components/PreviewWorkspace";
import { ShellLayout } from "./components/ShellLayout";
import { disconnectedSession, initialState, reducer } from "./reducer";
import { buildProfileHighlights, codexBuildProfile } from "./promptProfile";
import { desktopApi } from "./tauri";

const MODEL_SUGGESTIONS = ["gpt-5.4", "gpt-5.3-codex", "gpt-5.2", "o4-mini"];

function describeError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }
  return fallback;
}

function normalizedModel(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const autoStartedWorkspaceRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    void desktopApi
      .bootstrap()
      .then((bootstrapState) => {
        if (active) {
          dispatch({ type: "bootstrapResolved", payload: bootstrapState });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          dispatch({
            type: "bootstrapFailed",
            error: describeError(error, "Failed to bootstrap Draffiti."),
          });
        }
      });

    void desktopApi
      .listenCodexEvents((event) => {
        if (active) {
          dispatch({ type: "codexEvent", event });
        }
      })
      .then((cleanup) => {
        unlisten = cleanup;
      })
      .catch((error: unknown) => {
        if (active) {
          dispatch({
            type: "bootstrapFailed",
            error: describeError(error, "Failed to subscribe to Codex events."),
          });
        }
      });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const node = transcriptRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [state.messages]);

  useEffect(() => {
    if (
      state.bootstrapping ||
      !state.workspacePath ||
      state.preview.workspacePath !== state.workspacePath ||
      state.preview.status !== "idle" ||
      !state.preview.command ||
      autoStartedWorkspaceRef.current === state.workspacePath
    ) {
      return;
    }

    autoStartedWorkspaceRef.current = state.workspacePath;
    void desktopApi
      .startPreview()
      .then((preview) => {
        dispatch({ type: "replacePreview", preview });
      })
      .catch((error: unknown) => {
        pushLocalError(describeError(error, "Could not start the preview."));
      });
  }, [
    state.bootstrapping,
    state.preview.command,
    state.preview.status,
    state.preview.workspacePath,
    state.workspacePath,
  ]);

  const resolvedModel = useMemo(
    () => normalizedModel(state.selectedModel) ?? normalizedModel(state.defaultModel),
    [state.defaultModel, state.selectedModel],
  );
  const canConnect =
    !state.isConnecting &&
    !state.session.connected &&
    state.workspacePath.trim().length > 0 &&
    state.codexStatus?.status === "ready";
  const canSend =
    state.session.connected &&
    state.session.status !== "connecting" &&
    state.session.status !== "error" &&
    !state.isSending &&
    state.composer.trim().length > 0;
  const canInterrupt = state.session.connected && state.session.status === "running";
  const canStartPreview =
    state.workspacePath.trim().length > 0 &&
    state.preview.command !== null &&
    state.preview.status !== "booting";
  const canRestartPreview =
    state.workspacePath.trim().length > 0 &&
    (state.preview.command !== null || state.preview.commandResolution?.source === "manual");

  function pushLocalError(message: string) {
    dispatch({
      type: "codexEvent",
      event: {
        id: crypto.randomUUID(),
        method: "error",
        message,
        delta: null,
        status: "error",
        turnId: null,
        threadId: null,
        activeModel: null,
        preview: null,
        changeSummary: null,
      },
    });
  }

  async function refreshPreviewState() {
    try {
      const preview = await desktopApi.refreshPreviewState();
      dispatch({ type: "replacePreview", preview });
      return preview;
    } catch (error) {
      pushLocalError(describeError(error, "Could not refresh preview state."));
      return null;
    }
  }

  async function handlePickWorkspace() {
    try {
      const result = await desktopApi.pickWorkspace();
      dispatch({ type: "setWorkspacePath", workspacePath: result.workspacePath ?? "" });
      dispatch({ type: "replaceSession", session: disconnectedSession });
      dispatch({ type: "resetTranscript" });
      autoStartedWorkspaceRef.current = null;
      await refreshPreviewState();
      dispatch({ type: "setActiveView", activeView: "preview" });
    } catch (error) {
      pushLocalError(describeError(error, "Could not pick a workspace folder."));
    }
  }

  async function handleRefreshStatus() {
    dispatch({ type: "setRefreshingStatus", value: true });
    try {
      const status = await desktopApi.refreshCodexStatus();
      dispatch({ type: "replaceStatus", status });
      await refreshPreviewState();
    } catch (error) {
      pushLocalError(describeError(error, "Could not refresh Codex status."));
    } finally {
      dispatch({ type: "setRefreshingStatus", value: false });
    }
  }

  async function handleSaveSettings() {
    dispatch({ type: "setSavingSettings", value: true });
    try {
      const bootstrapState = await desktopApi.updateCodexSettings({
        codexBinaryPath: state.codexBinaryPath,
        codexHomePath: state.codexHomePath,
        defaultModel: state.defaultModel,
        previewCommand: state.previewCommand,
      });
      dispatch({ type: "bootstrapResolved", payload: bootstrapState });
      autoStartedWorkspaceRef.current = null;
    } catch (error) {
      pushLocalError(describeError(error, "Could not save Codex settings."));
    } finally {
      dispatch({ type: "setSavingSettings", value: false });
    }
  }

  async function handleConnect() {
    dispatch({ type: "setConnecting", value: true });
    dispatch({ type: "resetTranscript" });
    try {
      const session = await desktopApi.connectCodex(state.workspacePath.trim(), resolvedModel);
      dispatch({ type: "replaceSession", session });
    } catch (error) {
      pushLocalError(describeError(error, "Could not connect to Codex."));
    } finally {
      dispatch({ type: "setConnecting", value: false });
    }
  }

  async function handleDisconnect() {
    try {
      const session = await desktopApi.disconnectCodex();
      dispatch({ type: "replaceSession", session });
      dispatch({ type: "resetTranscript" });
    } catch (error) {
      pushLocalError(describeError(error, "Could not disconnect Codex."));
    }
  }

  async function handleSend() {
    const text = state.composer.trim();
    if (!text) {
      return;
    }

    dispatch({ type: "setSending", value: true });
    dispatch({ type: "setPendingPrompt", pendingPrompt: text });
    const willSwitchModel =
      state.session.connected &&
      normalizedModel(state.selectedModel) !== null &&
      normalizedModel(state.selectedModel) !== state.session.activeModel;
    if (willSwitchModel) {
      dispatch({ type: "setSwitchingModel", value: true });
    }

    try {
      const ack = await desktopApi.sendTurn(text, resolvedModel);
      if (!ack.accepted) {
        throw new Error(ack.message ?? "Codex rejected the turn.");
      }
      dispatch({ type: "commitSentPrompt", text, turnId: ack.turnId });
      dispatch({ type: "setSending", value: false });
    } catch (error) {
      dispatch({ type: "setSending", value: false });
      dispatch({ type: "setSwitchingModel", value: false });
      dispatch({ type: "setPendingPrompt", pendingPrompt: null });
      pushLocalError(describeError(error, "Could not send the turn."));
    }
  }

  async function handleInterrupt() {
    try {
      await desktopApi.interruptTurn();
      dispatch({
        type: "codexEvent",
        event: {
          id: crypto.randomUUID(),
          method: "turn/completed",
          message: "Interrupt requested.",
          delta: null,
          status: "interrupted",
          turnId: state.session.activeTurnId,
          threadId: state.session.providerThreadId,
          activeModel: state.session.activeModel,
          preview: null,
          changeSummary: null,
        },
      });
    } catch (error) {
      pushLocalError(describeError(error, "Could not interrupt the active turn."));
    }
  }

  async function handleStartPreview() {
    try {
      const preview = await desktopApi.startPreview();
      dispatch({ type: "replacePreview", preview });
    } catch (error) {
      pushLocalError(describeError(error, "Could not start the preview."));
    }
  }

  async function handleRestartPreview() {
    try {
      const preview = await desktopApi.restartPreview();
      dispatch({ type: "replacePreview", preview });
    } catch (error) {
      pushLocalError(describeError(error, "Could not restart the preview."));
    }
  }

  async function handleStopPreview() {
    try {
      const preview = await desktopApi.stopPreview();
      dispatch({ type: "replacePreview", preview });
    } catch (error) {
      pushLocalError(describeError(error, "Could not stop the preview."));
    }
  }

  function handleOpenPreview() {
    if (state.preview.url) {
      window.open(state.preview.url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <main className="h-screen overflow-hidden bg-transparent text-sand-100">
      <div className="mx-auto flex h-full max-w-[1800px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <ShellLayout
          activeView={state.activeView}
          onActiveViewChange={(activeView) => dispatch({ type: "setActiveView", activeView })}
          sidebar={
            <CodexSidebar
              bootstrapping={state.bootstrapping}
              bootstrapError={state.bootstrapError}
              workspacePath={state.workspacePath}
              codexStatus={state.codexStatus}
              session={state.session}
              messages={state.messages}
              transcriptRef={transcriptRef}
              composer={state.composer}
              selectedModel={state.selectedModel}
              defaultModel={state.defaultModel}
              codexBinaryPath={state.codexBinaryPath}
              codexHomePath={state.codexHomePath}
              previewCommand={state.previewCommand}
              settingsOpen={state.settingsOpen}
              isConnecting={state.isConnecting}
              isRefreshingStatus={state.isRefreshingStatus}
              isSavingSettings={state.isSavingSettings}
              isSending={state.isSending}
              isSwitchingModel={state.isSwitchingModel}
              canConnect={canConnect}
              canSend={canSend}
              canInterrupt={canInterrupt}
              modelSuggestions={MODEL_SUGGESTIONS}
              buildProfile={codexBuildProfile}
              buildProfileHighlights={buildProfileHighlights}
              onPickWorkspace={handlePickWorkspace}
              onRefreshStatus={handleRefreshStatus}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onSend={handleSend}
              onInterrupt={handleInterrupt}
              onComposerChange={(composer) => dispatch({ type: "setComposer", composer })}
              onSelectedModelChange={(selectedModel) =>
                dispatch({ type: "setSelectedModel", selectedModel })
              }
              onCodexBinaryPathChange={(codexBinaryPath) =>
                dispatch({ type: "setCodexBinaryPath", codexBinaryPath })
              }
              onCodexHomePathChange={(codexHomePath) =>
                dispatch({ type: "setCodexHomePath", codexHomePath })
              }
              onDefaultModelChange={(defaultModel) =>
                dispatch({ type: "setDefaultModel", defaultModel })
              }
              onPreviewCommandChange={(previewCommand) =>
                dispatch({ type: "setPreviewCommand", previewCommand })
              }
              onSettingsOpenChange={(open) => dispatch({ type: "setSettingsOpen", open })}
              onSaveSettings={handleSaveSettings}
            />
          }
          preview={
            <PreviewWorkspace
              workspacePath={state.workspacePath}
              preview={state.preview}
              latestChangeSummary={state.latestChangeSummary}
              canStart={canStartPreview}
              canRestart={canRestartPreview}
              onStart={handleStartPreview}
              onRestart={handleRestartPreview}
              onStop={handleStopPreview}
              onOpen={handleOpenPreview}
            />
          }
        />
      </div>
    </main>
  );
}
