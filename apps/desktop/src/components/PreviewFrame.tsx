import type { PreviewState, PreviewViewportMode } from "../types";

import logoIcon from "../assets/draffiti-icon.png";

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
              ? "max-w-[390px] rounded-[36px] border border-white/[0.1] bg-ink-950/90 p-2 shadow-[0_20px_50px_rgba(0,0,0,0.4)]"
              : "max-w-full"
          }`}
        >
          {previewViewportMode === "phone" ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 h-1.5 w-20 -translate-x-1/2 rounded-full bg-white/[0.12]" />
          ) : null}
          <iframe
            key={preview.url}
            title="Website preview"
            src={preview.url}
            className={`block h-full min-h-0 w-full bg-white ${
              previewViewportMode === "phone"
                ? "rounded-[30px]"
                : "rounded-2xl border border-white/[0.06]"
            }`}
          />
        </div>
      </div>
    );
  }

  if (preview.status === "booting") {
    return (
      <div className="flex h-full min-h-[34rem] items-center justify-center rounded-2xl border border-white/[0.08] bg-[radial-gradient(circle_at_center,rgba(76,224,235,0.1),transparent_50%)] p-10 text-center">
        <div className="max-w-md">
          <img
            src={logoIcon}
            alt=""
            className="mx-auto mb-5 h-16 w-16 animate-status-pulse opacity-70"
          />
          <h2 className="text-gradient text-3xl font-bold">Starting preview...</h2>
          <p className="mt-3 text-sm leading-6 text-cloud-300/60">
            Watching the local dev server. The live site will appear here as soon as it responds.
          </p>
        </div>
      </div>
    );
  }

  if (preview.status === "crashed") {
    return (
      <div className="flex h-full min-h-[34rem] items-center justify-center rounded-2xl border border-danger-400/20 bg-danger-400/[0.05] p-10 text-center">
        <div className="max-w-md">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-danger-400/70">
            Preview error
          </p>
          <h2 className="mt-3 text-2xl font-bold text-cloud-100">The preview is down.</h2>
          <p className="mt-3 text-sm leading-6 text-cloud-300/60">
            {preview.lastError ?? "The preview server exited before it became reachable."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[34rem] items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-10 text-center">
      <div className="max-w-md">
        <img src={logoIcon} alt="" className="mx-auto mb-5 h-14 w-14 opacity-40" />
        <h2 className="text-gradient text-2xl font-bold">Start the preview</h2>
        <p className="mt-3 text-sm leading-6 text-cloud-300/50">
          {preview.command
            ? `Ready to run: ${preview.command}`
            : preview.lastError ?? "Pick a workspace or define a preview command in settings."}
        </p>
      </div>
    </div>
  );
}
