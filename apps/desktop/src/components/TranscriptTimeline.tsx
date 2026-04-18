import type { RefObject } from "react";

import type { ChatMessage } from "../types";
import { ChangeSummaryCard } from "./ChangeSummaryCard";

function tone(kind: ChatMessage["kind"]) {
  switch (kind) {
    case "user":
      return "ml-auto border-sky-400/28 bg-sky-400/12";
    case "assistant":
      return "mr-auto border-white/10 bg-white/6";
    case "error":
      return "mr-auto border-flare-500/28 bg-flare-500/12";
    case "system":
      return "mx-auto border-sand-300/10 bg-ink-700/50";
    default:
      return "border-amber-400/22 bg-amber-300/8";
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
  return (
    <div ref={transcriptRef} className="scrollbar-subtle flex-1 space-y-4 overflow-y-auto px-5 py-5">
      {bootstrapping ? (
        <div className="rounded-[28px] border border-white/8 bg-white/4 p-6 text-sm text-sand-200/72">
          Loading Draffiti desktop shell...
        </div>
      ) : bootstrapError ? (
        <div className="rounded-[28px] border border-flare-500/24 bg-flare-500/10 p-6 text-sm text-flare-400">
          {bootstrapError}
        </div>
      ) : messages.length === 0 ? (
        <div className="flex min-h-[20rem] items-center justify-center">
          <div className="max-w-md rounded-[30px] border border-dashed border-white/10 bg-white/3 p-8 text-center">
            <p className="text-[11px] uppercase tracking-[0.34em] text-sand-300/42">Transcript</p>
            <h2 className="mt-3 font-serif text-3xl text-sand-100">Prompt, watch, iterate.</h2>
            <p className="mt-3 text-sm leading-7 text-sand-200/68">
              Pick a folder, connect Codex, and the transcript will track the build plus the
              summary of what changed between turns.
            </p>
          </div>
        </div>
      ) : (
        messages.map((message) =>
          message.kind === "changeSummary" && message.changeSummary ? (
            <ChangeSummaryCard key={message.id} summary={message.changeSummary} />
          ) : (
            <article
              key={message.id}
              className={`max-w-3xl rounded-[28px] border px-5 py-4 shadow-[0_14px_34px_rgba(0,0,0,0.18)] ${tone(
                message.kind,
              )}`}
            >
              <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.24em] text-sand-300/52">
                <span>{message.kind}</span>
                {message.pending ? <span>streaming</span> : null}
              </div>
              <pre className="m-0 whitespace-pre-wrap break-words font-[inherit] text-sm leading-7 text-sand-100">
                {message.text || (message.pending ? "..." : "")}
              </pre>
            </article>
          ),
        )
      )}
    </div>
  );
}
