import type { MenuOption } from '@app/store';
import { useRuntime } from '@app/ui/context';

export interface ContextMenuProps {
  x: number;
  y: number;
  title: string;
  options: MenuOption[];
  onClose: () => void;
}

/** One row. A locked row is aria-disabled (never native disabled, which would swallow the tap) and shows its reason. */
export function MenuItem({ option, onPick }: { option: MenuOption; onPick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={option.locked ? 'menu-item menu-item--locked' : 'menu-item'}
      aria-disabled={option.locked ? 'true' : undefined}
      onClick={onPick}
    >
      {option.label}
      {option.locked && <span className="menu-item-reason">{option.locked}</span>}
    </button>
  );
}

/** Floating menu at client px (kept on screen). The backdrop swallows the next press and closes. */
export function ContextMenu({ x, y, title, options, onClose }: ContextMenuProps) {
  const { audio } = useRuntime();
  const w = 190;
  const h = 44 * (options.length + 1) + 16 * options.filter((o) => o.locked).length;
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
            <MenuItem
              option={o}
              onPick={() => {
                if (!o.locked) audio.play('uiClick');
                onClose();
                o.onSelect();
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
