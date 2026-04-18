import type { ReactNode } from "react";

interface ShellLayoutProps {
  activeView: "chat" | "preview";
  onActiveViewChange: (view: "chat" | "preview") => void;
  sidebar: ReactNode;
  preview: ReactNode;
}

export function ShellLayout({
  activeView,
  onActiveViewChange,
  sidebar,
  preview,
}: ShellLayoutProps) {
  return (
    <section className="flex min-h-0 flex-1 overflow-hidden rounded-[32px] border border-white/10 bg-ink-950/78 shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl">
      <div className="border-b border-white/8 px-4 py-3 lg:hidden">
        <div className="inline-flex rounded-2xl border border-white/10 bg-black/18 p-1">
          {(["chat", "preview"] as const).map((view) => (
            <button
              key={view}
              type="button"
              className={`rounded-xl px-4 py-2 text-sm transition ${
                activeView === view
                  ? "bg-sand-100 text-ink-950"
                  : "text-sand-300/72 hover:bg-white/7"
              }`}
              onClick={() => onActiveViewChange(view)}
            >
              {view === "chat" ? "Chat" : "Preview"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(26rem,30rem)_minmax(0,1fr)]">
        <aside
          className={`${activeView === "chat" ? "block" : "hidden"} min-h-0 border-r border-white/8 lg:block`}
        >
          {sidebar}
        </aside>
        <section
          className={`${activeView === "preview" ? "block" : "hidden"} min-h-0 lg:block`}
        >
          {preview}
        </section>
      </div>
    </section>
  );
}
