import type { PreviewState, PreviewViewportMode } from "../types";

interface PreviewFrameProps {
  preview: PreviewState;
  previewViewportMode: PreviewViewportMode;
}

export function PreviewFrame({ preview, previewViewportMode }: PreviewFrameProps) {
  if (preview.status === "ready" && preview.url) {
    return (
      <div className="flex h-full w-full min-h-0 items-center justify-center overflow-hidden">
        <div
          data-testid="preview-viewport-shell"
          data-viewport-mode={previewViewportMode}
          className={`relative flex h-full min-h-0 w-full justify-center overflow-hidden transition-[max-width,padding,transform,border-radius] duration-300 ease-out ${
            previewViewportMode === "phone"
              ? "max-w-[390px] rounded-[36px] border border-white/12 bg-ink-950/92 p-2 shadow-[0_24px_60px_rgba(0,0,0,0.38)]"
              : "max-w-full"
          }`}
        >
          {previewViewportMode === "phone" ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 h-1.5 w-20 -translate-x-1/2 rounded-full bg-white/14" />
          ) : null}
          <iframe
            key={preview.url}
            title="Website preview"
            src={preview.url}
            className={`block h-full min-h-0 w-full bg-white ${
              previewViewportMode === "phone"
                ? "rounded-[30px]"
                : "rounded-[28px] border border-white/8"
            }`}
          />
        </div>
      </div>
    );
  }

  if (preview.status === "booting") {
    return (
      <div className="flex h-full min-h-[38rem] items-center justify-center rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(76,129,197,0.18),transparent_35%),rgba(255,255,255,0.03)] p-10 text-center">
        <div className="max-w-lg">
          <p className="text-[11px] uppercase tracking-[0.34em] text-sand-300/44">Booting preview</p>
          <h2 className="mt-4 font-serif text-4xl text-sand-100">Waiting for the local site to come up.</h2>
          <p className="mt-3 text-sm leading-7 text-sand-200/72">
            Draffiti is watching the local dev server and will swap this panel to the live site as
            soon as it responds.
          </p>
        </div>
      </div>
    );
  }

  if (preview.status === "crashed") {
    return (
      <div className="flex h-full min-h-[38rem] items-center justify-center rounded-[28px] border border-flare-500/24 bg-flare-500/8 p-10 text-center">
        <div className="max-w-lg">
          <p className="text-[11px] uppercase tracking-[0.34em] text-flare-300/74">Preview error</p>
          <h2 className="mt-4 font-serif text-4xl text-sand-100">The local preview is down.</h2>
          <p className="mt-3 text-sm leading-7 text-sand-200/72">
            {preview.lastError ?? "The preview server exited before it became reachable."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[38rem] items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/3 p-10 text-center">
      <div className="max-w-lg">
        <p className="text-[11px] uppercase tracking-[0.34em] text-sand-300/44">Preview idle</p>
        <h2 className="mt-4 font-serif text-4xl text-sand-100">Start the local site preview.</h2>
        <p className="mt-3 text-sm leading-7 text-sand-200/72">
          {preview.command
            ? `Ready to run: ${preview.command}`
            : preview.lastError ?? "Pick a workspace or define a preview command in settings."}
        </p>
      </div>
    </div>
  );
}
