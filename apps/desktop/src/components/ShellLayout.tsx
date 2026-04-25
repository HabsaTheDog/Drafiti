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
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-950/70 shadow-[0_24px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl">
      <div className="border-b border-white/[0.06] px-4 py-2.5 lg:hidden">
        <div className="inline-flex rounded-xl border border-white/[0.08] bg-ink-900/60 p-0.5">
          {(["chat", "preview"] as const).map((view) => (
            <button
              key={view}
              type="button"
              className={`rounded-[10px] px-4 py-2 text-sm font-medium transition ${
                activeView === view
                  ? "bg-brand-gradient text-ink-950"
                  : "text-cloud-300/60 hover:bg-white/[0.05]"
              }`}
              onClick={() => onActiveViewChange(view)}
            >
              {view === "chat" ? "Chat" : "Preview"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 lg:grid-cols-[minmax(24rem,28rem)_minmax(0,1fr)]">
        <aside
          className={`${activeView === "chat" ? "block" : "hidden"} min-h-0 border-r border-white/[0.06] lg:block`}
        >
          {sidebar}
        </aside>
        <section
          className={`${activeView === "preview" ? "block" : "hidden"} min-h-0 min-w-0 lg:block`}
        >
          {preview}
        </section>
      </div>
    </section>
  );
}
