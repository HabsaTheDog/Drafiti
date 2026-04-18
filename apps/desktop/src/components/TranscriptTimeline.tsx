import type { RefObject } from "react";

import type { ChatMessage } from "../types";
import { ChangeSummaryCard } from "./ChangeSummaryCard";

import logoIcon from "../assets/draffiti-icon.png";

function tone(kind: ChatMessage["kind"]) {
  switch (kind) {
    case "user":
      return "ml-auto border-cyan-400/20 bg-cyan-400/[0.08]";
    case "assistant":
      return "mr-auto border-purple-400/16 bg-purple-400/[0.06]";
    case "error":
      return "mr-auto border-danger-400/24 bg-danger-400/[0.08]";
    case "system":
      return "mx-auto border-white/[0.06] bg-ink-700/40";
    default:
      return "border-purple-400/16 bg-purple-400/[0.06]";
  }
}

function kindLabel(kind: ChatMessage["kind"]) {
  switch (kind) {
    case "user":
      return "You";
    case "assistant":
      return "Codex";
    case "system":
      return "System";
    case "error":
      return "Error";
    default:
      return kind;
  }
}

interface TranscriptTimelineProps {
  bootstrapping: boolean;
  bootstrapError: string | null;
  messages: ChatMessage[];
  transcriptRef: RefObject<HTMLDivElement | null>;
}

export function TranscriptTimeline({
  bootstrapping,
  bootstrapError,
  messages,
  transcriptRef,
}: TranscriptTimelineProps) {
  const visibleMessages = messages.filter((message) => message.kind !== "error");
  const diagnostics = messages.filter((message) => message.kind === "error");

  return (
    <div ref={transcriptRef} className="scrollbar-subtle flex-1 space-y-3 overflow-y-auto px-4 py-4">
      {bootstrapping ? (
        <div className="animate-shimmer rounded-2xl border border-white/[0.06] p-5 text-sm text-cloud-200/70">
          Initializing Draffiti…
        </div>
      ) : bootstrapError ? (
        <div className="rounded-2xl border border-danger-400/20 bg-danger-400/[0.08] p-5 text-sm text-danger-400">
          {bootstrapError}
        </div>
      ) : visibleMessages.length === 0 ? (
        <div className="flex min-h-[18rem] items-center justify-center">
          <div className="max-w-sm rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-8 text-center">
            <img
              src={logoIcon}
              alt=""
              className="mx-auto mb-4 h-16 w-16 opacity-60"
            />
            <h2 className="text-gradient text-2xl font-bold">
              Prompt, watch, iterate.
            </h2>
            <p className="mt-3 text-sm leading-6 text-cloud-300/50">
              Pick a folder, connect Codex, and start building. The transcript will track every
              change.
            </p>
          </div>
        </div>
      ) : (
        visibleMessages.map((message) =>
          message.kind === "changeSummary" && message.changeSummary ? (
            <ChangeSummaryCard key={message.id} summary={message.changeSummary} />
          ) : (
            <article
              key={message.id}
              className={`max-w-2xl rounded-2xl border px-4 py-3 ${tone(message.kind)}`}
            >
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[10px] font-medium uppercase tracking-[0.18em] text-cloud-300/40">
                <span>{kindLabel(message.kind)}</span>
                {message.pending ? (
                  <span className="animate-status-pulse text-cyan-400/70">streaming</span>
                ) : null}
              </div>
              <pre className="m-0 whitespace-pre-wrap break-words font-[inherit] text-sm leading-6 text-cloud-100">
                {message.text || (message.pending ? "…" : "")}
              </pre>
            </article>
          ),
        )
      )}
      {diagnostics.length > 0 ? (
        <details className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <summary className="cursor-pointer list-none text-[10px] font-medium uppercase tracking-[0.18em] text-cloud-300/40">
            Diagnostics ({diagnostics.length})
          </summary>
          <div className="mt-3 space-y-2">
            {diagnostics.map((message) => (
              <article
                key={message.id}
                className="rounded-xl border border-danger-400/14 bg-danger-400/[0.06] px-3 py-2.5 text-sm text-danger-400/80"
              >
                <pre className="m-0 whitespace-pre-wrap break-words font-[inherit] leading-5">
                  {message.text}
                </pre>
              </article>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
