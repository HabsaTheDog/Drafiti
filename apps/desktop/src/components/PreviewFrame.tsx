import type { PreviewState } from "../types";

export function PreviewFrame({ preview }: { preview: PreviewState }) {
  if (preview.status === "ready" && preview.url) {
    return (
      <iframe
        key={preview.url}
        title="Website preview"
        src={preview.url}
        className="block h-full min-h-0 w-full rounded-[28px] border border-white/8 bg-white"
      />
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
