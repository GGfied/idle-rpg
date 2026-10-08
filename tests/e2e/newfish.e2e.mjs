// New fish (trout/mackerel) level gates + XP + spot art. Run: node tests/e2e/newfish.e2e.mjs (port E2E_PORT or 5251)
import { check, expect, forEachViewport, withGame } from './lib.mjs';

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

/** Drive one spot kind at a fixed level; returns {tally, bad}. Level held by resetting xp after each catch. */
async function fish(g, spotId, kind, level, tools) {
  const spot = await g.eval(
    `(async () => { const w = await import('/src/features/world/index.ts'); return w.FISHING_SPOTS.find(s => s.spotId === ${JSON.stringify(spotId)}); })()`,
  );
  await g.setLevel('fishing', level);
  await g.setInventory(tools);
  await g.eval(`(async () => { const P = await import('/src/core/progression/index.ts'); const s = window.__idleRpg.store;
    const base = P.xpForLevel(${level}); window.__t = { tally: {}, bad: [], n: 0 }; let busy = false; let prev = {};
    window.__unsub = s.subscribe((st) => { if (busy) return; const g = st.game; const xp = g.progression.xp.fishing;
      const cnt = {}; for (const sl of g.inventory.slots) if (sl && sl.itemId.startsWith('raw_')) cnt[sl.itemId] = (cnt[sl.itemId] || 0) + sl.quantity;
      for (const k in cnt) if (cnt[k] > (prev[k] || 0)) { window.__t.tally[k] = (window.__t.tally[k] || 0) + 1; window.__t.n++; window.__t.bad.push([k, xp - base]); }
      prev = cnt; if (xp !== base || Object.keys(cnt).length) { busy = true; const slots = g.inventory.slots.map((x) => (x && x.itemId.startsWith('raw_') ? null : x));
        s.setState({ game: { ...g, inventory: { ...g.inventory, slots }, progression: { ...g.progression, xp: { ...g.progression.xp, fishing: base } } } }); busy = false; prev = {}; } }); })()`);
  await g.eval('window.__idleRpg.setTickMs(30)');
  const deadline = Date.now() + 100e3;
  let first = true;
  while (Date.now() < deadline && (await g.eval('window.__t.n')) < N) {
    const sess = await g.state('fishing.session');
    const pend = await g.state('pendingFishing');
    if (!sess && !pend) {
      const idx = await g.state(`fishing.spots[${JSON.stringify(spotId)}]?.tile ?? 0`);
      const t = spot.tiles[idx] ?? spot.tiles[0];
      await g.teleport(t.x, 52, { settleMs: first ? 700 : 250 });
      if (first) await g.tapTile(t.x, t.y, -6);
      else
        await g.eval(`window.__idleRpg.store.getState().interactSpot(${JSON.stringify(spotId)})`);
      first = false;
    }
    await g.sleep(150);
  }
  await g.eval('window.__unsub(); window.__idleRpg.setTickMs(60)');
  return g.eval('window.__t');
}

const summarise = (t) => `n=${t.n} ${JSON.stringify(t.tally)}`;
const xpOk = (t) => t.bad.every(([k, d]) => d === XP[k]);

await withGame(
  { port: 5251 },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    const desk = vp === 'desktop';
    const bait = ['fishing_rod', { itemId: 'fishing_bait', quantity: 5000 }];
    if (desk) {
      let t;
      await check('c1a', 'bait spot @24: no trout', async () => {
        t = await fish(g, 'shore_bait_1', 'bait', 24, bait);
        expect(t.n >= 40, 'too few catches ' + summarise(t));
        expect(!t.tally.raw_trout, 'trout at 24 ' + summarise(t));
        expect(xpOk(t), 'xp mismatch ' + JSON.stringify(t.bad.slice(0, 5)));
        return summarise(t);
      });
      await check(
        'c1b',
        'bait spot @25: trout appears, sardine+herring too, xp right',
        async () => {
          t = await fish(g, 'shore_bait_1', 'bait', 25, bait);
          expect(
            t.tally.raw_trout > 0 && t.tally.raw_sardine > 0 && t.tally.raw_herring > 0,
            summarise(t),
          );
          expect(
            xpOk(t),
            'xp mismatch ' + JSON.stringify(t.bad.filter(([k, d]) => d !== XP[k]).slice(0, 5)),
          );
          return summarise(t);
        },
      );
      await check('c2a', 'net spot @29: no mackerel', async () => {
        t = await fish(g, 'shore_net_1', 'net', 29, ['small_fishing_net']);
        expect(t.n >= 40, 'too few catches ' + summarise(t));
        expect(!t.tally.raw_mackerel, 'mackerel at 29 ' + summarise(t));
        expect(xpOk(t), 'xp mismatch');
        return summarise(t);
      });
      await check(
        'c2b',
        'net spot @30: mackerel appears, shrimp+anchovies too, xp right',
        async () => {
          t = await fish(g, 'shore_net_1', 'net', 30, ['small_fishing_net']);
          expect(
            t.tally.raw_mackerel > 0 && t.tally.raw_shrimp > 0 && t.tally.raw_anchovies > 0,
            summarise(t),
          );
          expect(
            xpOk(t),
            'xp mismatch ' + JSON.stringify(t.bad.filter(([k, d]) => d !== XP[k]).slice(0, 5)),
          );
          return summarise(t);
        },
      );
    }
    await check('c3-' + vp, 'trout/mackerel icons show in inventory slots', async () => {
      await g.setInventory([
        { itemId: 'raw_trout', quantity: 1 },
        { itemId: 'raw_mackerel', quantity: 1 },
      ]);
      await g.sleep(300);
      const r = await g.eval(
        `(() => { const s = [...document.querySelectorAll('.slot')].slice(0, 2).map((e) => { const i = e.querySelector('img,svg,canvas'); const b = e.getBoundingClientRect(); return { has: !!i, src: i?.getAttribute('src')?.slice(0, 60) ?? null, w: b.width, label: e.getAttribute('aria-label') }; }); return s; })()`,
      );
      expect(r.length === 2 && r.every((x) => x.has), JSON.stringify(r));
      expect(r[0].src !== r[1].src, 'same icon ' + JSON.stringify(r));
      await g.screenshot('inv-' + vp);
      return JSON.stringify(r);
    });
    if (!desk) {
      await check('c4', 'phone close-up shots of net + bait spots saved', async () => {
        await g.setInventory(['small_fishing_net']);
        for (const [id, name] of [
          ['shore_net_1', 'net'],
          ['shore_bait_1', 'bait'],
        ]) {
          const t = await g.eval(
            `(async () => { const w = await import('/src/features/world/index.ts'); return w.FISHING_SPOTS.find(s => s.spotId === '${id}').tiles[0]; })()`,
          );
          await g.teleport(t.x, 52, { settleMs: 1500 });
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
          (await import('node:fs')).writeFileSync(
            process.env.SHOTS_DIR + '/phone-' + name + '-close.png',
            Buffer.from(data, 'base64'),
          );
        }
        return 'saved';
      });
    }
  }),
);
