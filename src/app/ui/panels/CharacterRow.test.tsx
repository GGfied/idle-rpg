import { renderToStaticMarkup } from 'react-dom/server';
import { isValidElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CharacterRow } from './CharacterRow';
import { StepControl } from '@app/ui/components/StepControl';
import { lookIndex } from '@app/ui/characterLook';

const html = (look: unknown) =>
  renderToStaticMarkup(<CharacterRow look={look} onSelect={() => {}} />).replace(/<!-- -->/g, '');
const checked = (h: string) => [...h.matchAll(/aria-checked="(true|false)"[^>]*>(\w+)</g)];

describe('CharacterRow', () => {
  it('renders the label and both options', () => {
    const h = html('player');
    expect(h).toContain('Character');
    expect(checked(h).map((m) => m[2])).toEqual(['Male', 'Female']);
  });
  it('reflects the pref', () => {
    expect(checked(html('player')).map((m) => m[1])).toEqual(['true', 'false']);
    expect(checked(html('player_f')).map((m) => m[1])).toEqual(['false', 'true']);
    expect(html('player_f')).toContain('looks female');
  });
  it('falls back to Male for missing/unknown values', () => {
    expect(lookIndex(undefined)).toBe(0);
    expect(checked(html('bogus')).map((m) => m[1])).toEqual(['true', 'false']);
  });
  it('tapping an option dispatches the stored look value', () => {
    const onSelect = vi.fn();
    const el = CharacterRow({ look: 'player', onSelect }) as ReactElement<{
      onSelect: (i: number) => void;
    }>;
    expect(isValidElement(el) && el.type).toBe(StepControl);
    el.props.onSelect(1);
    el.props.onSelect(0);
    expect(onSelect.mock.calls).toEqual([['player_f'], ['player']]);
  });
});
