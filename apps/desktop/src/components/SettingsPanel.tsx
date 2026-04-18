interface SettingsPanelProps {
  codexBinaryPath: string;
  codexHomePath: string;
  defaultModel: string;
  previewCommand: string;
  open: boolean;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onCodexBinaryPathChange: (value: string) => void;
  onCodexHomePathChange: (value: string) => void;
  onDefaultModelChange: (value: string) => void;
  onPreviewCommandChange: (value: string) => void;
  onSave: () => void;
}

function Field({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-[0.26em] text-sand-300/50">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/10 bg-black/18 px-4 py-3 text-sm text-sand-100 outline-none transition focus:border-sky-400/55"
      />
    </label>
  );
}

export function SettingsPanel({
  codexBinaryPath,
  codexHomePath,
  defaultModel,
  previewCommand,
  open,
  isSaving,
  onOpenChange,
  onCodexBinaryPathChange,
  onCodexHomePathChange,
  onDefaultModelChange,
  onPreviewCommandChange,
  onSave,
}: SettingsPanelProps) {
  return (
    <details
      className="rounded-[20px] border border-white/8 bg-white/4"
      open={open}
      onToggle={(event) => onOpenChange((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-sand-100">
        More settings
      </summary>
      <div className="space-y-4 border-t border-white/8 px-4 py-4">
        <Field
          label="Codex binary path"
          value={codexBinaryPath}
          placeholder="codex"
          onChange={onCodexBinaryPathChange}
        />
        <Field
          label="CODEX_HOME"
          value={codexHomePath}
          placeholder="Optional custom config directory"
          onChange={onCodexHomePathChange}
        />
        <Field
          label="Default model"
          value={defaultModel}
          placeholder="gpt-5.4"
          onChange={onDefaultModelChange}
        />
        <Field
          label="Preview command"
          value={previewCommand}
          placeholder="Optional manual preview command"
          onChange={onPreviewCommandChange}
        />
        <button
          type="button"
          className="w-full rounded-2xl bg-sand-100 px-4 py-3 text-sm font-semibold text-ink-950 transition hover:bg-sand-200"
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save settings"}
        </button>
      </div>
    </details>
  );
}
