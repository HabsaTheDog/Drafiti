import type { CodexStatus, PromptProfile, SessionState } from "../types";

function tone(status: string) {
  switch (status) {
    case "ready":
      return "border-signal-500/35 bg-signal-500/12 text-signal-400";
    case "running":
    case "connecting":
      return "border-sky-400/35 bg-sky-400/12 text-sky-300";
    case "unauthenticated":
    case "notInstalled":
    case "error":
    case "disconnected":
      return "border-flare-500/35 bg-flare-500/12 text-flare-400";
    default:
      return "border-white/10 bg-white/6 text-sand-200";
  }
}

function label(status: string) {
  if (status === "notInstalled") {
    return "Not installed";
  }
  if (status === "unauthenticated") {
    return "Unauthenticated";
  }
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function workspaceLabel(workspacePath: string) {
  const parts = workspacePath.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? "Choose folder";
}

interface CodexHeaderProps {
  workspacePath: string;
  codexStatus: CodexStatus | null;
  session: SessionState;
  selectedModel: string;
  buildProfile: PromptProfile;
  buildProfileHighlights: string[];
  onPickWorkspace: () => void;
  onRefreshStatus: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  isConnecting: boolean;
  isRefreshingStatus: boolean;
  canConnect: boolean;
}

export function CodexHeader({
  workspacePath,
  codexStatus,
  session,
  selectedModel,
  buildProfile,
  buildProfileHighlights,
  onPickWorkspace,
  onRefreshStatus,
  onConnect,
  onDisconnect,
  isConnecting,
  isRefreshingStatus,
  canConnect,
}: CodexHeaderProps) {
  const workspaceName = workspaceLabel(workspacePath);

  return (
    <header className="border-b border-white/8 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-flare-500/28 bg-flare-500/14 font-mono text-sm tracking-[0.28em] text-flare-400">
            DR
          </span>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.36em] text-sand-300/48">
              Codex builder
            </p>
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate font-serif text-2xl text-sand-100">Draffiti</h1>
              {workspacePath ? (
                <span className="truncate rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-sand-200/74">
                  {workspaceName}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-sand-100 transition hover:bg-white/9"
            onClick={onPickWorkspace}
          >
            Change folder
          </button>
          {!session.connected ? (
            <button
              type="button"
              className="rounded-xl bg-sand-100 px-3 py-2 text-sm font-semibold text-ink-950 transition hover:bg-sand-200 disabled:cursor-not-allowed disabled:bg-sand-100/30 disabled:text-sand-300/45"
              onClick={onConnect}
              disabled={!canConnect}
            >
              {isConnecting ? "Connecting..." : "Connect"}
            </button>
          ) : (
            <button
              type="button"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-sand-100 transition hover:bg-white/9"
              onClick={onDisconnect}
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${tone(codexStatus?.status ?? "checking")}`}>
          <span className="h-2 w-2 rounded-full bg-current" />
          Codex {label(codexStatus?.status ?? "checking")}
        </span>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${tone(session.status)}`}>
          <span className="h-2 w-2 rounded-full bg-current" />
          Session {label(session.status)}
        </span>
        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-sand-200/78">
          Model {selectedModel || "Default"}
        </span>

        <details className="group relative">
          <summary className="list-none rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-sand-200/78 transition hover:bg-white/8">
            Info
          </summary>
          <div className="absolute left-0 top-[calc(100%+0.5rem)] z-20 w-[20rem] rounded-3xl border border-white/10 bg-ink-950/98 p-4 shadow-2xl">
            <div className="space-y-3 text-sm text-sand-200/74">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-sand-300/48">Workspace</p>
                <p className="mt-1 break-all text-sand-100">{workspacePath || "No folder selected"}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-sand-300/48">Codex</p>
                <p className="mt-1">{codexStatus?.message ?? "Checking Codex CLI health."}</p>
                {codexStatus?.version ? (
                  <p className="mt-1 text-xs uppercase tracking-[0.2em] text-sand-300/48">
                    Version {codexStatus.version}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-sand-100 transition hover:bg-white/8"
                onClick={onRefreshStatus}
                disabled={isRefreshingStatus}
              >
                {isRefreshingStatus ? "Refreshing..." : "Refresh status"}
              </button>
            </div>
          </div>
        </details>

        <details className="group relative">
          <summary className="list-none rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-sand-200/78 transition hover:bg-white/8">
            Policy
          </summary>
          <div className="absolute left-0 top-[calc(100%+0.5rem)] z-20 w-[22rem] rounded-3xl border border-white/10 bg-ink-950/98 p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-sand-100">{buildProfile.label}</p>
                <p className="mt-1 text-sm leading-6 text-sand-200/72">
                  Draffiti keeps the hidden build rules pinned for Codex while the chat stays
                  focused on your prompts.
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-black/18 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sand-300/54">
                {buildProfile.version}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {buildProfileHighlights.map((highlight) => (
                <span
                  key={highlight}
                  className="rounded-full border border-white/10 bg-black/18 px-3 py-1.5 text-xs text-sand-200/80"
                >
                  {highlight}
                </span>
              ))}
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}
