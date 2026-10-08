// New fish (trout/mackerel) level gates + XP + spot art. Run: node tests/e2e/newfish.e2e.mjs (base port E2E_PORT or 9051)
// Fast base: desktop + phone as parallel children, ?tickMs=60. The fishing session is STARTED by a real tap on the spot
// (live ticker, wait-on-state); the 70 catches per level are then stepped synchronously in-page through the game's own
// step() + interactSpot() (seeded rng, same browser module graph) instead of sampling ~25 s of wall-clock ticks.
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

process.env.SHOTS_DIR ??= new URL('./.shots-newfish', import.meta.url).pathname;
const XP = {
  raw_shrimp: 10,
  raw_anchovies: 36,
  raw_mackerel: 62,
  raw_sardine: 20,
  raw_herring: 30,
  raw_trout: 36,
};
const N = 70;
const PORT = Number(process.env.E2E_PORT ?? 9051);
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const spotOf = (g, id) =>
  g.eval(
    `(async () => { const w = await import('/src/features/world/index.ts'); return w.FISHING_SPOTS.find(s => s.spotId === ${JSON.stringify(id)}); })()`,
  );

/**
 * Start fishing `spotId` with a real tap at `level`, then step the game until N catches. Level is held by resetting
 * fishing xp (and stripping raw fish) after each catch; each catch records [itemId, xp gained]. Returns {tally, bad, n}.
 */
async function fish(g, spotId, level, tools) {
  const spot = await spotOf(g, spotId);
  await g.setLevel('fishing', level);
  await g.setInventory(tools);
  const idx = await g.state(`fishing.spots[${JSON.stringify(spotId)}]?.tile ?? 0`);
  const t = spot.tiles[idx] ?? spot.tiles[0];
  await g.teleportSettled(t.x, 52);
  await g.tapTile(t.x, t.y, -6); // real input starts the walk + session on the live ticker
  await g.waitState('', 'g => !!(g.fishing.session || g.pendingFishing)', {
    label: 'tap started fishing',
  });
  return g.eval(`(async () => {
    const [{ step }, { interactSpot }, { CONTENT }, P, R] = await Promise.all([import('/src/app/game/step.ts'),
      import('/src/app/game/fishing.ts'), import('/src/app/registry.ts'), import('/src/core/progression/index.ts'),
      import('/src/core/engine/rng.ts')]);
    const id = ${JSON.stringify(spotId)}, base = P.xpForLevel(${level}), rng = R.createRng(${level * 7919});
    const out = { tally: {}, bad: [], n: 0, ticks: 0 };
    const strip = (g) => ({ ...g, inventory: { ...g.inventory, slots: g.inventory.slots.map((x) => (x && x.itemId.startsWith('raw_') ? null : x)) },
      progression: { ...g.progression, xp: { ...g.progression.xp, fishing: base } } });
    // The live ticker may already have landed a catch since the tap: start the stepped run from a clean level.
    let g = strip(window.__idleRpg.store.getState().game);
    for (let tick = 1; tick < 40000 && out.n < ${N}; tick++) {
      if (!g.fishing.session && !g.pendingFishing) g = interactSpot(g, CONTENT, id);
      g = step(g, { tick: 1e6 + tick, rng }).state; out.ticks = tick;
      const xp = g.progression.xp.fishing, got = [];
      for (const sl of g.inventory.slots) if (sl && sl.itemId.startsWith('raw_')) got.push(sl.itemId);
      for (const k of new Set(got)) { out.tally[k] = (out.tally[k] || 0) + 1; out.n++; out.bad.push([k, xp - base]); }
      if (got.length || xp !== base) g = strip(g);
    }
    return out; })()`);
}

const summarise = (t) => `n=${t.n} ticks=${t.ticks} ${JSON.stringify(t.tally)}`;
const xpOk = (t) => t.bad.every(([k, d]) => d === XP[k]);
const xpBad = (t) => JSON.stringify(t.bad.filter(([k, d]) => d !== XP[k]).slice(0, 5));

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp) => {
    const bait = ['fishing_rod', { itemId: 'fishing_bait', quantity: 5000 }];
    if (vp === 'desktop') {
      await check('c1a', 'bait spot @24: no trout', async () => {
        const t = await fish(g, 'shore_bait_1', 24, bait);
        expect(t.n >= 40, 'too few catches ' + summarise(t));
        expect(!t.tally.raw_trout, 'trout at 24 ' + summarise(t));
        expect(xpOk(t), 'xp mismatch ' + xpBad(t));
        return summarise(t);
      });
      await check(
        'c1b',
        'bait spot @25: trout appears, sardine+herring too, xp right',
        async () => {
          const t = await fish(g, 'shore_bait_1', 25, bait);
          expect(
            t.tally.raw_trout > 0 && t.tally.raw_sardine > 0 && t.tally.raw_herring > 0,
            summarise(t),
          );
          expect(xpOk(t), 'xp mismatch ' + xpBad(t));
          return summarise(t);
        },
      );
      await check('c2a', 'net spot @29: no mackerel', async () => {
        const t = await fish(g, 'shore_net_1', 29, ['small_fishing_net']);
        expect(t.n >= 40, 'too few catches ' + summarise(t));
        expect(!t.tally.raw_mackerel, 'mackerel at 29 ' + summarise(t));
        expect(xpOk(t), 'xp mismatch ' + xpBad(t));
        return summarise(t);
      });
      await check(
        'c2b',
        'net spot @30: mackerel appears, shrimp+anchovies too, xp right',
        async () => {
          const t = await fish(g, 'shore_net_1', 30, ['small_fishing_net']);
          expect(
            t.tally.raw_mackerel > 0 && t.tally.raw_shrimp > 0 && t.tally.raw_anchovies > 0,
            summarise(t),
          );
          expect(xpOk(t), 'xp mismatch ' + xpBad(t));
          return summarise(t);
        },
      );
    }
    await check('c3-' + vp, 'trout/mackerel icons show in inventory slots', async () => {
      await g.setInventory([
        { itemId: 'raw_trout', quantity: 1 },
        { itemId: 'raw_mackerel', quantity: 1 },
      ]);
      const read = `(() => [...document.querySelectorAll('.slot')].slice(0, 2).map((e) => { const i = e.querySelector('img,svg,canvas'); const b = e.getBoundingClientRect(); return { has: !!i, src: i?.getAttribute('src')?.slice(0, 60) ?? null, w: b.width, label: e.getAttribute('aria-label') }; }))()`;
      await g.waitFor(async () => (await g.eval(read)).every((x) => x.has), {
        label: 'icons rendered',
      });
      const r = await g.eval(read);
      expect(r.length === 2 && r.every((x) => x.has), JSON.stringify(r));
      expect(r[0].src !== r[1].src, 'same icon ' + JSON.stringify(r));
      await g.screenshot('inv-' + vp);
      return JSON.stringify(r);
    });
    if (vp === 'phone') {
      await check('c4', 'phone close-up shots of net + bait spots saved', async () => {
        await g.setInventory(['small_fishing_net']);
        const { writeFileSync, mkdirSync } = await import('node:fs');
        mkdirSync(process.env.SHOTS_DIR, { recursive: true });
        for (const [id, name] of [
          ['shore_net_1', 'net'],
          ['shore_bait_1', 'bait'],
        ]) {
          const t = (await spotOf(g, id)).tiles[0];
          await g.teleportSettled(t.x, 52);
          await g.screenshot('phone-' + name);
          const p = await g.tileClient(t.x, t.y, -6);
          const { data } = await g.cdp.send('Page.captureScreenshot', {
            format: 'png',
            clip: {
              x: Math.max(0, p.x - 130),
              y: Math.max(0, p.y - 110),
              width: 260,
              height: 220,
              scale: 2,
            },
          });
          writeFileSync(
            process.env.SHOTS_DIR + '/phone-' + name + '-close.png',
            Buffer.from(data, 'base64'),
          );
        }
        return 'saved';
      });
    }
  }),
);
