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
    <article className="max-w-3xl rounded-[28px] border border-amber-400/24 bg-amber-300/10 px-5 py-4 shadow-[0_14px_34px_rgba(0,0,0,0.18)]">
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.24em] text-amber-100/72">
        <span>Changes</span>
        <span>{formatCapturedAt(summary.capturedAt)}</span>
      </div>
      <h3 className="text-base font-semibold text-sand-100">{summary.summary}</h3>
      <div className="mt-3 grid gap-2 text-sm text-sand-200/82 sm:grid-cols-3">
        <div>Added: {summary.added.length}</div>
        <div>Modified: {summary.modified.length}</div>
        <div>Deleted: {summary.deleted.length}</div>
      </div>
      {summary.changedFiles.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {summary.changedFiles.slice(0, 5).map((path) => (
            <span
              key={path}
              className="rounded-full border border-white/12 bg-black/18 px-3 py-1.5 text-xs text-sand-100"
            >
              {path}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
