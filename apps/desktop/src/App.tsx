import { useEffect, useMemo, useReducer, useRef } from "react";

import {
  disconnectedSession,
  initialState,
  reducer,
} from "./reducer";
import { desktopApi } from "./tauri";
import type { ChatMessage } from "./types";

function statusTone(status: string) {
  switch (status) {
    case "ready":
      return "border-signal-500/40 bg-signal-500/12 text-signal-400";
    case "running":
      return "border-sky-400/40 bg-sky-400/12 text-sky-400";
    case "unauthenticated":
    case "notInstalled":
    case "error":
      return "border-flare-500/40 bg-flare-500/10 text-flare-400";
    default:
      return "border-sand-300/14 bg-white/5 text-sand-200";
  }
}

function messageTone(message: ChatMessage) {
  switch (message.kind) {
    case "user":
      return "ml-auto border-sky-400/30 bg-sky-400/10";
    case "assistant":
      return "mr-auto border-white/10 bg-white/6";
    case "error":
      return "mr-auto border-flare-500/30 bg-flare-500/10";
    default:
      return "mx-auto border-sand-300/12 bg-ink-700/50";
  }
}

function statusInstruction(status: string) {
  if (status === "notInstalled") {
    return "Install the Codex CLI, then refresh status.";
  }
  if (status === "unauthenticated") {
    return "Run `codex` or `codex login`, finish the CLI auth flow, then refresh.";
  }
  if (status === "error") {
    return "Check the configured binary path or CODEX_HOME, then refresh.";
  }
  return "Pick a workspace folder and connect when you are ready.";
}

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

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

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

  const statusBadge = useMemo(() => {
    if (!state.codexStatus) {
      return "Checking";
    }
    return state.codexStatus.status === "notInstalled"
      ? "Not installed"
      : state.codexStatus.status === "unauthenticated"
        ? "Unauthenticated"
        : state.codexStatus.status.charAt(0).toUpperCase() + state.codexStatus.status.slice(1);
  }, [state.codexStatus]);

  function pushLocalError(message: string) {
    dispatch({
      type: "codexEvent",
      event: {
        id: crypto.randomUUID(),
        method: "session/error",
        message,
        delta: null,
        status: "error",
        turnId: null,
        threadId: null,
      },
    });
  }

  async function handlePickWorkspace() {
    try {
      const result = await desktopApi.pickWorkspace();
      dispatch({ type: "setWorkspacePath", workspacePath: result.workspacePath ?? "" });
      dispatch({ type: "replaceSession", session: disconnectedSession });
      dispatch({ type: "resetTranscript" });
    } catch (error) {
      pushLocalError(describeError(error, "Could not pick a workspace folder."));
    }
  }

  async function handleRefreshStatus() {
    dispatch({ type: "setRefreshingStatus", value: true });
    try {
      const status = await desktopApi.refreshCodexStatus();
      dispatch({ type: "replaceStatus", status });
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
      });
      dispatch({ type: "bootstrapResolved", payload: bootstrapState });
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
      const session = await desktopApi.connectCodex(state.workspacePath.trim());
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

    dispatch({ type: "appendUserMessage", text });
    dispatch({ type: "setSending", value: true });

    try {
      const ack = await desktopApi.sendTurn(text);
      if (!ack.accepted) {
        throw new Error(ack.message ?? "Codex rejected the turn.");
      }
      dispatch({ type: "createAssistantDraft", turnId: ack.turnId });
    } catch (error) {
      dispatch({ type: "setSending", value: false });
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
        },
      });
    } catch (error) {
      pushLocalError(describeError(error, "Could not interrupt the active turn."));
    }
  }

  return (
    <main className="min-h-screen bg-transparent text-sand-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <section className="rounded-[32px] border border-white/8 bg-ink-900/70 shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur-xl">
          <header className="border-b border-white/8 px-5 py-5 sm:px-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-flare-500/30 bg-flare-500/12 font-mono text-sm tracking-[0.2em] text-flare-400">
                    DR
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-[0.36em] text-sand-300/55">
                      Codex desktop shell
                    </p>
                    <h1 className="font-serif text-3xl leading-none text-sand-100">
                      Draffiti
                    </h1>
                  </div>
                </div>
                <p className="max-w-2xl text-sm leading-6 text-sand-200/78">
                  Bare-minimum agent chat for a picked local folder. Codex owns auth and execution;
                  Draffiti owns the desktop workflow and the transcript.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${statusTone(
                    state.codexStatus?.status ?? "checking",
                  )}`}
                >
                  <span className="h-2 w-2 rounded-full bg-current" />
                  {statusBadge}
                </span>
                <button
                  type="button"
                  className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-sand-100 transition hover:bg-white/8"
                  onClick={handleRefreshStatus}
                  disabled={state.isRefreshingStatus}
                >
                  {state.isRefreshingStatus ? "Refreshing..." : "Refresh status"}
                </button>
                <details
                  className="group rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-sand-100"
                  open={state.settingsOpen}
                  onToggle={(event) =>
                    dispatch({
                      type: "setSettingsOpen",
                      open: (event.currentTarget as HTMLDetailsElement).open,
                    })
                  }
                >
                  <summary className="list-none select-none">Settings</summary>
                  <div className="absolute right-8 top-24 z-20 mt-3 w-[min(28rem,calc(100vw-3rem))] rounded-3xl border border-white/10 bg-ink-900/96 p-5 shadow-2xl">
                    <div className="space-y-4">
                      <div>
                        <label className="mb-1 block text-xs uppercase tracking-[0.24em] text-sand-300/58">
                          Codex binary path
                        </label>
                        <input
                          value={state.codexBinaryPath}
                          onChange={(event) =>
                            dispatch({
                              type: "setCodexBinaryPath",
                              codexBinaryPath: event.target.value,
                            })
                          }
                          placeholder="codex"
                          className="w-full rounded-2xl border border-white/10 bg-black/16 px-4 py-3 text-sm outline-none transition focus:border-sky-400/50"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs uppercase tracking-[0.24em] text-sand-300/58">
                          CODEX_HOME
                        </label>
                        <input
                          value={state.codexHomePath}
                          onChange={(event) =>
                            dispatch({
                              type: "setCodexHomePath",
                              codexHomePath: event.target.value,
                            })
                          }
                          placeholder="Optional custom config directory"
                          className="w-full rounded-2xl border border-white/10 bg-black/16 px-4 py-3 text-sm outline-none transition focus:border-sky-400/50"
                        />
                      </div>
                      <button
                        type="button"
                        className="w-full rounded-2xl bg-sand-100 px-4 py-3 text-sm font-semibold text-ink-950 transition hover:bg-sand-200"
                        onClick={handleSaveSettings}
                        disabled={state.isSavingSettings}
                      >
                        {state.isSavingSettings ? "Saving..." : "Save Codex settings"}
                      </button>
                    </div>
                  </div>
                </details>
              </div>
            </div>
          </header>

          <div className="grid gap-0 lg:grid-cols-[24rem_minmax(0,1fr)]">
            <aside className="border-b border-white/8 px-5 py-5 lg:border-b-0 lg:border-r lg:px-7">
              <div className="space-y-5">
                <div className="rounded-[28px] border border-white/8 bg-white/4 p-4">
                  <p className="text-xs uppercase tracking-[0.28em] text-sand-300/52">
                    Workspace
                  </p>
                  <div className="mt-3 space-y-3">
                    <div className="rounded-2xl border border-white/8 bg-black/12 px-4 py-3 text-sm text-sand-200/80">
                      {state.workspacePath || "No folder selected"}
                    </div>
                    <button
                      type="button"
                      className="w-full rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm transition hover:bg-white/8"
                      onClick={handlePickWorkspace}
                    >
                      Pick folder
                    </button>
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/8 bg-white/4 p-4">
                  <p className="text-xs uppercase tracking-[0.28em] text-sand-300/52">
                    Codex health
                  </p>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-sand-200/78">
                    <p>{state.codexStatus?.message ?? "Checking Codex CLI health."}</p>
                    {state.codexStatus?.version ? (
                      <p className="text-sand-300/56">Version {state.codexStatus.version}</p>
                    ) : null}
                    <p className="text-sand-300/56">
                      {statusInstruction(state.codexStatus?.status ?? "checking")}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {!state.session.connected ? (
                    <button
                      type="button"
                      className="rounded-2xl bg-sand-100 px-4 py-3 text-sm font-semibold text-ink-950 transition hover:bg-sand-200 disabled:cursor-not-allowed disabled:bg-sand-100/30 disabled:text-sand-300/45"
                      onClick={handleConnect}
                      disabled={!canConnect}
                    >
                      {state.isConnecting ? "Connecting..." : "Connect to Codex"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded-2xl border border-white/12 bg-white/4 px-4 py-3 text-sm transition hover:bg-white/8"
                      onClick={handleDisconnect}
                    >
                      Disconnect
                    </button>
                  )}
                  <div className="rounded-2xl border border-white/8 bg-black/12 px-4 py-3 text-sm text-sand-300/62">
                    Session state:{" "}
                    <span className="font-medium text-sand-100">{state.session.status}</span>
                  </div>
                </div>
              </div>
            </aside>

            <section className="flex min-h-[74vh] flex-col">
              <div
                ref={transcriptRef}
                className="scrollbar-subtle flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-7"
              >
                {state.bootstrapping ? (
                  <div className="rounded-[28px] border border-white/8 bg-white/4 p-6 text-sm text-sand-200/72">
                    Loading Draffiti desktop shell...
                  </div>
                ) : state.bootstrapError ? (
                  <div className="rounded-[28px] border border-flare-500/25 bg-flare-500/10 p-6 text-sm text-flare-400">
                    {state.bootstrapError}
                  </div>
                ) : state.messages.length === 0 ? (
                  <div className="flex min-h-[24rem] items-center justify-center">
                    <div className="max-w-lg rounded-[32px] border border-dashed border-white/10 bg-white/3 p-10 text-center">
                      <p className="text-xs uppercase tracking-[0.36em] text-sand-300/42">
                        Transcript empty
                      </p>
                      <h2 className="mt-3 font-serif text-3xl text-sand-100">
                        Start with a real folder and a real prompt.
                      </h2>
                      <p className="mt-3 text-sm leading-7 text-sand-200/72">
                        Draffiti keeps the first pass deliberately thin: one local workspace, one
                        Codex session, one streaming transcript.
                      </p>
                    </div>
                  </div>
                ) : (
                  state.messages.map((message) => (
                    <article
                      key={message.id}
                      className={`max-w-3xl rounded-[28px] border px-5 py-4 shadow-[0_14px_34px_rgba(0,0,0,0.18)] ${messageTone(message)}`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.24em] text-sand-300/52">
                        <span>{message.kind}</span>
                        {message.pending ? <span>streaming</span> : null}
                      </div>
                      <pre className="m-0 whitespace-pre-wrap break-words font-[inherit] text-sm leading-7 text-sand-100">
                        {message.text || (message.pending ? "..." : "")}
                      </pre>
                    </article>
                  ))
                )}
              </div>

              <footer className="border-t border-white/8 px-5 py-5 sm:px-7">
                <div className="rounded-[30px] border border-white/10 bg-ink-950/72 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <textarea
                    value={state.composer}
                    onChange={(event) =>
                      dispatch({ type: "setComposer", composer: event.target.value })
                    }
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && canSend) {
                        event.preventDefault();
                        void handleSend();
                      }
                    }}
                    disabled={!state.session.connected}
                    placeholder={
                      state.session.connected
                        ? "Describe what you want Codex to build or change..."
                        : "Connect to Codex to start chatting."
                    }
                    className="min-h-28 w-full resize-none bg-transparent text-sm leading-7 text-sand-100 outline-none placeholder:text-sand-300/35 disabled:cursor-not-allowed"
                  />
                  <div className="mt-4 flex flex-col gap-3 border-t border-white/8 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs uppercase tracking-[0.24em] text-sand-300/42">
                      Send with Ctrl/Cmd + Enter
                    </p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-45"
                        onClick={handleInterrupt}
                        disabled={!canInterrupt}
                      >
                        Stop
                      </button>
                      <button
                        type="button"
                        className="rounded-2xl bg-flare-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-flare-400 disabled:cursor-not-allowed disabled:bg-flare-500/35"
                        onClick={handleSend}
                        disabled={!canSend}
                      >
                        {state.isSending ? "Sending..." : "Send prompt"}
                      </button>
                    </div>
                  </div>
                </div>
              </footer>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
