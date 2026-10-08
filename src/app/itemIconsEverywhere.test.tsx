import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CONTENT } from '@app/registry';
import { ItemSlot } from '@app/ui/components/ItemSlot';
import { BankView } from '@app/ui/panels/BankView';
import { itemIconIds, itemIconSource, itemIconUrl } from '@render/index';

// "One item image everywhere": every registered item has the SAME icon in every view.
const ids = CONTENT.items.all().map((d) => d.id);
const clean = (s: string) => s.replace(/<!-- -->/g, '');
const srcsOf = (html: string) =>
  [...html.matchAll(/<img[^>]*class="slot-icon"[^>]*src="([^"]*)"/g)].map((m) => m[1]);

describe('item icons cover the item registry', () => {
  it('registry has the new mining and fishing items', () => {
    expect(ids).toEqual(
      expect.arrayContaining(['copper_ore', 'raw_shrimp', 'fishing_rod', 'steel_pickaxe']),
    );
  });
  it.each(ids)('%s has an icon id, a non-empty url and a derived texture key', (id) => {
    expect(itemIconIds()).toContain(id);
    expect(itemIconUrl(id)).toBeTruthy();
    expect(itemIconSource(id)).toEqual({ key: `item_icon_${id}`, url: itemIconUrl(id) });
  });
  it('render has no icon for a non-existent item (no orphan art)', () => {
    expect(itemIconIds().filter((i) => !ids.includes(i))).toEqual([]);
  });
});

describe('every view draws itemIconUrl(id)', () => {
  it.each(ids)('ItemSlot renders exactly the shared url for %s', (id) => {
    const h = clean(renderToStaticMarkup(<ItemSlot itemId={id} name={id} />));
    expect(srcsOf(h)).toEqual([itemIconUrl(id)]);
  });
  it.each(['full', 'depositOnly'] as const)('BankView %s slots use the shared url', (mode) => {
    const h = clean(
      renderToStaticMarkup(
        <BankView
          mode={mode}
          bank={ids.map((itemId) => ({ itemId, quantity: 1 }))}
          slots={ids.map((itemId) => ({ itemId, quantity: 1 }))}
          capacity={800}
          nameOf={(i) => i}
          onWithdraw={() => undefined}
          onDepositSlot={() => undefined}
          onDepositAll={() => undefined}
          onClose={() => undefined}
        />,
      ),
    );
    const expected = ids.map((i) => itemIconUrl(i));
    expect(srcsOf(h)).toEqual(mode === 'full' ? [...expected, ...expected] : expected);
  });
});
