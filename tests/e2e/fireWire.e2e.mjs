// W2e fire wiring: real fire art, kneel while lighting, cook pose, flicker over time, dying + burn-out ashes icon.
// Run: node tests/e2e/fireWire.e2e.mjs   (shots in tests/e2e/.shots-firewire/)
// Fast base: desktop/phone x webgl/canvas as parallel children (ports 9376-9379), ?tickMs=60 (the old file ran every
// check at 600 ms ticks), state waits instead of sleeps, and SYNTHETIC time (g.synth) for the flicker samples and the
// lighting / dying screenshots, so they no longer depend on wall-clock sleeps.
import { check, runParallel, withCombos } from './lib.mjs';

process.env.SHOTS_DIR ??= new URL('./.shots-firewire/', import.meta.url).pathname;
const PORT = 9376;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl', 'canvas'],
  budgetMs: BUDGET_MS,
});
const START = { x: 18, y: 15 };
const fires = (g) => g.state('firemaking.fires');
const SAMPLE_FN = `() => { const sc = window.__idleRpg.scene().camera.scene;
  const flat = (l) => l.flatMap((c) => c.list ? [c, ...flat(c.list)] : [c]);
  const im = flat(sc.children.list).filter((o) => o.texture && /^fire_flame/.test(o.texture.key));
  return im.map((o) => [o.texture.key, +o.scaleX.toFixed(3), +o.scaleY.toFixed(3), +o.alpha.toFixed(3), +o.x.toFixed(2)]); }`;
const SAMPLE = `(${SAMPLE_FN})()`;
const animState = (g) => g.eval(`window.__idleRpg.scene().camera.scene.animState`);
const fireAction = (g) => g.eval(`window.__idleRpg.scene().fireAction`);

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp, renderer) => {
  const tag = `${vp}-${renderer}`;
  await g.update(
    `({ ...g, firemaking: { ...g.firemaking, fires: [], lighting: null }, chat: [] })`,
  );
  await g.setInventory([
    'tinderbox',
    { itemId: 'logs', quantity: 3 },
    { itemId: 'raw_shrimp', quantity: 6 },
  ]);
  await g.teleportSettled(START.x, START.y);
  await g.eval(
    `window.__idleRpg.scene().camera.scene.cameras.main.setZoom(${vp === 'phone' ? 2.4 : 2.2}), 0`,
  );
  await g.settle();

  await check('w1', 'lighting: kneel pose + real fire view appears', async () => {
    // Freeze BEFORE lighting (ticks slow to 600 ms, frames stepped by hand) so the kneel pose is on the shots even
    // when a fast tick would light the fire at once; the old file used 450 / 1000 ms wall-clock sleeps at 600 ms ticks.
    await g.synth.freeze();
    await g.eval('window.__idleRpg.store.getState().lightSlot(1), 0');
    await g.synth.frames([0, 500], { name: `light-${tag}` });
    const act = await fireAction(g);
    const anim = await animState(g);
    await g.synth.thaw();
    await g.waitFor(async () => (await fires(g)).length > 0, { label: 'lit', timeoutMs: 8000 });
    // keep the fire alive for the later checks (100 ticks = only 6 s at 60 ms ticks); w4 sets its own expiry
    await g.update(
      `({ ...g, firemaking: { ...g.firemaking, fires: g.firemaking.fires.map((f) => ({ ...f, expiresAtTick: g.tick + 9000 })) } })`,
    );
    await g
      .waitFor(async () => (await g.eval(SAMPLE)).length >= 3, {
        label: 'flame layers',
        timeoutMs: 3000,
      })
      .catch(() => {});
    const s = await g.eval(SAMPLE);
    g.expect(s.length >= 3, 'flame layers ' + JSON.stringify(s));
    await g.screenshot(`lit-${tag}`);
    return `${tag}: action ${act} anim ${anim} flames ${s.length} (${await g.rendererName()})`;
  });

  await check('w2', 'flicker moves over time', async () => {
    // 8 samples 110 ms apart in synthetic scene time (one page eval; was 8 x 110 ms wall-clock sleeps)
    const rows = await g.eval(`(() => { const S = window.__e.synth, f = ${SAMPLE_FN}, out = [];
        S.freeze(); try { for (let i = 0; i < 8; i++) { S.stepTo(i * 110); out.push(f()); } } finally { S.thaw(); } return out; })()`);
    const distinct = new Set(rows.map((r) => JSON.stringify(r))).size;
    g.expect(distinct >= 4, 'distinct samples ' + distinct);
    return `${tag}: ${distinct}/8 distinct; first ${JSON.stringify(rows[0][0])} last ${JSON.stringify(rows[7][0])}`;
  });

  await check('w3', 'real tap on the flames cooks (cook pose)', async () => {
    const f = (await fires(g))[0];
    await g.tapTile(f.tile.x, f.tile.y, -14);
    await g.waitFor(async () => !!(await g.state('cooking.session')), {
      label: 'cooking',
      timeoutMs: 8000,
    });
    // wait for the cook pose (was a fixed 1300 ms sleep); reported, as before
    await g
      .waitFor(async () => /cook/i.test(String(await animState(g))), {
        label: 'cook pose',
        timeoutMs: 3000,
      })
      .catch(() => {});
    const anim = await animState(g);
    await g.screenshot(`cook-${tag}`);
    return `${tag}: anim ${anim}, action ${await fireAction(g)}`;
  });

  await check('w4', 'dying then burn-out leaves ashes, no flame layers left', async () => {
    // expiry 10 ticks out = inside the dying window (DYING_SHARE 0.1 x 100 burn ticks for logs)
    await g.update(
      `({ ...g, firemaking: { ...g.firemaking, fires: g.firemaking.fires.map((f) => ({ ...f, expiresAtTick: g.tick + 10 })) } })`,
    );
    await g.synth.frames([0], { name: `dying-${tag}` }); // frozen frame: the dying look, no 2.6 s sleep
    await g.synth.thaw();
    await g.waitFor(async () => (await fires(g)).length === 0, {
      label: 'burned out',
      timeoutMs: 15000,
    });
    // flame layers must go: wait for them (was a fixed 600 ms), the expect reports a leftover
    await g
      .waitFor(async () => (await g.eval(SAMPLE)).length === 0, {
        label: 'flames gone',
        timeoutMs: 3000,
      })
      .catch(() => {});
    const left = (await g.eval(SAMPLE)).length;
    const ground = await g.state('ground.items');
    await g.screenshot(`ashes-${tag}`);
    g.expect(left === 0, 'flame layers left ' + left);
    return `${tag}: ground ${JSON.stringify(ground.map((i) => i.itemId))}`;
  });
});
