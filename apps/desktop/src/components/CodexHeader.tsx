import type { CodexStatus, SessionState } from "../types";

import logoIcon from "../assets/draffiti-icon.png";

function combinedStatusTone(codexStatus: CodexStatus | null, session: SessionState) {
  if (session.connected && session.status === "running") {
    return { color: "bg-cyan-400", label: "Building", pulse: true };
  }
  if (session.connected && session.status === "ready") {
    return { color: "bg-signal-400", label: "Connected", pulse: false };
  }
  if (session.status === "connecting" || session.status === "error") {
    return {
      color: session.status === "error" ? "bg-danger-400" : "bg-cyan-400",
      label: session.status === "error" ? "Session error" : "Connecting",
      pulse: session.status !== "error",
    };
  }
  if (codexStatus?.status === "ready") {
    return { color: "bg-signal-400", label: "Codex ready", pulse: false };
  }
  if (codexStatus?.status === "notInstalled" || codexStatus?.status === "unauthenticated") {
    return {
      color: "bg-danger-400",
      label: codexStatus.status === "notInstalled" ? "Not installed" : "Unauthenticated",
      pulse: false,
    };
  }
  if (codexStatus?.status === "error") {
    return { color: "bg-danger-400", label: "Codex error", pulse: false };
  }
  return { color: "bg-cloud-300", label: "Checking…", pulse: true };
}

function workspaceLabel(workspacePath: string) {
  const parts = workspacePath.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? "Choose folder";
}

interface CodexHeaderProps {
  workspacePath: string;
  codexStatus: CodexStatus | null;
  session: SessionState;
  onPickWorkspace: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  isConnecting: boolean;
  canConnect: boolean;
}

export function CodexHeader({
  workspacePath,
  codexStatus,
  session,
  onPickWorkspace,
  onConnect,
  onDisconnect,
  isConnecting,
  canConnect,
}: CodexHeaderProps) {
  const workspaceName = workspaceLabel(workspacePath);
  const status = combinedStatusTone(codexStatus, session);

  return (
    <header className="border-b border-white/[0.06] px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        {/* Logo + brand + workspace */}
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={logoIcon}
            alt="Draffiti"
            className="h-10 w-10 shrink-0 rounded-xl object-contain"
          />
          <div className="min-w-0">
            <h1 className="text-gradient text-xl font-bold tracking-tight">Draffiti</h1>
            {workspacePath ? (
              <p className="mt-0.5 flex items-center gap-2 text-xs text-cloud-300/70">
                <span className="truncate max-w-[10rem]">{workspaceName}</span>
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-cloud-300/50">No folder selected</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-cloud-100 transition hover:bg-white/[0.08]"
            onClick={onPickWorkspace}
          >
            Change folder
          </button>
          {!session.connected ? (
            <button
              type="button"
              className="bg-brand-gradient rounded-xl px-3 py-2 text-sm font-semibold text-ink-950 transition disabled:cursor-not-allowed disabled:opacity-40"
              onClick={onConnect}
              disabled={!canConnect}
            >
              {isConnecting ? "Connecting…" : "Connect"}
            </button>
          ) : (
            <button
              type="button"
              className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-cloud-100 transition hover:bg-white/[0.08]"
              onClick={onDisconnect}
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Combined status indicator */}
      <div className="mt-3 flex items-center gap-2" title={status.label}>
        <span
          className={`inline-block h-2 w-2 rounded-full ${status.color} ${status.pulse ? "animate-status-pulse" : ""}`}
        />
        <span className="text-xs text-cloud-300/60">{status.label}</span>
      </div>
    </header>
  );
}
