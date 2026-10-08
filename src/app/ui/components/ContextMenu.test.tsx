import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MenuItem } from './ContextMenu';

const html = (o: Parameters<typeof MenuItem>[0]['option']) =>
  renderToStaticMarkup(<MenuItem option={o} onPick={() => {}} />);

describe('MenuItem', () => {
  it('renders a locked option greyed with the reason, aria-disabled, not disabled', () => {
    const out = html({ label: 'Bait', onSelect: () => {}, locked: 'Requires Fishing 5 (you: 1)' });
    expect(out).toContain('menu-item--locked');
    expect(out).toContain('aria-disabled="true"');
    expect(out).toContain('menu-item-reason');
    expect(out.replace(/<!-- -->/g, '')).toContain('Requires Fishing 5 (you: 1)');
    expect(out).not.toMatch(/\sdisabled(=|\s|>)/);
  });

  it('tapping a locked option still fires onPick', () => {
    const onPick = vi.fn();
    const el = MenuItem({ option: { label: 'x', onSelect: () => {}, locked: 'r' }, onPick });
    (el.props as { onClick: () => void }).onClick();
    expect(onPick).toHaveBeenCalledOnce();
  });

  it('leaves an unlocked option unchanged', () => {
    const out = html({ label: 'Chop', onSelect: () => {} });
    expect(out).toBe('<button type="button" role="menuitem" class="menu-item">Chop</button>');
  });
});
