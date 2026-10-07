export function ProgressBar({
  value,
  max,
  label,
  color,
}: {
  value: number;
  max: number;
  label?: string;
  /** Fill colour (CSS); defaults to the theme green. */
  color?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-label={label}
    >
      <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
