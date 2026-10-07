import { useId, type KeyboardEvent } from 'react';

/** Segmented radio group (Off / 1-5, On / Reduced / Off ...). Arrow keys move the selection. */
export function StepControl({
  label,
  hint,
  description,
  options,
  selected,
  onSelect,
}: {
  label: string;
  hint?: string;
  /** Live description of the current choice. */
  description: string;
  options: string[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  const id = useId();
  const key = (e: KeyboardEvent) => {
    const d =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? -1
          : 0;
    if (!d) return;
    e.preventDefault();
    onSelect(Math.min(options.length - 1, Math.max(0, selected + d)));
  };
  return (
    <div className="steps">
      <span id={id} className="steps-label">
        {label}
      </span>
      {hint ? <span className="steps-hint">{hint}</span> : null}
      <div className="steps-row" role="radiogroup" aria-labelledby={id} onKeyDown={key}>
        {options.map((text, i) => (
          <button
            key={text}
            type="button"
            role="radio"
            aria-checked={i === selected}
            tabIndex={i === selected ? 0 : -1}
            className="steps-btn"
            onClick={() => onSelect(i)}
          >
            {text}
          </button>
        ))}
      </div>
      <span className="steps-desc" aria-live="polite">
        {description}
      </span>
    </div>
  );
}
