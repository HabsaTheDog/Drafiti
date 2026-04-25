import type { ChangeSummary } from "../types";

function formatCapturedAt(value: string) {
  const numeric = Number(value);
  const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChangeSummaryCard({ summary }: { summary: ChangeSummary }) {
  return (
    <article className="max-w-2xl rounded-2xl border border-purple-400/18 bg-purple-400/[0.07] px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-[10px] font-medium uppercase tracking-[0.18em] text-purple-300/60">
        <span>Changes</span>
        <span>{formatCapturedAt(summary.capturedAt)}</span>
      </div>
      <h3 className="text-sm font-semibold text-cloud-100">{summary.summary}</h3>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-cloud-200/70">
        <span className="rounded-full border border-signal-500/20 bg-signal-500/10 px-2.5 py-1">
          +{summary.added.length}
        </span>
        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1">
          ~{summary.modified.length}
        </span>
        <span className="rounded-full border border-danger-400/20 bg-danger-400/10 px-2.5 py-1">
          -{summary.deleted.length}
        </span>
      </div>
      {summary.changedFiles.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {summary.changedFiles.slice(0, 5).map((path) => (
            <span
              key={path}
              className="rounded-full border border-white/[0.08] bg-ink-800/60 px-2.5 py-1 text-xs text-cloud-200/70"
            >
              {path}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
