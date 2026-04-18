import type { ChangeSummary, PreviewViewportMode } from "../types";
import { PreviewViewportTabs } from "./PreviewViewportTabs";

function formatCapturedAt(value: string) {
  const numeric = Number(value);
  const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Pending";
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface PreviewFooterSummaryProps {
  summary: ChangeSummary | null;
  previewViewportMode: PreviewViewportMode;
  onPreviewViewportModeChange: (mode: PreviewViewportMode) => void;
}

export function PreviewFooterSummary({
  summary,
  previewViewportMode,
  onPreviewViewportModeChange,
}: PreviewFooterSummaryProps) {
  return (
    <div className="shrink-0 border-t border-white/8 px-5 py-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <PreviewViewportTabs
          previewViewportMode={previewViewportMode}
          onPreviewViewportModeChange={onPreviewViewportModeChange}
        />

        {summary ? (
          <div className="flex flex-col gap-3 xl:items-end">
            <div className="xl:text-right">
              <p className="text-[11px] uppercase tracking-[0.28em] text-sand-300/44">Latest prompt changes</p>
              <p className="mt-1 text-sm font-medium text-sand-100">{summary.summary}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-sand-200/78 xl:justify-end">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                Added {summary.added.length}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                Modified {summary.modified.length}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                Deleted {summary.deleted.length}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                {formatCapturedAt(summary.capturedAt)}
              </span>
              {summary.changedFiles.slice(0, 2).map((path) => (
                <span
                  key={path}
                  className="rounded-full border border-amber-400/20 bg-amber-300/10 px-3 py-1.5"
                >
                  {path}
                </span>
              ))}
              <div className="group relative">
                <button
                  type="button"
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sand-100 transition hover:bg-white/8"
                >
                  View changes
                </button>
                <div className="pointer-events-none absolute bottom-[calc(100%+0.75rem)] right-0 z-20 hidden w-[22rem] rounded-3xl border border-white/10 bg-ink-950/98 p-4 text-left shadow-2xl group-hover:block group-focus-within:block">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-sand-300/44">
                    Changed files
                  </p>
                  <div className="mt-3 space-y-3">
                    {summary.added.length > 0 ? (
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-signal-400">
                          Added
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {summary.added.map((path) => (
                            <span
                              key={`added:${path}`}
                              className="rounded-full border border-signal-500/22 bg-signal-500/12 px-3 py-1.5 text-xs text-sand-100"
                            >
                              {path}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {summary.modified.length > 0 ? (
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-sky-300">
                          Modified
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {summary.modified.map((path) => (
                            <span
                              key={`modified:${path}`}
                              className="rounded-full border border-sky-400/22 bg-sky-400/12 px-3 py-1.5 text-xs text-sand-100"
                            >
                              {path}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {summary.deleted.length > 0 ? (
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-flare-400">
                          Deleted
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {summary.deleted.map((path) => (
                            <span
                              key={`deleted:${path}`}
                              className="rounded-full border border-flare-500/22 bg-flare-500/12 px-3 py-1.5 text-xs text-sand-100"
                            >
                              {path}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-sand-200/62 xl:text-right">
            Send a prompt to see a compact summary of what changed between runs.
          </div>
        )}
      </div>
    </div>
  );
}
