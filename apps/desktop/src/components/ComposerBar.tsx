interface ComposerBarProps {
  composer: string;
  selectedModel: string;
  sessionConnected: boolean;
  isSending: boolean;
  isSwitchingModel: boolean;
  canSend: boolean;
  canInterrupt: boolean;
  modelSuggestions: string[];
  onComposerChange: (value: string) => void;
  onSelectedModelChange: (value: string) => void;
  onSend: () => void;
  onInterrupt: () => void;
}

export function ComposerBar({
  composer,
  selectedModel,
  sessionConnected,
  isSending,
  isSwitchingModel,
  canSend,
  canInterrupt,
  modelSuggestions,
  onComposerChange,
  onSelectedModelChange,
  onSend,
  onInterrupt,
}: ComposerBarProps) {
  return (
    <footer className="border-t border-white/8 px-5 py-5">
      <div className="rounded-[28px] border border-white/10 bg-black/24 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
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
              ? "Describe what you want Codex to build or change..."
              : "Connect to Codex to start chatting."
          }
          className="min-h-28 w-full resize-none bg-transparent text-sm leading-7 text-sand-100 outline-none placeholder:text-sand-300/34 disabled:cursor-not-allowed"
        />

        <div className="mt-4 grid gap-3 border-t border-white/8 pt-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-[0.26em] text-sand-300/48">
                Prompt model
              </span>
              <input
                list="draffiti-model-suggestions"
                value={selectedModel}
                onChange={(event) => onSelectedModelChange(event.target.value)}
                placeholder="Use saved default model"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-sand-100 outline-none transition focus:border-sky-400/55"
              />
              <datalist id="draffiti-model-suggestions">
                {modelSuggestions.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </label>

            <div className="flex gap-3 xl:self-end">
              <button
                type="button"
                className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-45"
                onClick={onInterrupt}
                disabled={!canInterrupt}
              >
                Stop
              </button>
              <button
                type="button"
                className="rounded-2xl bg-flare-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-flare-400 disabled:cursor-not-allowed disabled:bg-flare-500/35"
                onClick={onSend}
                disabled={!canSend}
              >
                {isSending ? "Sending..." : "Send prompt"}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2 text-[11px] uppercase tracking-[0.24em] text-sand-300/42 sm:flex-row sm:items-center sm:justify-between">
            <span>Send with Ctrl/Cmd + Enter</span>
            {isSwitchingModel ? <span>Reconnecting for model change...</span> : null}
          </div>
        </div>
      </div>
    </footer>
  );
}
