import type { PreviewViewportMode } from "../types";

interface PreviewViewportTabsProps {
  previewViewportMode: PreviewViewportMode;
  onPreviewViewportModeChange: (mode: PreviewViewportMode) => void;
}

function buttonTone(active: boolean) {
  return active
    ? "bg-brand-gradient text-ink-950 border-transparent shadow-[0_4px_14px_rgba(76,224,235,0.16)]"
    : "border-white/[0.08] bg-white/[0.03] text-cloud-300 hover:bg-white/[0.06]";
}

function MonitorIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3.5" y="4.5" width="17" height="11" rx="1.8" />
      <path d="M9 19.5h6" />
      <path d="M12 15.5v4" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="7.5" y="2.5" width="9" height="19" rx="2.4" />
      <path d="M10.5 5.5h3" />
      <path d="M11.7 18.5h.6" />
    </svg>
  );
}

export function PreviewViewportTabs({
  previewViewportMode,
  onPreviewViewportModeChange,
}: PreviewViewportTabsProps) {
  return (
    <div className="inline-flex rounded-xl border border-white/[0.06] bg-ink-900/40 p-0.5">
      <button
        type="button"
        aria-label="Desktop preview"
        aria-pressed={previewViewportMode === "desktop"}
        className={`inline-flex items-center gap-1.5 rounded-[10px] border px-3 py-2 text-xs font-medium transition ${buttonTone(
          previewViewportMode === "desktop",
        )}`}
        onClick={() => onPreviewViewportModeChange("desktop")}
      >
        <MonitorIcon />
        Desktop
      </button>
      <button
        type="button"
        aria-label="Phone preview"
        aria-pressed={previewViewportMode === "phone"}
        className={`inline-flex items-center gap-1.5 rounded-[10px] border px-3 py-2 text-xs font-medium transition ${buttonTone(
          previewViewportMode === "phone",
        )}`}
        onClick={() => onPreviewViewportModeChange("phone")}
      >
        <PhoneIcon />
        Phone
      </button>
    </div>
  );
}
