import type { MenuOption } from '@app/store';
import { useRuntime } from '@app/ui/context';

export interface ContextMenuProps {
  x: number;
  y: number;
  title: string;
  options: MenuOption[];
  onClose: () => void;
}

/** Floating menu at client px (kept on screen). The backdrop swallows the next press and closes. */
export function ContextMenu({ x, y, title, options, onClose }: ContextMenuProps) {
  const { audio } = useRuntime();
  const w = 190;
  const h = 44 * (options.length + 1);
  const left = Math.max(4, Math.min(x, window.innerWidth - w - 4));
  const top = Math.max(4, Math.min(y, window.innerHeight - h - 4));
  return (
    <div
      className="menu-backdrop"
      onPointerDown={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <ul
        className="menu"
        role="menu"
        style={{ left, top, width: w }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <li className="menu-title">{title}</li>
        {options.map((o) => (
          <li key={o.label} role="none">
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                audio.play('uiClick');
                onClose();
                o.onSelect();
              }}
            >
              {o.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
