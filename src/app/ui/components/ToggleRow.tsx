/** On/off switch row with a live description of the current value. */
export function ToggleRow({
  label,
  checked,
  description,
  onChange,
}: {
  label: string;
  checked: boolean;
  description: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="steps">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className="toggle-row"
        onClick={() => onChange(!checked)}
      >
        <span>{label}</span>
        <span className="toggle-state">{checked ? 'On' : 'Off'}</span>
      </button>
      <span className="steps-desc" aria-live="polite">
        {description}
      </span>
    </div>
  );
}
