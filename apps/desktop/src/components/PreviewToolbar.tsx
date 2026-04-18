import type { PreviewState } from "../types";

function tone(status: string) {
  switch (status) {
    case "ready":
      return "border-signal-500/35 bg-signal-500/12 text-signal-400";
    case "booting":
      return "border-sky-400/35 bg-sky-400/12 text-sky-300";
    case "crashed":
      return "border-flare-500/35 bg-flare-500/12 text-flare-400";
    default:
      return "border-white/10 bg-white/6 text-sand-200";
  }
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

  return (
    <div className="border-b border-white/8 px-5 py-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${tone(preview.status)}`}>
              <span className="h-2 w-2 rounded-full bg-current" />
              {preview.status}
            </span>
            {preview.url ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-sand-200/78">
                {preview.url}
              </span>
            ) : null}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-sand-300/44">Preview</p>
            <p className="mt-1 text-sm text-sand-100">{workspaceName}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-45"
            onClick={onStart}
            disabled={!canStart}
          >
            Start
          </button>
          <button
            type="button"
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-45"
            onClick={onRestart}
            disabled={!canRestart}
          >
            Restart
          </button>
          <button
            type="button"
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm transition hover:bg-white/8"
            onClick={onStop}
          >
            Stop
          </button>
          <button
            type="button"
            className="rounded-2xl bg-sand-100 px-4 py-3 text-sm font-semibold text-ink-950 transition hover:bg-sand-200 disabled:cursor-not-allowed disabled:bg-sand-100/35"
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
