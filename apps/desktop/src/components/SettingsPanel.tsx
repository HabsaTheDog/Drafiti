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
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.2em] text-cloud-300/50">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/[0.08] bg-ink-900/80 px-3.5 py-2.5 text-sm text-cloud-100 outline-none transition placeholder:text-cloud-300/30 focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/20"
      />
    </label>
  );
}

export function SettingsPanel({
  codexBinaryPath,
  codexHomePath,
  defaultModel,
  previewCommand,
  isSaving,
  onCodexBinaryPathChange,
  onCodexHomePathChange,
  onDefaultModelChange,
  onPreviewCommandChange,
  onSave,
}: SettingsPanelProps) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-cloud-300/40">
        Settings
      </p>
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
        className="bg-brand-gradient w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-950 transition disabled:opacity-40"
        onClick={onSave}
        disabled={isSaving}
      >
        {isSaving ? "Saving…" : "Save settings"}
      </button>
    </div>
  );
}
