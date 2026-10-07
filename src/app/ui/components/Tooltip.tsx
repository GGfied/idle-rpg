import { useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Tap (or long-press / keyboard focus) toggles a bubble; no hover-only information.
 * The bubble closes on the next tap or when the element loses focus.
 */
export function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  return (
    <div
      className="tooltip-host"
      tabIndex={0}
      role="button"
      aria-expanded={open}
      onClick={() => setOpen((o) => !o)}
      onBlur={() => setOpen(false)}
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse') timer.current = setTimeout(() => setOpen(true), 400);
      }}
      onPointerUp={() => clearTimeout(timer.current)}
      onPointerCancel={() => clearTimeout(timer.current)}
    >
      {children}
      {open ? (
        <div className="tooltip" role="tooltip">
          {content}
        </div>
      ) : null}
    </div>
  );
}
