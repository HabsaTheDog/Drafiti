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
    <div className="shrink-0 border-t border-white/[0.06] px-5 py-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <PreviewViewportTabs
          previewViewportMode={previewViewportMode}
          onPreviewViewportModeChange={onPreviewViewportModeChange}
        />

        {summary ? (
          <div className="flex items-center gap-3 xl:justify-end">
            <div className="xl:text-right">
              <p className="text-sm font-medium text-cloud-100 truncate max-w-xs">{summary.summary}</p>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-cloud-300/50 xl:justify-end">
                <span className="rounded-full border border-signal-500/20 bg-signal-500/10 px-2 py-0.5">
                  +{summary.added.length}
                </span>
                <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5">
                  ~{summary.modified.length}
                </span>
                <span className="rounded-full border border-danger-400/20 bg-danger-400/10 px-2 py-0.5">
                  -{summary.deleted.length}
                </span>
                <span className="text-cloud-300/40">
                  {formatCapturedAt(summary.capturedAt)}
                </span>
              </div>
            </div>
            {/* Expandable file list */}
            <details className="group relative">
              <summary className="cursor-pointer list-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs text-cloud-200 transition hover:bg-white/[0.06]">
                Files
              </summary>
              <div className="absolute bottom-[calc(100%+0.5rem)] right-0 z-20 w-[20rem] rounded-2xl border border-white/[0.08] bg-ink-950/98 p-4 shadow-2xl">
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-cloud-300/40">
                  Changed files
                </p>
                <div className="mt-2 space-y-2">
                  {summary.added.length > 0 ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-signal-400">Added</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {summary.added.map((path) => (
                          <span
                            key={`added:${path}`}
                            className="rounded-full border border-signal-500/18 bg-signal-500/10 px-2.5 py-1 text-xs text-cloud-100"
                          >
                            {path}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {summary.modified.length > 0 ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-400">Modified</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {summary.modified.map((path) => (
                          <span
                            key={`modified:${path}`}
                            className="rounded-full border border-cyan-400/18 bg-cyan-400/10 px-2.5 py-1 text-xs text-cloud-100"
                          >
                            {path}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {summary.deleted.length > 0 ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-danger-400">Deleted</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {summary.deleted.map((path) => (
                          <span
                            key={`deleted:${path}`}
                            className="rounded-full border border-danger-400/18 bg-danger-400/10 px-2.5 py-1 text-xs text-cloud-100"
                          >
                            {path}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </details>
          </div>
        ) : (
          <div className="text-xs text-cloud-300/40 xl:text-right">
            Send a prompt to see what changed.
          </div>
        )}
      </div>
    </div>
  );
}
