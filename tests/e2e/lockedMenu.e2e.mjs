// Locked gather menu rows (spots, rocks): greyed + reason, tap posts to chat, big enough, no console errors.
// Fast base: desktop + phone as parallel children (ports 9363-9364), ?tickMs=60, state waits, < 60 s budget.
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9363;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});
const SHOTS = new URL('./.shots-locked/', import.meta.url).pathname;
process.env.SHOTS_DIR ??= SHOTS;

const ROCKS = { copper: 'quarry_copper_1', iron: 'quarry_iron_1', coal: 'quarry_coal_1' };
const SPOTS = { net: 'shore_net_1', bait: 'shore_bait_1' };

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  const phone = vp === 'phone';
  // Open the context menu on a rock or spot by real right-click / long-press, return the rows.
  const openMenu = async (kind, id, want) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await g.closeOverlays();
      const t = await g.eval(
        kind === 'rock'
          ? `(async()=>{const w=await import('/src/features/world/index.ts');const R=await import('/src/render/index.ts');const k=w.WORLD_ROCKS.find(r=>r.nodeId==='${id}');return {x:k.x,y:k.y,up:(R.VIEW_HIT_BOUNDS[k.defId]||{up:24}).up}})()`
          : `(async()=>{const w=await import('/src/features/world/index.ts');const R=await import('/src/render/index.ts');const s=w.FISHING_SPOTS.find(r=>r.spotId==='${id}');const i=window.__idleRpg.store.getState().game.fishing.spots['${id}']?.tile??0;const t=s.tiles[i]??s.tiles[0];return {x:t.x,y:t.y,up:(R.VIEW_HIT_BOUNDS[s.defId]||{up:12}).up}})()`,
      );
      await g.teleportSettled(t.x, t.y + 3); // camera settle, not a fixed 500 ms
      // spots hop tiles: re-read right before pressing
      const t2 =
        kind === 'rock'
          ? t
          : await g.eval(
              `(async()=>{const w=await import('/src/features/world/index.ts');const s=w.FISHING_SPOTS.find(r=>r.spotId==='${id}');const i=window.__idleRpg.store.getState().game.fishing.spots['${id}']?.tile??0;return {...s.tiles[i]??s.tiles[0],up:${t.up}}})()`,
            );
      const p = await g.tileClient(t2.x, t2.y, -t.up / 2);
      if (!(await g.eval(`window.__e.topIsCanvas(${p.x}, ${p.y})`))) continue;
      if (phone) await g.longPress(p.x, p.y);
      else await g.rightClick(p.x, p.y);
      const ok = await g
        .waitFor(() => g.eval(`!!document.querySelector('.menu-item')`), {
          timeoutMs: 2000,
          label: 'menu',
        })
        .then(
          () => true,
          () => false,
        );
      if (!ok) continue;
      const rows = await g.eval(
        `[...document.querySelectorAll('.menu-item')].map(e=>{const r=e.getBoundingClientRect();return {t:e.textContent,locked:e.classList.contains('menu-item--locked'),aria:e.getAttribute('aria-disabled'),dis:e.disabled===true,reason:e.querySelector('.menu-item-reason')?.textContent??null,h:r.height,top:r.top,bottom:r.bottom}})`,
      );
      if (rows.some((r) => want.test(r.t))) return rows;
    }
    throw new Error(`menu with ${want} never opened for ${id}`);
  };
  const menuBox = () =>
    g.eval(
      `(()=>{const r=document.querySelector('.menu').getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:innerWidth,h:innerHeight}})()`,
    );
  const first = (rows, re) => {
    const r = rows.find((x) => re.test(x.t));
    if (!r) throw new Error(`no row ${re}: ${JSON.stringify(rows.map((x) => x.t))}`);
    return r;
  };

  // (no extra g.load: withCombos' boot is already a fresh save)
  await g.setInventory(['fishing_rod', 'fishing_bait', 'small_fishing_net', 'bronze_pickaxe']);

  await check(
    '1',
    'Fishing 1: bait row locked with reason; tap -> chat, no fishing, menu closes',
    async () => {
      await g.setLevel('fishing', 1);
      const rows = await openMenu('spot', SPOTS.bait, /Bait Fishing/);
      const row = first(rows, /Bait Fishing spot/);
      expect(row?.locked && row.aria === 'true' && !row.dis, `row ${JSON.stringify(row)}`);
      expect(/Requires Fishing 5 \(you: 1\)/.test(row.reason), `reason ${row.reason}`);
      await g.screenshot(`locked-${vp}`);
      const before = (await g.chatLines()).length;
      const rect = await g.rect('.menu-item--locked');
      await g.tap(rect.x, rect.y);
      await g.waitChat(/Requires Fishing 5 \(you: 1\)/).catch(() => null);
      // no fishing may start in the next 3 ticks (state-based tick wait, not a fixed sleep)
      const t0 = await g.state('tick');
      await g.waitState('tick', `t => t >= ${t0 + 3}`, { label: '3 ticks' });
      const chat = (await g.chatLines()).slice(before);
      expect(
        chat.some((l) => /Requires Fishing 5 \(you: 1\)/.test(l)),
        `chat ${JSON.stringify(chat)}`,
      );
      const sess = await g.state('fishing.session');
      const pend = await g.state('pendingFishing');
      expect(!sess && !pend, `fishing started ${JSON.stringify([sess, pend])}`);
      expect(!(await g.eval(`!!document.querySelector('.menu')`)), 'menu still open');
      return `row "${row.t}" reason "${row.reason}" chat ok`;
    },
  );

  await check('2', 'Fishing 5: bait row normal, tap starts fishing', async () => {
    await g.setLevel('fishing', 5);
    const rows = await openMenu('spot', SPOTS.bait, /Bait Fishing/);
    const row = first(rows, /Bait Fishing spot/);
    expect(row && !row.locked && row.aria === null && !row.reason, `row ${JSON.stringify(row)}`);
    const rect = await g.rect('.menu-item:not(.menu-item--locked)');
    await g.tap(rect.x, rect.y);
    await g.waitFor(
      async () => !!(await g.state('fishing.session')) || !!(await g.state('pendingFishing')),
      { label: 'fishing started' },
    );
    return 'fishing session/pending set';
  });

  await check('3', 'Iron rock Mining 1 / coal Mining 29 reasons', async () => {
    await g.setLevel('mining', 1);
    const a = first(await openMenu('rock', ROCKS.iron, /Mine Rock/), /Mine Rock/);
    expect(a?.locked && /^Requires Mining 15 \(you: 1\)$/.test(a.reason), JSON.stringify(a));
    await g.closeOverlays();
    await g.setLevel('mining', 29);
    const b = first(await openMenu('rock', ROCKS.coal, /Mine Rock/), /Mine Rock/);
    expect(b?.locked && /^Requires Mining 30 \(you: 29\)$/.test(b.reason), JSON.stringify(b));
    return `${a.reason} | ${b.reason}`;
  });

  await check('4', 'Net spot and copper rock unlocked at level 1', async () => {
    await g.setLevel('fishing', 1);
    await g.setLevel('mining', 1);
    const n = first(await openMenu('spot', SPOTS.net, /Net Fishing/), /Net Fishing spot/);
    expect(n && !n.locked, JSON.stringify(n));
    await g.closeOverlays();
    const c = first(await openMenu('rock', ROCKS.copper, /Mine Rock/), /Mine Rock/);
    expect(c && !c.locked, JSON.stringify(c));
    return 'net+copper unlocked';
  });

  await check('5', 'locked row >=44px, menu on screen', async () => {
    await g.setLevel('fishing', 1);
    const rows = await openMenu('spot', SPOTS.bait, /Bait Fishing/);
    const row = first(rows, /Bait Fishing spot/);
    const b = await menuBox();
    expect(row.locked && row.h >= 44, `locked h ${row.h}`);
    expect(
      rows.every((r) => r.h >= 44),
      `heights ${rows.map((r) => r.h)}`,
    );
    expect(b.l >= 0 && b.t >= 0 && b.r <= b.w && b.b <= b.h, `menu ${JSON.stringify(b)}`);
    return `locked h=${row.h} menu ${JSON.stringify(b)}`;
  });

  await check('6', 'no console errors', async () => {
    const e = g.consoleErrors();
    expect(e.length === 0, JSON.stringify(e).slice(0, 400));
    return '0 errors';
  });
});
