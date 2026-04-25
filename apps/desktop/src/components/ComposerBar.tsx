interface ComposerBarProps {
  composer: string;
  sessionConnected: boolean;
  isSending: boolean;
  canSend: boolean;
  canInterrupt: boolean;
  onComposerChange: (value: string) => void;
  onSend: () => void;
  onInterrupt: () => void;
}

function SendIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12 2 3l18 7-18 7 3-9Zm0 0h7" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-3.5 w-3.5"
      fill="currentColor"
    >
      <rect x="4" y="4" width="12" height="12" rx="2" />
    </svg>
  );
}

export function ComposerBar({
  composer,
  sessionConnected,
  isSending,
  canSend,
  canInterrupt,
  onComposerChange,
  onSend,
  onInterrupt,
}: ComposerBarProps) {
  return (
    <footer className="border-t border-white/[0.06] px-4 py-4">
      <div className="rounded-2xl border border-white/[0.08] bg-ink-900/60 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <textarea
          value={composer}
          onChange={(event) => onComposerChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && canSend) {
              event.preventDefault();
              onSend();
            }
          }}
          disabled={!sessionConnected}
          placeholder={
            sessionConnected
              ? "Describe what you want to build or change…"
              : "Connect to start chatting."
          }
          className="min-h-20 w-full resize-none bg-transparent text-sm leading-6 text-cloud-100 outline-none placeholder:text-cloud-300/30 disabled:cursor-not-allowed"
        />

        <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3">
          <span className="text-[10px] tracking-wide text-cloud-300/30">
            ⌘ + Enter to send
          </span>

          <div className="flex items-center gap-2">
            {canInterrupt ? (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-cloud-200 transition hover:bg-white/[0.07]"
                onClick={onInterrupt}
              >
                <StopIcon />
                Stop
              </button>
            ) : null}
            <button
              type="button"
              className="bg-brand-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-ink-950 transition disabled:cursor-not-allowed disabled:opacity-35"
              onClick={onSend}
              disabled={!canSend}
            >
              <SendIcon />
              {isSending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
