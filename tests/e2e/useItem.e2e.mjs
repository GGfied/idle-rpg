// Inventory "Use" flow: menu -> select, ring + bar, item-on-item/tree/NPC message, cancel paths, slot drop/swap.
import { check, expect, forEachViewport, withGame } from './lib.mjs';

await withGame(
  { port: 5202 },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    const sel = () =>
      g.store(
        's.useSelection ? { slot: s.useSelection.slot, itemId: s.useSelection.itemId } : null',
      );
    const SLOT = (i) => `.slot[data-slot-index="${i}"]`;
    const NOTHING = 'Nothing interesting happens.';
    const nothing = async () => g.chatCount(NOTHING);
    const reset = async () => {
      await g.setInventory(
        [
          { itemId: 'bronze_axe', quantity: 1 },
          { itemId: 'logs', quantity: 5 },
          { itemId: 'logs', quantity: 3 },
        ].slice(0, 2),
      );
      await g.store('s.cancelUse()');
      await g.update('({ ...g, chat: [] })');
    };
    const menuUse = async (i) => {
      await g.tapSelector(SLOT(i));
      await g.waitFor(() => g.eval(`!!document.querySelector('[role=menu]')`), { label: 'menu' });
      const first = await g.eval(
        `document.querySelector('[role=menu] [role=menuitem]').textContent`,
      );
      expect(first.trim() === 'Use', `first menu item is "${first}"`);
      await g.tapSelector('[role=menu] [role=menuitem]');
    };
    const bar = () =>
      g.eval(
        `(() => { const b = document.querySelector('.use-hint'); if (!b) return null; const x = b.querySelector('button').getBoundingClientRect(); return { text: b.textContent, w: x.width, h: x.height }; })()`,
      );
    const ringed = () =>
      g.eval(
        `[...document.querySelectorAll('.slot[data-selected]')].map(e => +e.dataset.slotIndex)`,
      );
    const itemIds = await g.eval(`window.__idleRpg.store.getState().game.inventory.slots.length`);
    expect(itemIds === 28, 'inventory 28');

    await check('c1', 'menu: Use first -> ring + bar + store selection', async () => {
      await reset();
      await g.update('g'); // keep tab as is
      if (!(await g.rect(SLOT(0)))) throw new Error('no inventory grid');
      await menuUse(0);
      const s = await sel(),
        b = await bar(),
        r = await ringed();
      expect(s && s.slot === 0 && s.itemId === 'bronze_axe', `sel ${JSON.stringify(s)}`);
      expect(JSON.stringify(r) === '[0]', `ring ${JSON.stringify(r)}`);
      expect(
        b && /Use/.test(b.text) && /Bronze axe/i.test(b.text) && b.w >= 44 && b.h >= 44,
        `bar ${JSON.stringify(b)}`,
      );
      return `${vp}: sel ${JSON.stringify(s)} ring ${r} bar "${b.text}" x ${b.w}x${b.h}`;
    });

    await check('c2', 'tap other item -> message, selection clears', async () => {
      await reset();
      await menuUse(0);
      const n0 = await nothing();
      await g.tapSelector(SLOT(1));
      const n1 = await nothing(),
        s = await sel(),
        b = await bar(),
        r = await ringed();
      expect(
        n1 === n0 + 1 && s === null && b === null && r.length === 0,
        `msgs ${n0}->${n1} sel ${JSON.stringify(s)} bar ${!!b} ring ${r}`,
      );
      expect(!(await g.eval(`!!document.querySelector('[role=menu]')`)), 'menu opened');
      return `msgs ${n0}->${n1}, sel null, bar gone`;
    });

    await check('c3a', 'tap same item cancels (no message)', async () => {
      await reset();
      await menuUse(0);
      await g.tapSelector(SLOT(0));
      const s = await sel(),
        b = await bar();
      expect(
        s === null && b === null && (await nothing()) === 0,
        `sel ${JSON.stringify(s)} bar ${!!b} msgs ${await nothing()}`,
      );
      return 'cancelled, 0 messages';
    });
    await check('c3b', 'X cancels', async () => {
      await reset();
      await menuUse(1);
      await g.tapSelector('.use-hint button');
      const s = await sel(),
        b = await bar();
      expect(
        s === null && b === null && (await ringed()).length === 0,
        `sel ${JSON.stringify(s)} bar ${!!b}`,
      );
      return 'cancelled via X';
    });

    await check('c4a', 'Use + tree: message, no chop', async () => {
      await reset();
      const tree = await g.targetOfKind('tree');
      await g.teleport(tree.x, tree.y + 3);
      await menuUse(0);
      await g.tapObject(tree.id);
      await g.waitTicks(4);
      const sess = await g.state('gathering.session'),
        pend = await g.state('pendingInteraction'),
        path = await g.state('movement.path.length');
      expect(
        (await nothing()) === 1 && (await sel()) === null,
        `msgs ${await nothing()} sel ${JSON.stringify(await sel())}`,
      );
      expect(
        !sess && !pend && path === 0,
        `session ${JSON.stringify(sess)} pending ${JSON.stringify(pend)} path ${path}`,
      );
      expect(
        (await g.chatLines()).every((l) => !/log/i.test(l) || l === NOTHING),
        'log chat',
      );
      return `msgs 1, session ${sess}, pending ${pend}, path ${path}`;
    });
    await check('c4b', 'Use + NPC: message, no talk', async () => {
      await reset();
      const npc = await g.targetOfKind('npc');
      await g.teleport(npc.x + 2, npc.y + 2);
      await menuUse(0);
      await g.tapObject(npc.id);
      await g.waitTicks(4);
      const talk = await g.state('talk'),
        dlg = await g.eval(`!!document.querySelector('.dialogue-main')`);
      expect(
        (await nothing()) === 1 && (await sel()) === null && !talk && !dlg,
        `msgs ${await nothing()} talk ${JSON.stringify(talk)?.slice(0, 60)} dlg ${dlg}`,
      );
      return `msgs 1, talk ${talk}, dialogue ui ${dlg}`;
    });
    await check('c4c', 'Use + empty ground: cancels and walks', async () => {
      await reset();
      const p = await g.state('movement.position');
      const t = await g.targets();
      await g.teleport(p.x, p.y);
      let dest = null;
      for (const [dx, dy] of [
        [2, 1],
        [1, 2],
        [-2, -1],
        [-1, -2],
        [2, 2],
        [-2, -2],
        [1, 1],
        [-1, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
        [3, 1],
        [1, 3],
        [-3, -1],
        [-1, -3],
        [3, 0],
        [0, 3],
        [-3, 0],
        [0, -3],
      ]) {
        const x = p.x + dx,
          y = p.y + dy;
        if (t.some((o) => Math.abs(o.x - x) <= 1 && Math.abs(o.y - y) <= 1)) continue;
        const pt = await g.tileClient(x, y);
        if (await g.page(`topIsCanvas(${pt.x}, ${pt.y})`)) {
          dest = { x, y };
          break;
        }
      }
      expect(dest, 'no free visible tile');
      await menuUse(0);
      expect((await sel()) !== null, 'not selected');
      await g.tapTile(dest.x, dest.y);
      await g.waitTicks(6);
      const q = await g.state('movement.position');
      expect((await sel()) === null && (await bar()) === null, 'selection kept');
      expect(
        q.x === dest.x && q.y === dest.y,
        `pos ${JSON.stringify(q)} want ${JSON.stringify(dest)}`,
      );
      expect((await nothing()) === 0, 'unexpected message');
      return `walked ${JSON.stringify(p)} -> ${JSON.stringify(q)}, sel null`;
    });

    await check('c5a', 'Drop selected slot via menu clears selection', async () => {
      await reset();
      await menuUse(0);
      await g.tapSelector(SLOT(0)); // cancels; reselect via menu instead
      await menuUse(0);
      await g.eval(`(() => { document.querySelector('.use-hint') })()`);
      // right-click / long-press opens the menu while using
      const r = await g.rect(SLOT(0));
      // CDP touch holds never fire a native contextmenu (the hold just ends as a tap), so on phone dispatch it.
      if (g.touch)
        await g.eval(
          `document.querySelector('${SLOT(0)}').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: ${r.x}, clientY: ${r.y} }))`,
        );
      else await g.rightClick(r.x, r.y);
      await g.waitFor(() => g.eval(`!!document.querySelector('[role=menu]')`), {
        label: 'menu while using',
      });
      const items = await g.eval(
        `[...document.querySelectorAll('[role=menu] [role=menuitem]')].map(e => e.textContent.trim())`,
      );
      const di = items.indexOf('Drop');
      expect(di >= 0, `menu ${items}`);
      await g.eval(`document.querySelectorAll('[role=menu] [role=menuitem]')[${di}].click()`);
      await g.sleep(150);
      const s = await sel(),
        left = await g.state('inventory.slots[0]');
      expect(
        s === null && (await bar()) === null && (await ringed()).length === 0,
        `sel ${JSON.stringify(s)}`,
      );
      return `slot0 after drop ${JSON.stringify(left)}, sel null`;
    });
    await check('c5b', 'Swap selected slot clears selection', async () => {
      await reset();
      await menuUse(0);
      await g.store('s.swapInventorySlots(0, 1)');
      const s = await sel(),
        b = await bar();
      expect(s === null && b === null, `sel ${JSON.stringify(s)} bar ${!!b}`);
      return `slots now ${JSON.stringify(await g.state('inventory.slots.slice(0,2).map(x=>x&&x.itemId)'))}`;
    });
    await check('c5c', 'Swap OTHER slots keeps selection', async () => {
      await reset();
      await menuUse(0);
      await g.store('s.swapInventorySlots(1, 2)');
      const s = await sel();
      expect(s && s.slot === 0, `sel ${JSON.stringify(s)}`);
      return 'kept';
    });
  }),
);
