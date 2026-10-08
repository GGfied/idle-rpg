// Cook on a fire: tap fire / Use-on / long-press menu, burn vs cook XP, level gate, cancel, fire burn-out, meat, scope.
// Setup: the fire is lit for real (tinderbox + logs via the store's lightSlot); raw food is placed with
// the inventory precondition hook (there is no fish source in reach). Run: node tests/e2e/cookFire.e2e.mjs
// Fast base: desktop + phone run as parallel children (ports 9355-9356), ?tickMs=60, waits on game state/ticks.
import { check, runParallel, withCombos } from './lib.mjs';

const PORT = 9355;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const fires = (g) => g.state('firemaking.fires');
const cooking = (g) => g.state('cooking.session');
const xp = (g) => g.state('progression.xp.cooking ?? 0');
const inv = async (g) => (await g.state('inventory.slots')).filter(Boolean).map((s) => s.itemId);
const count = async (g, id) => (await inv(g)).filter((x) => x === id).length;

/** Plant a fire (ttl ticks) on a walkable tile near the player and return it. */
async function plant(g, ttl = 5000) {
  return g.eval(`(async () => {
    const { CONTENT } = await import('/src/app/registry.ts');
    const s = window.__idleRpg.store; const gm = s.getState().game; const p = gm.movement.position;
    let t = null;
    for (const [dx, dy] of [[2,0],[0,2],[-2,0],[0,-2],[3,0],[0,3],[-3,0],[0,-3]])
      if (CONTENT.grid.isWalkable(p.x+dx, p.y+dy)) { t = { x: p.x+dx, y: p.y+dy }; break; }
    const f = { id: 'fireT' + gm.firemaking.nextId, tile: t, logsId: 'logs', expiresAtTick: gm.tick + ${ttl} };
    s.setState({ game: { ...gm, firemaking: { ...gm.firemaking, nextId: gm.firemaking.nextId + 1, fires: [...gm.firemaking.fires, f] } } });
    return f; })()`);
}
const clearFires = (g) =>
  g.update(
    `({ ...g, firemaking: { ...g.firemaking, fires: [] }, cooking: { ...g.cooking, session: null }, pendingCook: null })`,
  );
async function tapFire(g, t) {
  await g.settle();
  return g.tapTile(t.x, t.y, -14);
}
const visible = async (g, css) => ((await g.rect(css))?.w ?? 0) > 0;
const raw = (id, n) => Array.from({ length: n }, () => id);
/** Wait until n more game ticks have run (state-based: reads game.tick, no fixed sleep). */
async function ticksPass(g, n) {
  const t0 = await g.state('tick');
  await g.waitState('tick', `t => t >= ${t0 + n}`, { label: `${n} ticks` });
}
const waitIdle = (g) =>
  g.waitFor(async () => !(await cooking(g)) && !(await g.state('pendingCook')), {
    label: 'cooking ended',
    timeoutMs: 30000,
  });

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  await g.setInventory(['tinderbox', 'logs']);
  await g.store('s.lightSlot(1)');
  await g.waitFor(async () => (await fires(g)).length === 1, { label: 'real fire lit' });
  await g.waitFor(async () => (await g.state('movement.path')).length === 0, {
    label: 'stepped aside',
  });
  await g.update(
    `({ ...g, firemaking: { ...g.firemaking, fires: g.firemaking.fires.map((f) => ({ ...f, expiresAtTick: g.tick + 9000 })) } })`,
  );
  const fire0 = (await fires(g))[0];

  await check(
    'c1',
    'tap fire with raw_shrimp: walk adjacent, cook 1 per 4 ticks, swap in slot, chat, XP 30/0',
    async () => {
      await g.setInventory(raw('raw_shrimp', 16));
      await g.update(`({ ...g, chat: [] })`);
      const xp0 = await xp(g);
      // cadence: record the game tick of every raw-count drop in-page (store subscriber; exact, unlike polling,
      // which merged several drops into one under machine load ~280)
      await g.eval(`(() => { const n = (gm) => gm.inventory.slots.filter((x) => x && x.itemId === 'raw_shrimp').length;
        let last = n(window.__idleRpg.store.getState().game); window.__cookMarks = [];
        window.__cookUnsub = window.__idleRpg.store.subscribe((st) => { const c = n(st.game); if (c !== last) { if (c < last) window.__cookMarks.push(st.game.tick); last = c; } }); })()`);
      await tapFire(g, fire0.tile);
      await g
        .waitFor(async () => !!(await cooking(g)), { label: 'cooking session' })
        .catch(async (e) => {
          throw new Error(
            e.message +
              ' state ' +
              JSON.stringify({
                pos: await g.state('movement.position'),
                path: await g.state('movement.path'),
                pc: await g.state('pendingCook'),
                fire: fire0.tile,
                chat: (await g.chatLines()).slice(-3),
              }),
          );
        });
      const pos = await g.state('movement.position');
      g.expect(
        Math.max(Math.abs(pos.x - fire0.tile.x), Math.abs(pos.y - fire0.tile.y)) === 1 ||
          Math.abs(pos.x - fire0.tile.x) + Math.abs(pos.y - fire0.tile.y) === 1,
        'adjacent ' + JSON.stringify(pos),
      );
      await g.waitFor(async () => (await count(g, 'raw_shrimp')) <= 12, {
        label: '4 cooked',
        timeoutMs: 30000,
      });
      const marks = await g.eval('(() => { window.__cookUnsub(); return window.__cookMarks; })()');
      const gaps = marks.slice(1).map((t, i) => t - marks[i]);
      await waitIdle(g);
      const chat = await g.chatLines();
      const ok = chat.filter((l) => l === 'You cook the shrimps.').length;
      const burn = chat.filter((l) => l === 'You accidentally burn the shrimps.').length;
      const cooked = await count(g, 'shrimps'),
        burnt = await count(g, 'burnt_fish');
      g.expect(ok + burn === 16, `chat ${ok}+${burn} != 16`);
      g.expect(ok === cooked && burn === burnt, `inv ${cooked}/${burnt} vs chat ${ok}/${burn}`);
      g.expect(ok > 0 && burn > 0, `need both outcomes (${ok}/${burn}) - rerun`);
      g.expect((await xp(g)) - xp0 === 30 * ok, `xp +${(await xp(g)) - xp0} want ${30 * ok}`);
      g.expect(gaps.length >= 3, 'cadence marks ' + marks);
      g.expect(
        gaps.every((d) => d >= 3 && d <= 5) &&
          Math.abs(gaps.reduce((a, b) => a + b, 0) / gaps.length - 4) <= 0.5,
        'cadence gaps ' + gaps,
      );
      g.expect((await count(g, 'raw_shrimp')) === 0, 'raw left');
      g.expect(
        chat.includes('You have nothing left to cook.'),
        'noRawFood line missing: ' + chat.slice(-3),
      );
      const slots = await g.state('inventory.slots');
      g.expect(
        slots.slice(0, 16).every((s) => s && (s.itemId === 'shrimps' || s.itemId === 'burnt_fish')),
        'slot swap',
      );
      const lvl = await g.state('progression.xp.cooking');
      const notice = await g.store('s.levelUp');
      const lu = chat.filter((l) => /advanced your Cooking level/.test(l)).length;
      g.expect(ok < 3 || lu >= 1, 'level-up chat expected after ' + ok * 30 + ' xp');
      return `${vp}: cooked ${ok} burnt ${burn}, xp +${30 * ok}, gaps ${gaps}, levelUpChat ${lu}, notice ${JSON.stringify(notice)} xp ${lvl}`;
    },
  );

  await check('c2', 'Use raw_sardine on fire (Use menu then tap fire) cooks sardines', async () => {
    await g.setInventory(raw('raw_sardine', 3));
    await g.update(`({ ...g, chat: [] })`);
    if (await visible(g, '[aria-label="Expand panel"]'))
      await g.tapSelector('[aria-label="Expand panel"]');
    await g.tapSelector('.slot-full'); // opens the slot menu
    const items = await g.eval(
      `[...document.querySelectorAll('.menu-item')].map((e) => e.textContent.trim())`,
    );
    g.expect(items[0] === 'Use', 'menu ' + items);
    await g.tapSelector('.menu-item');
    if ((await visible(g, '[aria-label="Collapse panel"]')) && g.touch)
      await g.tapSelector('[aria-label="Collapse panel"]');
    g.expect(!!(await g.store('s.useSelection')), 'use selection set');
    await tapFire(g, fire0.tile);
    await g.waitFor(async () => (await count(g, 'raw_sardine')) === 0 && !(await cooking(g)), {
      label: 'sardines cooked',
      timeoutMs: 20000,
    });
    const c = await count(g, 'sardine'),
      b = await count(g, 'burnt_fish');
    const chat = await g.chatLines();
    g.expect(c + b === 3, `sardine ${c} burnt ${b}`);
    g.expect(
      chat.filter((l) => /cook the sardine|burn the sardine/.test(l)).length === 3,
      'chat ' + chat,
    );
    return `${vp}: sardine ${c}, burnt ${b}`;
  });

  await check('c3', 'long-press / right-click fire shows Cook + Examine', async () => {
    await g.setInventory(raw('raw_shrimp', 2));
    const p = await g.tileClient(fire0.tile.x, fire0.tile.y, -14);
    await g.longPress(p.x, p.y);
    await g.waitFor(
      async () => (await g.eval(`document.querySelectorAll('.menu-item').length`)) > 0,
      { label: 'menu' },
    );
    const items = await g.eval(
      `[...document.querySelectorAll('.menu-item')].map((e) => e.textContent.trim())`,
    );
    g.expect(
      items.some((x) => /^Cook/.test(x)) && items.some((x) => /^Examine/.test(x)),
      'items ' + items,
    );
    g.expect(!(await cooking(g)), 'menu open does not start cooking');
    await g.eval(
      `[...document.querySelectorAll('.menu-item')].find((e) => e.textContent.trim().startsWith('Examine')).click()`,
    );
    await g.closeOverlays();
    return `${vp}: menu ${JSON.stringify(items)}`;
  });

  await check('c4', 'raw_trout at Cooking 1 refused, nothing consumed', async () => {
    await g.update(
      `({ ...g, chat: [], progression: { ...g.progression, xp: { ...g.progression.xp, cooking: 0 } } })`,
    );
    await g.setInventory(raw('raw_trout', 2));
    await tapFire(g, fire0.tile);
    await g.waitFor(async () => (await g.chatLines()).some((l) => /Cooking level of 15/.test(l)), {
      label: 'level gate line',
    });
    await ticksPass(g, 6);
    g.expect(
      (await count(g, 'raw_trout')) === 2 &&
        (await count(g, 'trout')) === 0 &&
        (await count(g, 'burnt_fish')) === 0,
      'consumed',
    );
    g.expect((await xp(g)) === 0 && !(await cooking(g)), 'xp/session');
    return `${vp}: ${(await g.chatLines()).find((l) => /level of 15/.test(l))}`;
  });

  await check('c5', 'walking away cancels cooking', async () => {
    await g.setInventory(raw('raw_shrimp', 10));
    await tapFire(g, fire0.tile);
    await g.waitFor(async () => !!(await cooking(g)), { label: 'cooking' });
    // let at least one shrimp cook before walking away (state, not a 5-tick sleep)
    await g.waitFor(async () => (await count(g, 'raw_shrimp')) < 10, { label: 'first cook' });
    const far =
      await g.eval(`(async () => { const { CONTENT } = await import('/src/app/registry.ts'); const p = window.__idleRpg.store.getState().game.movement.position;
        for (const [dx, dy] of [[0,-4],[0,4],[-4,0],[4,0],[-3,-3],[3,3]]) if (CONTENT.grid.isWalkable(p.x+dx, p.y+dy)) return { x: p.x+dx, y: p.y+dy }; })()`);
    await g.tapTile(far.x, far.y);
    await g.waitFor(async () => !(await cooking(g)), { label: 'session cleared' });
    const left = await count(g, 'raw_shrimp');
    await ticksPass(g, 10);
    g.expect((await count(g, 'raw_shrimp')) === left, 'kept cooking after walking');
    g.expect(left > 0 && left < 10, 'raw left ' + left);
    return `${vp}: raw left ${left}, stayed after 10 ticks`;
  });

  await check('c6', 'fire burning out mid-cook stops cooking (sourceGone)', async () => {
    await clearFires(g);
    await g.update(`({ ...g, chat: [] })`);
    const f = await plant(g, 5000);
    await g.setInventory(raw('raw_shrimp', 12));
    await tapFire(g, f.tile);
    await g.waitFor(async () => !!(await cooking(g)), { label: 'cooking' });
    await g.waitFor(async () => (await count(g, 'raw_shrimp')) < 12, { label: 'first cook' });
    await g.update(
      `({ ...g, firemaking: { ...g.firemaking, fires: g.firemaking.fires.map((x) => ({ ...x, expiresAtTick: g.tick + 1 })) } })`,
    );
    await g.waitFor(async () => !(await cooking(g)), { label: 'session ended' });
    const left = await count(g, 'raw_shrimp');
    await ticksPass(g, 8);
    const msg = await g.eval(
      `import('/src/features/skills/cooking/index.ts').then((m) => m.COOKING_MESSAGES.stopped.sourceGone)`,
    );
    const chat = await g.chatLines();
    g.expect(chat.includes(msg), `sourceGone "${msg}" not in chat tail ${chat.slice(-3)}`);
    g.expect(left > 0 && (await count(g, 'raw_shrimp')) === left, 'raw consumed after fire gone');
    return `${vp}: raw left ${left}, "${msg}"`;
  });

  await check(
    'c7',
    'raw_chicken cooks to cooked_chicken / burnt_meat (placed via inventory hook)',
    async () => {
      await clearFires(g);
      const f = await plant(g, 5000);
      await g.update(`({ ...g, chat: [] })`);
      await g.setInventory(raw('raw_chicken', 8));
      await tapFire(g, f.tile);
      await waitIdle(g);
      const c = await count(g, 'cooked_chicken'),
        b = await count(g, 'burnt_meat');
      g.expect(c + b === 8 && c > 0 && b > 0, `chicken ${c} burnt_meat ${b}`);
      g.expect((await count(g, 'burnt_fish')) === 0, 'meat burnt into burnt_fish');
      return `${vp}: cooked_chicken ${c}, burnt_meat ${b}`;
    },
  );

  await check('c8', 'scope: single-item recipes only, fire menu = Cook/Examine', async () => {
    const r =
      await g.eval(`(async () => { const m = await import('/src/features/skills/cooking/index.ts'); const f = await import('/src/app/game/menus.ts');
        return { recipes: m.COOKING_RECIPES.map((r) => Object.keys(r).filter((k) => /Id$/.test(k)).join()), menu: f.facilityMenu('fire').entries.map((e) => e.label) }; })()`);
    g.expect(
      r.recipes.every((k) => k === 'rawId,cookedId,burntId'),
      'recipe shapes ' + JSON.stringify(r.recipes),
    );
    g.expect(r.recipes.length === 8, 'recipe count ' + r.recipes.length);
    return `${vp}: ${r.recipes.length} recipes; menu ${JSON.stringify(r.menu)}`;
  });
  await clearFires(g);
});
