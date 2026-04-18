import type { PreviewState } from "../types";

function tone(status: string) {
  switch (status) {
    case "ready":
      return "bg-signal-400";
    case "booting":
      return "bg-cyan-400 animate-status-pulse";
    case "crashed":
      return "bg-danger-400";
    default:
      return "bg-cloud-300/50";
  }
}

function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function workspaceLabel(workspacePath: string) {
  const parts = workspacePath.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? "No folder selected";
}

interface PreviewToolbarProps {
  workspacePath: string;
  preview: PreviewState;
  canStart: boolean;
  canRestart: boolean;
  onStart: () => void;
  onRestart: () => void;
  onStop: () => void;
  onOpen: () => void;
}

export function PreviewToolbar({
  workspacePath,
  preview,
  canStart,
  canRestart,
  onStart,
  onRestart,
  onStop,
  onOpen,
}: PreviewToolbarProps) {
  const workspaceName = workspaceLabel(workspacePath);
  const isRunning = preview.status === "ready" || preview.status === "booting";

  return (
    <div className="border-b border-white/[0.06] px-5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${tone(preview.status)}`}
            title={statusLabel(preview.status)}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-cloud-100">{workspaceName}</p>
            {preview.url ? (
              <p className="mt-0.5 truncate text-xs text-cloud-300/50">{preview.url}</p>
            ) : (
              <p className="mt-0.5 text-xs text-cloud-300/40">{statusLabel(preview.status)}</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {isRunning ? (
            <>
              <button
                type="button"
                className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-cloud-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40"
                onClick={onRestart}
                disabled={!canRestart}
              >
                Restart
              </button>
              <button
                type="button"
                className="rounded-xl border border-danger-400/20 bg-danger-400/[0.08] px-3 py-2 text-sm text-danger-400 transition hover:bg-danger-400/[0.14]"
                onClick={onStop}
              >
                Stop
              </button>
            </>
          ) : (
            <button
              type="button"
              className="bg-brand-gradient rounded-xl px-3 py-2 text-sm font-semibold text-ink-950 transition disabled:cursor-not-allowed disabled:opacity-40"
              onClick={onStart}
              disabled={!canStart}
            >
              Start
            </button>
          )}
          <button
            type="button"
            className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-cloud-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40"
            onClick={onOpen}
            disabled={!preview.url}
          >
            Open in browser
          </button>
        </div>
      </div>
    </div>
  );
}
