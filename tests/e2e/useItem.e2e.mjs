// Inventory "Use" flow: menu -> select, ring + bar, item-on-item/tree/NPC message, cancel paths, slot drop/swap.
// Fast base: runParallel desktop + phone (HUD DOM + store: renderer does not matter, webgl), fast ticks,
// teleportSettled, waits on the sheet fold / menu / selection / chat / position instead of fixed sleeps and tick
// waits, budget 60 s. Run: node tests/e2e/useItem.e2e.mjs
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9465; // combos use 9465..9466
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  const sel = () =>
    g.store('s.useSelection ? { slot: s.useSelection.slot, itemId: s.useSelection.itemId } : null');
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
  // Phone: the HUD sheet boots folded (slots 0x0); unfold/fold with a real tap on the chevron.
  const sheet = async (open) => {
    if (!g.touch) return;
    const want = open ? 'false' : 'true';
    const folded = () => g.eval(`document.querySelector('.hud').dataset.folded`);
    if ((await folded()) !== want) {
      await g.tapSelector('.sheet-fold');
      await g.waitFor(async () => (await folded()) === want, { label: `sheet folded=${want}` });
      await g.settleRect('.sheet-fold'); // the sheet slides: wait for the layout to stop moving
    }
  };
  const slot = async (i) => {
    await sheet(true);
    await g.tapSelector(SLOT(i));
  };
  const menuUse = async (i, foldAfter = false) => {
    await slot(i);
    await g.waitFor(() => g.eval(`!!document.querySelector('[role=menu]')`), { label: 'menu' });
    // Logs also offer "Light" first (firemaking), so find "Use" by label and require it before Drop/Examine.
    const items = await g.eval(
      `[...document.querySelectorAll('[role=menu] [role=menuitem]')].map(e => e.textContent.trim())`,
    );
    const ui = items.indexOf('Use');
    expect(ui >= 0 && ui <= 1 && items.indexOf('Drop') > ui, `menu ${items}`);
    await g.eval(`document.querySelectorAll('[role=menu] [role=menuitem]')[${ui}].click()`);
    await g.waitFor(() => g.eval(`!document.querySelector('[role=menu]')`), {
      label: 'menu closed after Use',
    });
    if (foldAfter) await sheet(false);
  };
  const bar = () =>
    g.eval(
      `(() => { const b = document.querySelector('.use-hint'); if (!b) return null; const x = b.querySelector('button').getBoundingClientRect(); return { text: b.textContent, w: x.width, h: x.height }; })()`,
    );
  const ringed = () =>
    g.eval(`[...document.querySelectorAll('.slot[data-selected]')].map(e => +e.dataset.slotIndex)`);
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
    await slot(1);
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
    await slot(0);
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
    await g.teleportSettled(tree.x, tree.y + 3);
    await menuUse(0, true);
    await g.tapObject(tree.id);
    // positive outcome first (message + walk over), then 2 more ticks for the "no chop started" negatives
    await g.waitChat(NOTHING, { timeoutMs: 5000 }).catch(() => {});
    await g.waitIdle({ timeoutMs: 5000 }).catch(() => {});
    await g.waitTicks(2);
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
    await g.teleportSettled(npc.x + 2, npc.y + 2);
    await menuUse(0, true);
    await g.tapObject(npc.id);
    // positive outcome first (message + walk over), then 2 more ticks for the "no talk opened" negatives
    await g.waitChat(NOTHING, { timeoutMs: 5000 }).catch(() => {});
    await g.waitIdle({ timeoutMs: 5000 }).catch(() => {});
    await g.waitTicks(2);
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
    await sheet(false);
    const p = await g.state('movement.position');
    const t = await g.targets();
    await g.teleportSettled(p.x, p.y);
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
    await menuUse(0, true);
    expect((await sel()) !== null, 'not selected');
    await g.tapTile(dest.x, dest.y);
    await g
      .waitState('movement.position', `q => q.x === ${dest.x} && q.y === ${dest.y}`, {
        timeoutMs: 5000,
      })
      .catch(() => {}); // expect() below reports the actual position
    await g.waitIdle({ timeoutMs: 5000 }).catch(() => {});
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
    await slot(0); // cancels; reselect via menu instead
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
    await g
      .waitFor(
        async () =>
          (await sel()) === null && !(await g.eval(`!!document.querySelector('.use-hint')`)),
        {
          label: 'selection cleared by Drop',
          timeoutMs: 3000,
        },
      )
      .catch(() => {}); // expect() below reports

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
});
