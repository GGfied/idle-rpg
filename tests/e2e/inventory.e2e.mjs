// QA slice: inventory actions (click/right-click/long-press menu, Drop, Examine, stacking, full 28).
// Fast base: runParallel desktop + phone (one child each), ?tickMs=60, wait-on-state, budget 60 s.
// Run: node tests/e2e/inventory.e2e.mjs
// drag-to-swap is covered by inventorySwap.e2e.mjs (the old XFAIL check was retired).
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = 9151;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'], // DOM-only panel: renderer does not matter
  budgetMs: BUDGET_MS,
});

const J = JSON.stringify;
const Q = `window.__q = {
  inv: () => window.__idleRpg.store.getState().game.inventory.slots.map((s) => s && s.itemId + 'x' + s.quantity),
  rect: (sel, i = 0) => { const e = document.querySelectorAll(sel)[i]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; },
  rectText: (sel, t) => { const e = [...document.querySelectorAll(sel)].find((x) => x.textContent.trim() === t); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; },
  menu: () => { const m = document.querySelector('.menu'); return m ? { title: m.querySelector('.menu-title').textContent, items: [...m.querySelectorAll('.menu-item')].map((b) => b.textContent) } : null; },
  slots: () => [...document.querySelectorAll('.slot')].map((b) => b.getAttribute('aria-label')),
}; 0`;

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp) => {
    const P = (e) => g.eval(`window.__q.${e}`);
    await g.eval(Q);
    const menuOpen = () => P('menu()');
    // Seed the inventory and wait until the DOM shows it (replaces a fixed 200 ms sleep).
    const seed = async (items, label) => {
      await g.setInventory(items);
      await g.waitFor(async () => (await P('slots()'))[0] === label, { label: `slot0 ${label}` });
    };
    const slotRect = async (i) => {
      await g.eval(`document.querySelectorAll('.slot')[${i}].scrollIntoView({block:'center'}), 0`);
      return g.waitFor(() => P(`rect('.slot', ${i})`), { label: `slot ${i}` });
    };
    const press = async (x, y, kind = 'tap') => {
      if (kind === 'long') await g.longPress(x, y);
      else await g.tap(x, y);
    };
    const closeMenu = async () => {
      if (await menuOpen()) {
        await g.tap(5, 5);
        await g.waitFor(async () => !(await menuOpen()), { label: 'menu closed' });
      }
    };
    const pick = async (label) => {
      const r = await g.waitFor(() => P(`rectText('.menu-item', ${J(label)})`), {
        label: `menu item ${label}`,
        timeoutMs: 3000,
      });
      expect(r.h >= 44 - 0.5, `menu item ${label} tap height ${r.h} < 44`);
      await press(r.x, r.y);
    };
    const three = [
      { itemId: 'logs', quantity: 1 },
      { itemId: 'oak_logs', quantity: 1 },
      { itemId: 'bronze_axe', quantity: 1 },
    ];

    // The Inventory tab is already open at boot; tapping the active tab collapses the panel.
    const tab = await P(`rectText('[role=tab]', 'Inventory')`);
    expect(tab, 'Inventory tab missing');
    if (
      !(await g.eval(
        `!!document.querySelector('.slot-grid') && document.querySelector('.slot').getBoundingClientRect().width > 0`,
      ))
    )
      await g.tap(tab.x, tab.y);
    await g.waitFor(() => g.eval('!!document.querySelector(".slot-grid")'), {
      timeoutMs: 4000,
      label: 'grid',
    });

    const open = (kind) => async () => {
      await seed(three, 'Logs');
      const r = await slotRect(0);
      await press(r.x, r.y, kind);
      const m = await g.waitFor(menuOpen, { label: `menu after ${kind}`, timeoutMs: 3000 });
      expect(m.title === 'Logs', `title ${m.title}`);
      expect(m.items.join() === 'Light,Use,Drop,Examine,Cancel', `options ${m.items}`);
      const mr = await P(`rect('.menu')`);
      const top = await g.eval(
        `document.elementFromPoint(${mr.x},${mr.y})?.closest('.menu') ? 'menu' : 'other'`,
      );
      expect(top === 'menu', 'menu not on top');
      expect(
        mr.x - mr.w / 2 >= 0 && mr.x + mr.w / 2 <= (await g.eval('innerWidth')),
        'menu off-screen',
      );
      return `${vp}: menu "${m.title}": ${m.items.join('/')}`;
    };
    await check('click', 'tap/click item opens menu (Light/Use/Drop/Examine/Cancel)', async () => {
      const ev = await open('tap')();
      await closeMenu();
      return ev;
    });
    await check(
      'context',
      g.touch ? 'long-press item opens menu' : 'right-click item opens menu',
      async () => {
        const ev = await open('long')();
        await closeMenu();
        return ev;
      },
    );
    await check('cancel', 'Cancel closes menu, inventory unchanged', async () => {
      const before = await P('inv()');
      const r = await slotRect(0);
      await press(r.x, r.y);
      await pick('Cancel');
      await g.waitFor(async () => !(await menuOpen()), { label: 'menu closed', timeoutMs: 3000 });
      expect(J(await P('inv()')) === J(before), 'inventory changed');
      return 'closed, inv same';
    });
    await check('examine', 'Examine posts examine text to chat, keeps item', async () => {
      const r = await slotRect(1);
      const n0 = (await g.chatLines()).length;
      await press(r.x, r.y);
      await pick('Examine');
      const want = await g.eval(
        `import('/src/app/registry.ts').then(m => m.CONTENT.items.get('oak_logs').examine)`,
      );
      await g.waitFor(async () => (await g.chatLines()).length > n0, { label: 'examine chat' });
      const chat = await g.chatLines();
      expect(
        chat.length === n0 + 1 && chat.at(-1) === want,
        `chat ${J(chat.slice(-2))} want ${want}`,
      );
      const dom = await g.waitFor(
        () => g.eval(`document.querySelector('.chatbox')?.innerText.includes(${J(want)})`),
        { label: 'examine text in chatbox DOM', timeoutMs: 3000 },
      );
      expect(dom, 'examine text not visible in chatbox DOM');
      expect((await P('inv()'))[1] === 'oak_logsx1', 'item removed by examine');
      return `chat: "${want}"`;
    });
    await check(
      'drop',
      'Drop removes item from inventory + chat line; no ground item (not implemented)',
      async () => {
        await seed(three, 'Logs');
        const r = await slotRect(1);
        await press(r.x, r.y);
        await pick('Drop');
        await g.waitFor(async () => (await P('inv()'))[1] === null, { label: 'slot 1 emptied' });
        const inv = await P('inv()');
        expect(
          inv[1] === null && inv[0] === 'logsx1' && inv[2] === 'bronze_axex1',
          `inv ${inv.slice(0, 4)}`,
        );
        const last = (await g.chatLines()).at(-1);
        expect(last === 'You drop the oak logs.', `chat ${last}`);
        await g.waitFor(async () => (await P('slots()'))[1] === 'Empty slot', {
          label: 'slot 1 label Empty slot',
          timeoutMs: 3000,
        });
        return `slot1 -> empty, chat "You drop the oak logs."; other slots intact`;
      },
    );
    await check(
      'stack',
      'Logs do not stack: 5 logs = 5 slots, no qty badge (OSRS rule)',
      async () => {
        await seed(
          [1, 2, 3, 4, 5].map(() => ({ itemId: 'logs', quantity: 1 })),
          'Logs',
        );
        await g.waitFor(async () => (await P('slots()'))[4] === 'Logs', { label: '5 logs drawn' });
        const s = await P('slots()');
        expect(
          s.slice(0, 5).every((l) => l === 'Logs') && s[5] === 'Empty slot',
          `labels ${s.slice(0, 6)}`,
        );
        expect(
          (await g.eval(`document.querySelectorAll('.slot-qty').length`)) === 0,
          'qty badge on non-stacked',
        );
        return `5 slots "Logs", 0 qty badges`;
      },
    );
    await check('badge', 'Quantity>1 shows badge + "x N" label (synthetic stack)', async () => {
      await seed([{ itemId: 'logs', quantity: 12 }], 'Logs x12');
      const l = (await P('slots()'))[0];
      const q = await g.eval(`document.querySelector('.slot-qty')?.textContent`);
      expect(l === 'Logs x12' && q === '12', `label ${l} badge ${q}`);
      return `label "${l}", badge ${q}`;
    });
    await check(
      'full',
      '28/28 full state: all slots labelled, none empty, grid fits, drop frees a slot',
      async () => {
        await seed(
          Array.from({ length: 28 }, () => ({ itemId: 'logs', quantity: 1 })),
          'Logs',
        );
        await g.waitFor(async () => (await P('slots()'))[27] === 'Logs', { label: '28 drawn' });
        const s = await P('slots()');
        expect(s.length === 28 && s.every((l) => l === 'Logs'), `labels ${s.length}`);
        const last = await slotRect(27);
        expect(last.w >= 30, 'last slot tiny');
        await press(last.x, last.y);
        await pick('Drop');
        await g.waitFor(async () => (await P('inv()'))[27] === null, { label: 'slot 27 freed' });
        const inv = await P('inv()');
        expect(
          inv[27] === null && inv.filter(Boolean).length === 27,
          `inv count ${inv.filter(Boolean).length}`,
        );
        return `28 slots rendered, slot size ${Math.round(last.w)}px, drop -> 27`;
      },
    );
    await check('tap', 'slot tap targets >= 44px', async () => {
      const r = await P(`rect('.slot', 0)`);
      expect(r.w >= 44 && r.h >= 44, `slot ${r.w}x${r.h}`);
      return `${r.w.toFixed(0)}x${r.h.toFixed(0)}`;
    });
    await check('empty', 'empty slot is inert (no menu)', async () => {
      const r = await slotRect(27);
      await press(r.x, r.y);
      await g.sleep(150); // negative check: give React one paint to (wrongly) open a menu
      expect(!(await menuOpen()), 'menu on empty slot');
      return 'no menu';
    });
  }),
);
