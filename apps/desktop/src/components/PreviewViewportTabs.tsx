import type { PreviewViewportMode } from "../types";

interface PreviewViewportTabsProps {
  previewViewportMode: PreviewViewportMode;
  onPreviewViewportModeChange: (mode: PreviewViewportMode) => void;
}

function buttonTone(active: boolean) {
  return active
    ? "border-white/20 bg-sand-100 text-ink-950 shadow-[0_10px_22px_rgba(241,237,230,0.18)]"
    : "border-white/10 bg-white/4 text-sand-200 hover:bg-white/8";
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
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-[0.28em] text-sand-300/44">Viewport</p>
      <div className="inline-flex rounded-[24px] border border-white/10 bg-black/18 p-1">
        <button
          type="button"
          aria-label="Desktop preview"
          aria-pressed={previewViewportMode === "desktop"}
          className={`inline-flex items-center gap-2 rounded-[18px] border px-4 py-2.5 text-sm font-medium transition ${buttonTone(
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
          className={`inline-flex items-center gap-2 rounded-[18px] border px-4 py-2.5 text-sm font-medium transition ${buttonTone(
            previewViewportMode === "phone",
          )}`}
          onClick={() => onPreviewViewportModeChange("phone")}
        >
          <PhoneIcon />
          Phone
        </button>
      </div>
    </div>
  );
}
