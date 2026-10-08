// Realistic tree art: tree_* textures + variants, oak art, stump/respawn textures, canopy+trunk taps still chop.
// Fast base: desktop/phone x webgl/canvas as parallel children (the art is the subject), ?tickMs=60, wait-on-state
// (view exists / stump visible / chat line), teleport + setInventory/setLevels preconditions, budget 60 s.
// Run: node tests/e2e/trees.e2e.mjs   (SHOTS_DIR=... to keep the standing/oak/stump screenshots)
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9301; // C7 port block 9301-9350; 4 combos use 9301-9304
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl', 'canvas'],
  budgetMs: BUDGET_MS,
});

const VIEW = (id) => `window.__idleRpg.scene().camera.scene.views.tree(${JSON.stringify(id)})`;
const KEYS = (id) =>
  `(() => { const v = ${VIEW(id)}; if (!v) return null; const l = v.container.list; return { full: l[0].texture.key, stump: l[1].texture.key, fullVis: l[0].visible, stumpVis: l[1].visible }; })()`;

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp, renderer) => {
  const tag = `${vp}/${renderer}`;
  await g.setInventory(['bronze_axe']);
  await g.setLevels({ woodcutting: 30 });
  const all = await g.targets();
  const trees = all.filter((t) => t.kind === 'tree');
  const oaks = all.filter((t) => t.kind === 'oak_tree');
  // Views are built near the player: in ONE page eval, teleport beside each tree not read yet, wait page frames
  // until its view exists (no fixed sleep), then read every listed tree whose view exists now (one hop covers
  // several neighbours). Same per-tree data as the old one-teleport-per-tree loop, without ~85 CDP round trips.
  const keysAt = async (list) =>
    g.eval(`(async () => {
        const list = ${JSON.stringify(list.map((t) => ({ id: t.id, x: t.x, y: t.y })))};
        const keys = (id) => ${KEYS('__ID__').replace('"__ID__"', 'id')};
        const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
        const got = new Map();
        for (const t of list) {
          if (got.has(t.id)) continue;
          window.__e.set((g) => ({ ...g, movement: { ...g.movement, position: { x: t.x, y: t.y + 2 }, path: [] }, pendingInteraction: null, gathering: { ...g.gathering, session: null } }));
          for (let i = 0; i < 600 && !keys(t.id); i++) await raf();
          for (const u of list) if (!got.has(u.id)) { const k = keys(u.id); if (k) got.set(u.id, { id: u.id, ...k }); }
          if (!got.has(t.id)) got.set(t.id, { id: t.id, full: null, stump: null, missing: true });
        }
        return list.map((t) => got.get(t.id));
      })()`);
  const nearStart = trees.filter((t) => t.x < 40 && t.y < 30).slice(0, 12);
  const wood = trees.filter((t) => t.x >= 40 && t.y <= 25).slice(0, 12);

  await check('t1', 'start area + Whispering Wood trees use tree_* art, >1 variant', async () => {
    const a = await keysAt(nearStart);
    const b = await keysAt(wood);
    const rows = [...a, ...b];
    expect(a.length >= 3 && b.length >= 3, `${tag}: few trees ${a.length}/${b.length}`);
    const bad = rows.filter(
      (r) => !r.full || !/^tree_tree_\d+$/.test(r.full) || !/_stump$/.test(r.stump),
    );
    expect(bad.length === 0, `${tag}: bad keys ${JSON.stringify(bad.slice(0, 3))}`);
    const vs = new Set(rows.map((r) => r.full));
    expect(vs.size > 1, `${tag}: only variants ${[...vs]}`);
    await g.teleportSettled(nearStart[0].x, nearStart[0].y + 3);
    await g.screenshot(`trees-${vp}-${renderer}-standing`);
    return `${tag}: ${rows.length} trees ok, variants ${[...vs].join(',')}`;
  });

  await check('t2', 'oak trees use their own art', async () => {
    expect(oaks.length > 0, 'no oaks');
    const r = await keysAt(oaks);
    const bad = r.filter(
      (x) => !/^tree_oak_tree_\d+$/.test(x.full) || !/^tree_oak_tree_\d+_stump$/.test(x.stump),
    );
    expect(bad.length === 0, `${tag}: ${JSON.stringify(bad.slice(0, 3))}`);
    await g.teleportSettled(oaks[0].x, oaks[0].y + 3);
    await g.screenshot(`trees-${vp}-${renderer}-oak`);
    return `${tag}: ${r.length} oaks, e.g. ${r[0].full}`;
  });

  await check('t3', 'chop -> stump texture, then standing art after respawn', async () => {
    const t = nearStart[0];
    await g.teleportSettled(t.x, t.y + 3);
    await g.waitFor(() => g.eval(KEYS(t.id)), { label: `view ${t.id}` });
    const before = await g.eval(KEYS(t.id));
    // Per-frame texture log (rAF), so a one-frame wrong texture is caught regardless of tick speed.
    await g.eval(
      `(() => { window.__log = []; const f = () => { try { const v = ${VIEW(t.id)}; if (v) { const l = v.container.list; const s = (l[1].visible ? 'S:' + l[1].texture.key : '') + (l[0].visible ? 'F:' + l[0].texture.key : ''); const a = window.__log; if (a[a.length - 1] !== s) a.push(s); } } catch {} requestAnimationFrame(f); }; f(); })()`,
    );
    await g.tapObject(t.id);
    await g.waitFor(async () => (await g.eval('window.__log')).some((s) => s.startsWith('S:')), {
      label: 'stump shown',
    });
    await g.waitFor(
      async () => {
        const l = await g.eval('window.__log');
        return l[l.length - 1]?.startsWith('F:') && l.some((s) => s.startsWith('S:'));
      },
      { label: 'respawn', timeoutMs: 30000 },
    );
    const log = await g.eval('window.__log');
    const stumps = log.filter((s) => s.startsWith('S:'));
    expect(
      stumps.every((s) => s === 'S:' + before.stump),
      `${tag}: stump keys ${stumps}`,
    );
    expect(
      log[log.length - 1] === 'F:' + before.full,
      `${tag}: after ${log[log.length - 1]} vs ${before.full}`,
    );
    return `${tag}: sequence ${JSON.stringify(log)}`;
  });

  await check('t3b', 'stump screenshot (frame frozen while depleted)', async () => {
    // Old version slowed ticks to 600 ms + slept 500 ms so the stump outlived the screenshot. Now: chop at fast
    // ticks, and the moment the stump shows, freeze Phaser's loop (g.synth) so the drawn frame stays the stump.
    const t = nearStart[0];
    await g.waitFor(() => g.eval(`${VIEW(t.id)}.container.list[0].visible`), {
      label: 'standing before re-chop',
      timeoutMs: 30000,
    });
    await g.teleportSettled(t.x, t.y + 2);
    await g.tapObject(t.id);
    await g.waitFor(() => g.eval(`${VIEW(t.id)}.container.list[1].visible`), {
      label: 'stump',
      timeoutMs: 20000,
    });
    await g.synth.freeze();
    try {
      await g.synth.step(16.7, 1); // one full frame with the stump state
      const shown = await g.eval(`${VIEW(t.id)}.container.list[1].visible`);
      const f = await g.screenshot(`trees-${vp}-${renderer}-stump`);
      expect(shown, `${tag}: stump no longer visible in the frozen frame`);
      return `${tag}: stump frame ${f ?? '(SHOTS_DIR unset)'}`;
    } finally {
      await g.synth.thaw();
    }
  });

  await check('t4', 'tap canopy and trunk both chop', async () => {
    const t = nearStart[1];
    const res = [];
    for (const [name, f] of [
      ['canopy', 0.8],
      ['trunk', 0.12],
    ]) {
      await g.teleport(t.x, t.y + 2, { settleMs: 0 });
      await g.waitFor(() => g.eval(`${VIEW(t.id)}?.container.list[0].visible`), {
        label: 'standing',
        timeoutMs: 30000,
      });
      const n0 = await g.chatCount('log');
      await g.teleportSettled(t.x, t.y + 2);
      const p = await g.tileClient(t.x, t.y, -t.up * f);
      expect(await g.page(`topIsCanvas(${p.x}, ${p.y})`), `${tag}: ${name} covered`);
      await g.tap(p.x, p.y);
      await g.waitFor(async () => (await g.chatCount('log')) > n0, { label: `${name} log` });
      res.push(`${name}@dy-${Math.round(t.up * f)}`);
    }
    return `${tag}: ${res.join(', ')} each gave a log`;
  });
  // old t6 "0 console errors" is lib's built-in 'console' check (runs after every combo)
});
