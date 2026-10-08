// Gathering poses: mine (pick), net fishing, rod fishing (+ rod catch pulse). Run: node tests/e2e/animC.e2e.mjs (port 9505)
// Fast base: runParallel desktop + phone, withCombos, 60 ms ticks, budget 60 s. webgl only: every assertion reads the
// rig's scene graph (state, visibility, world transforms), renderer-independent; the frame sheets are visual evidence.
// Synthetic time instead of wall-clock sampling: an in-page waiter freezes Phaser's loop on the first frame the pose
// state holds and steps frames by hand (same sample window as before: 2600 / 2000 / 4500 / 3500 ms of animation).
// Close-up "bursts" are ONE frame sheet per burst (drawImage of the game canvas after each stepped frame, written
// once), not one screenshot per frame. Spot hops are pushed out as a precondition (60 ms ticks hop every 3.6-7.2 s).
import { writeFileSync, mkdirSync } from 'node:fs';
import { check, expect, runParallel, withCombos } from './lib.mjs';

process.env.SHOTS_DIR ??= new URL('./.shots-animC', import.meta.url).pathname;
const PORT = 9505; // combos use 9505..9506
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const S = 'window.__idleRpg.store.getState()';
const INSTALL = `(() => { const sc = window.__idleRpg.scene().camera.scene; const pv = sc.player;
  const all = (o, out = []) => { out.push(o); (o.list || []).forEach((c) => all(c, out)); return out; };
  const vis = (o) => { for (let p = o; p; p = p.parentContainer) if (!p.visible) return false; return true; };
  const find = (n) => all(pv.container).filter((o) => o.name === n);
  window.__rig = { sc, find, vis,
    snap: (n) => { const gs = find(n); const v = gs.filter(vis); return { n: gs.length, v: v.length, back: v.some((o) => o.parentContainer === pv.container.list[0]) }; },
    vec: (n, x0, y0, x1, y1) => { const o = find(n).find(vis); if (!o) return null; const m = o.getWorldTransformMatrix(); const a = m.transformPoint(x0, y0), b = m.transformPoint(x1, y1); return { dx: b.x - a.x, dy: b.y - a.y }; },
    armsVisible: () => find('armFrontUpper').some(vis) };
  window.__pulses = 0; window.__impacts = []; const a = sc.animator; if (!a.__i) { a.__i = true; const oi = a.onImpact; a.onImpact = (...x) => { window.__impacts.push(window.__rig.vec('pick', 0, 0, 0, 11)); return oi?.(...x); }; } if (!a.__w) { a.__w = true; const p = a.pulse.bind(a); a.pulse = (...x) => { window.__pulses++; return p(...x); }; } })()`;
const NO_HOPS = `({ ...g, fishing: { ...g.fishing, spots: Object.fromEntries(Object.entries(g.fishing.spots ?? {}).map(([k, s]) => [k, { ...s, moveTimer: { respawnAt: g.tick + 1e9 } }])) } })`;
const range = (from, to, step) => {
  const out = [];
  for (let t = from; t <= to; t += step) out.push(+t.toFixed(1));
  return out;
};

/**
 * In-page: wait (real frames) until `whenSrc()` holds, then freeze Phaser's loop and step one frame per offset,
 * collecting sampleSrc(t) rows; `sheet` offsets also draw a 100x110 css close-up of the player into one JPEG strip.
 * Game ticks cannot run inside this synchronous loop, so the game state (and thus the pose state) is held for the
 * whole window. Returns { rows, sheet: [{t, row}], url, spread } or { timeout: true }.
 */
const SYNTH = (whenSrc, offsets, sampleSrc, sheet = []) => `new Promise((res) => {
  const S = window.__e.synth, when = ${whenSrc}, sample = ${sampleSrc}, t0 = performance.now();
  const go = () => {
    let ok = false; try { ok = when(); } catch { ok = false; }
    if (!ok) { if (performance.now() - t0 > 12000) return res({ timeout: true }); return requestAnimationFrame(go); }
    S.freeze();
    try {
      const sc = window.__idleRpg.scene().camera.scene, cv = sc.game.canvas, r = cv.getBoundingClientRect(), k = cv.width / r.width;
      const offs = [...new Set([...${JSON.stringify(offsets)}, ...${JSON.stringify(sheet)}])].sort((a, b) => a - b);
      const sh = document.createElement('canvas'); const W = Math.round(100 * k), H = Math.round(110 * k);
      sh.width = Math.max(1, W * ${sheet.length}); sh.height = H; const ctx = sh.getContext('2d');
      const rows = [], shots = []; let col = 0;
      for (const t of offs) {
        S.stepTo(t);
        const row = sample(t);
        if (${JSON.stringify(offsets)}.includes(t)) rows.push(row);
        if (${JSON.stringify(sheet)}.includes(t)) {
          const c = sc.player.container, p = window.__e.toClient(c.x, c.y - 20);
          ctx.drawImage(cv, (p.x - 50 - r.left) * k, (p.y - 70 - r.top) * k, W, H, col * W, 0, W, H);
          shots.push({ t, row }); col++;
        }
      }
      let spread = 0;
      if (shots.length) { const d = ctx.getImageData(0, 0, sh.width, sh.height).data; let lo = 255, hi = 0;
        for (let i = 0; i < d.length; i += 16) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; lo = Math.min(lo, l); hi = Math.max(hi, l); } spread = hi - lo; }
      res({ rows, sheet: shots, url: shots.length ? sh.toDataURL('image/jpeg', 0.85) : null, spread });
    } finally { S.thaw(); }
  };
  requestAnimationFrame(go);
})`;

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  const synth = async (label, whenSrc, offsets, sampleSrc, sheet = [], name = label) => {
    const out = await g.eval(SYNTH(whenSrc, offsets, sampleSrc, sheet));
    expect(!out.timeout, `${label}: pose state never reached (12 s)`);
    if (out.url) {
      mkdirSync(process.env.SHOTS_DIR, { recursive: true });
      writeFileSync(
        `${process.env.SHOTS_DIR}/${vp}-${name}-sheet.jpg`,
        Buffer.from(out.url.split(',')[1], 'base64'),
      );
      expect(out.spread > 30, `${label}: frame sheet looks blank (luminance spread ${out.spread})`);
    }
    return out;
  };
  /** Sheet rows -> printed like the old BURST lines: [t, animState, pulses, down-component of the vector]. */
  const burstRows = (name, out) => {
    const rows = out.sheet.map(({ t, row }) => ({
      k: `${name}-${t}`,
      ...row,
      d: row.v ? +(row.v.dy / Math.hypot(row.v.dx, row.v.dy)).toFixed(2) : null,
    }));
    process.stdout.write(
      `BURST ${vp} ${name} ${JSON.stringify(rows.map((r) => [r.k, r.a, r.p, r.d]))}\n`,
    );
    return rows;
  };
  const BURST = (vecSrc) => `() => ({ a: __rig.sc.animState, p: __pulses, v: ${vecSrc} })`;
  const frame = () =>
    g.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0))))');

  const spotTile = (id) =>
    g.eval(
      `(async () => { const R = await import('/src/app/registry.ts'); const sp = R.CONTENT.fishingSpots.get(${JSON.stringify(id)}); return sp.tiles[${S}.game.fishing.spots[${JSON.stringify(id)}]?.tile ?? 0]; })()`,
    );
  // 60 ms ticks + a keep-alive re-interact (the session ends on a full catch cycle); hops pushed out once it exists.
  const startFish = async (id, tools, lvl) => {
    await g.setLevel('fishing', lvl);
    await g.setInventory(tools);
    const t = await spotTile(id);
    await g.teleportSettled(t.x, t.y + 1);
    await g.eval(`${S}.interactSpot(${JSON.stringify(id)})`);
    await g.waitFor(async () => (await g.state('fishing.session')) !== null, {
      label: 'fishing session',
    });
    await g.update(NO_HOPS);
    await g.eval(INSTALL);
    await g.eval(
      `window.__idleRpg.setTickMs(60); clearInterval(window.__kf); window.__kf = setInterval(() => { const st = ${S}; if (!st.game.fishing.session && !st.game.pendingFishing) st.interactSpot(${JSON.stringify(id)}); }, 120)`,
    );
    return t;
  };
  const rawCount = () =>
    g.eval(
      `window.__idleRpg.store.getState().game.inventory.slots.filter((s) => s && s.itemId.startsWith('raw_')).reduce((n, s) => n + s.quantity, 0)`,
    );
  // Walk 2 tiles away (ends any session), wait until the walk is done and two frames have re-picked the pose.
  const stop = async () => {
    await g.eval(
      'clearInterval(window.__kf); clearInterval(window.__mk); window.__idleRpg.setTickMs(60)',
    );
    await g.eval(
      `${S}.walkTo({ x: ${S}.game.movement.position.x + 2, y: ${S}.game.movement.position.y })`,
    );
    await g.waitIdle();
    await g
      .waitFor(
        () =>
          g.eval(
            `!${S}.game.gathering.session && !${S}.game.fishing.session && !['mine', 'fishNet', 'fishRod'].includes(__rig.sc.animState)`,
          ),
        { label: 'pose left the gather state', timeoutMs: 5000 },
      )
      .catch(() => {}); // the check's own expect reports a pose that never left
    await frame();
  };

  const ROCK = { id: 'quarry_copper_1', x: 73, y: 41 };
  // Stand on a neighbour of the rock whose facing is back (or front) and start a mine session (60 ms ticks; the pose
  // window is held by the synthetic sampler, so the rock depleting after it does not matter).
  const mineAt = async (back) => {
    await g.setInventory(['bronze_pickaxe']);
    const offs =
      await g.eval(`(async () => { const A = await import('/src/render/animation/index.ts'); const o = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx || dy) { const b = A.facingIsBack(A.facingFromStep(-dx, -dy)); if (b === ${back}) o.push([dx, dy]); } return o; })()`);
    for (const [dx, dy] of offs) {
      await g.teleport(ROCK.x + dx, ROCK.y + dy, { settleMs: 0 });
      const p = await g.state('movement.position');
      if (p.x !== ROCK.x + dx || p.y !== ROCK.y + dy) continue;
      await g.eval(`${S}.interactTree(${JSON.stringify(ROCK.id)})`);
      try {
        await g.waitFor(async () => (await g.state('gathering.session')) !== null, {
          timeoutMs: 4000,
          label: 'mine session',
        });
      } catch {
        continue;
      }
      await g.eval(INSTALL);
      await g.eval(
        `clearInterval(window.__mk); window.__mk = setInterval(() => { const st = ${S}; if (!st.game.gathering.session) st.interactTree(${JSON.stringify(ROCK.id)}); }, 120)`,
      );
      await g.settle(); // the close-up sheet clips around the player: the camera must be on it
      return [dx, dy];
    }
    throw new Error('no usable neighbour for back=' + back);
  };
  const MINE_NOW = `() => __rig.sc.animState === 'mine'`;

  await check(
    'm1',
    'mine (front): state mine, pick visible, tip down at impact, arms shown',
    async () => {
      const o = await mineAt(false);
      const { rows: s } = await synth(
        'm1',
        MINE_NOW,
        range(0, 2600, 16.7),
        `() => ({ a: __rig.sc.animState, pick: __rig.snap('pick'), arms: __rig.armsVisible(), v: __rig.vec('pick', 0, 0, 0, 11) })`,
      );
      const mine = s.filter((x) => x.a === 'mine');
      expect(mine.length > 20, `mine frames ${mine.length}/${s.length}`);
      expect(
        mine.every((x) => x.pick.v === 1 && !x.pick.back && x.arms),
        `pick/arms ${JSON.stringify(mine[0])}`,
      );
      // a 2600 ms window holds one full 2400 ms swing, so its impact fired inside it (or just before the freeze)
      const imp = await g.eval('window.__impacts');
      const down = Math.max(...imp.filter(Boolean).map((v) => v.dy / Math.hypot(v.dx, v.dy)), -1);
      expect(
        imp.length >= 1 && down > 0.3,
        `impacts ${imp.length} downward component of haft->head ${down.toFixed(2)} ${JSON.stringify(imp.slice(0, 3))}`,
      );
      return `off ${o} frames ${mine.length} maxDown ${down.toFixed(2)}`;
    },
  );
  await check('m1b', 'mine close-ups: wind-up -> impact captured while state mine', async () => {
    await mineAt(false);
    const out = await synth(
      'm1b',
      MINE_NOW,
      [],
      BURST(`__rig.vec('pick', 0, 0, 0, 11)`),
      range(0, 2100, 300),
      'mine-front',
    );
    const rows = burstRows('mine-front', out);
    const d = rows.filter((r) => r.a === 'mine' && r.d !== null).map((r) => r.d);
    expect(d.length >= 4, `mine shots ${d.length}`);
    return `mine shots ${d.length} pick down-component ${Math.min(...d)}..${Math.max(...d)} (sheet spread ${out.spread})`;
  });
  await check('m2', 'mine (back view): arms hidden, pick in back layer', async () => {
    const o = await mineAt(true);
    const { rows: s } = await synth(
      'm2',
      MINE_NOW,
      range(0, 2000, 16.7),
      `() => ({ a: __rig.sc.animState, f: __rig.sc.facing, pick: __rig.snap('pick'), arms: __rig.armsVisible() })`,
      [400],
      'mine-back',
    );
    const mine = s.filter((x) => x.a === 'mine');
    expect(mine.length > 20, `mine frames ${mine.length} facing ${s[0].f}`);
    expect(
      mine.every((x) => x.pick.v === 1 && x.pick.back && !x.arms),
      `back ${JSON.stringify(mine[0])}`,
    );
    return `off ${o} facing ${s[0].f} frames ${mine.length}`;
  });
  await check('m3', 'stopping mining returns to idle/walk, pick hidden', async () => {
    await stop();
    const s = await g.eval(`({ a: __rig.sc.animState, p: __rig.snap('pick') })`);
    expect(s.a !== 'mine' && s.p.v === 0, JSON.stringify(s));
    return JSON.stringify(s);
  });
  await check(
    'n1',
    'net fishing: fishNet + net visible, cast/haul loops, stop -> idle',
    async () => {
      await startFish('shore_net_1', ['small_fishing_net'], 1);
      const out = await synth(
        'n1',
        `() => __rig.sc.animState === 'fishNet'`,
        range(0, 4500, 16.7),
        `() => ({ a: __rig.sc.animState, p: __pulses, net: __rig.snap('net').v, rod: __rig.snap('rod').v, y: __rig.vec('net', 0, 0, 0, 14), v: __rig.vec('net', 0, 0, 0, 14) })`,
        range(0, 4050, 450),
        'net',
      );
      const s = out.rows;
      const f = s.filter((x) => x.a === 'fishNet');
      expect(
        f.length > 30 && f.every((x) => x.net === 1 && x.rod === 0),
        `frames ${f.length}/${s.length}`,
      );
      const ys = f.filter((x) => x.y).map((x) => x.y.dy);
      const rng = Math.max(...ys) - Math.min(...ys);
      expect(rng > 4, `net haft dy range ${rng.toFixed(1)} (cast/haul motion)`);
      burstRows('net', out);
      await stop();
      const e = await g.eval(`({ a: __rig.sc.animState, n: __rig.snap('net').v })`);
      expect(e.a !== 'fishNet' && e.n === 0, JSON.stringify(e));
      return `frames ${f.length} range ${rng.toFixed(1)} end ${e.a}`;
    },
  );
  await check('n2', 'net catches never pulse', async () => {
    await startFish('shore_net_1', ['small_fishing_net'], 1);
    const r0 = await rawCount();
    await g.waitFor(async () => (await rawCount()) - r0 >= 3, {
      timeoutMs: 40000,
      label: 'net catches',
    });
    const pulses = await g.eval('window.__pulses');
    expect(pulses === 0, `pulses ${pulses} after ${(await rawCount()) - r0} net catches`);
    await stop();
    return `pulses 0 over ${(await rawCount()) - r0} catches`;
  });
  const ROD_KIT = ['fishing_rod', { itemId: 'fishing_bait', quantity: 500 }];
  await check('r1', 'rod fishing: fishRod, rod+rodLine visible, line upright', async () => {
    await startFish('shore_bait_1', ROD_KIT, 5);
    const out = await synth(
      'r1',
      `() => __rig.sc.animState === 'fishRod'`,
      range(0, 3500, 16.7),
      `() => ({ a: __rig.sc.animState, p: __pulses, rod: __rig.snap('rod').v, line: __rig.snap('rodLine').v, net: __rig.snap('net').v, l: __rig.vec('rodLine', 0, 0, 0, 11), v: __rig.vec('rodLine', 0, 0, 0, 11) })`,
      range(0, 3000, 600),
      'rod',
    );
    const f = out.rows.filter((x) => x.a === 'fishRod');
    expect(
      f.length > 30 && f.every((x) => x.rod === 1 && x.line === 1 && x.net === 0),
      `frames ${f.length}/${out.rows.length} ${JSON.stringify(f[0])}`,
    );
    const up = Math.min(...f.filter((x) => x.l).map((x) => x.l.dy / Math.hypot(x.l.dx, x.l.dy)));
    expect(up > 0.97, `min line downward component ${up.toFixed(3)} (upright = 1)`);
    burstRows('rod', out);
    return `frames ${f.length} lineUpright ${up.toFixed(3)}`;
  });
  await check('r2', 'rod: exactly one pulse per catch, none on a miss', async () => {
    await stop();
    await startFish('shore_bait_1', ROD_KIT, 5);
    const r0 = await rawCount();
    const p0 = await g.eval('window.__pulses');
    // The catch close-up: freeze on the first frame after the first pulse, sheet the 800 ms catch lift (was 600 ms
    // ticks + polling screenshots to catch it in real time).
    const out = await synth(
      'r2',
      `() => window.__pulses > ${p0}`,
      [],
      BURST(`__rig.vec('rodLine', 0, 0, 0, 11)`),
      [0, 160, 320, 480, 640],
      'rod-catch',
    );
    burstRows('rod-catch', out);
    await g.waitFor(async () => (await rawCount()) - r0 >= 4, {
      timeoutMs: 60000,
      label: 'rod catches',
    });
    await frame(); // a catch and its pulse land in the same tick handler; read both in one eval after a frame
    const { c, p } = await g.eval(
      `({ c: ${S}.game.inventory.slots.filter((s) => s && s.itemId.startsWith('raw_')).reduce((n, s) => n + s.quantity, 0) - ${r0}, p: window.__pulses })`,
    );
    expect(c >= 4 && p === c, `pulses ${p} vs catches ${c}`);
    return `pulses ${p} == catches ${c}`;
  });
  await check('r3', 'rod stop -> idle; chop still plays chop; no net/rod left', async () => {
    await stop();
    const e = await g.eval(
      `({ a: __rig.sc.animState, rod: __rig.snap('rod').v, line: __rig.snap('rodLine').v })`,
    );
    expect(e.a !== 'fishRod' && e.rod === 0 && e.line === 0, JSON.stringify(e));
    await g.setInventory(['bronze_axe']);
    const tree = await g.targetOfKind('tree');
    await g.teleportSettled(tree.x, tree.y + 2);
    await g.eval(`${S}.interactTree(${JSON.stringify(tree.id)})`);
    let seen;
    await g.waitFor(
      async () =>
        (seen = await g.eval(`({ a: __rig.sc.animState, axe: __rig.snap('axe').v })`)).a === 'chop',
      { label: 'chop' },
    );
    expect(seen.axe === 1, JSON.stringify(seen));
    return `idle ${e.a}; chop ${JSON.stringify(seen)}`;
  });
});
