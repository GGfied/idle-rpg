// QA slice anim-e: Reduced chop/mine tap + live toggle (unwrapped angles, keep-alive) on the REAL gameplay path (a live
// gather session drives the animator through the scene). Fast base: runParallel desktop + phone children (one page load
// each via withCombos), budget 60 s, preconditions at ?tickMs=60, then SYNTHETIC frames (g.synth: Phaser's loop asleep,
// full frames stepped by hand, ticks slowed to 600 ms so the session lives) instead of seconds of wall-clock sampling.
// Reads the player rig through window.__idleRpg.scene().playerView; SHOTS_DIR defaults to tests/e2e/.shots-animE.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { check, expect, runParallel, withCombos } from './lib.mjs';

const SHOTS =
  process.env.SHOTS_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), '.shots-animE');
const DEG = 180 / Math.PI;
const S = 'window.__idleRpg.store.getState()';
const SAMPLER = `(() => {
  const H = window.__idleRpg, W = (window.__W = {});
  const TOOLS = ['axe', 'pick'];
  const pv = () => H.scene().playerView;
  const rig = () => pv().container.list.find((o) => o.type === 'Container' && o.list.length === 4);
  const find = (o) => {
    if (TOOLS.includes(o.name) && o.visible) return o;
    for (const c of o.list ?? []) { const r = find(c); if (r) return r; }
    return null;
  };
  W.snap = () => {
    const p = pv(), r = rig(), tool = find(p.container);
    let sig = null, kind = 'none';
    if (tool) {
      sig = 0; let o = tool; kind = 'back';
      while (o && o !== p.container) { sig += o.rotation; if (o === r) kind = 'front'; o = o.parentContainer; }
    }
    const nm = (n) => r.list.find((o) => o.name === n);
    const th = (c) => c.list.find((o) => o.type === 'Container');
    const st = H.store.getState().game; const act = (st.gathering.session !== null) && st.movement.path.length === 0;
    return { act, sig, kind, tool: tool ? tool.name : null, rx: r.x, ry: r.y, rsx: r.scaleX, rsy: r.scaleY,
      bsx: p.body.scaleX, bsy: p.body.scaleY, cx: p.container.x, cy: p.container.y, tb: r.list[0].rotation, tf: r.list[1].rotation,
      ub: nm('armBackUpper').rotation, uf: nm('armFrontUpper').rotation, sb: th(r.list[0]).rotation, sf: th(r.list[1]).rotation };
  };
  /** Step ms of synthetic 16 ms frames (loop frozen) and snap after each. Game ticks still run on the wall clock (600 ms
   *  while frozen), so when the gather ends (tree falls, rock depletes) synthetic time PAUSES: revive the node, re-interact
   *  and wait (real time, max 5 s) for the session to come back before stepping on. Only acting frames are recorded,
   *  like the old wall-clock run() keep-alive, but the sampled window no longer depends on machine speed. */
  W.synthRun = async (ms, goSrc, sessPath) => {
    const S = window.__e.synth, rows = [], end = S.t + ms, go = (0, eval)(goSrc);
    const game = () => H.store.getState().game;
    const sess = () => sessPath.split('.').reduce((o, k) => o && o[k], game());
    const acting = () => sess() !== null && game().movement.path.length === 0;
    let revives = 0;
    while (S.t < end) {
      if (!acting()) {
        revives++;
        const s = H.store, gm = game();
        s.setState({ game: { ...gm, gathering: { ...gm.gathering, nodes: {} } } });
        go();
        const t0 = performance.now();
        while (!acting() && performance.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 30));
        if (!acting()) break; // the checks report the missing frames
      }
      S.step(16, 1);
      rows.push(W.snap());
    }
    W.last = { n: rows.length, act: rows.filter((r) => r.act).length, tool: rows.filter((r) => r.sig !== null).length, revives,
      sess: sess() !== null, pending: !!game().pendingInteraction, pos: game().movement.position };
    return rows;
  };
})()`;
const BODY = ['rx', 'ry', 'rsx', 'rsy', 'bsx', 'bsy'];
const p2p = (a) => Math.max(...a) - Math.min(...a);
const f = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const bodyP2p = (rows) => Math.max(...BODY.map((k) => p2p(rows.map((r) => r[k]))));
const W = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const unwrap = (xs) => {
  const o = [];
  xs.forEach((x, i) => o.push(i ? o[i - 1] + W(x - xs[i - 1]) : x));
  return o;
};
const toolP2p = (rows) => p2p(unwrap(rows.filter((r) => r.sig !== null).map((r) => r.sig))) * DEG;
const kinds = (rows) => [...new Set(rows.map((r) => r.kind))].join('/') + ' n=' + rows.length;
const hit = (rows) => {
  const u = unwrap(rows.map((r) => r.sig));
  const m = (Math.max(...u) + Math.min(...u)) / 2;
  const hi = Math.max(...u),
    lo = Math.min(...u);
  return {
    u,
    lo,
    hi,
    ext: Math.abs(hi - m) >= Math.abs(lo - m) ? hi : lo,
    dir: hi - m >= m - lo ? 1 : -1,
    mid: m,
  };
};

const PORT = 9141; // C3 block 9101-9150 (children 9141, 9142)
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'], // asserts rig rotations (renderer-independent); the end shots are for a human eye
  budgetMs: BUDGET_MS,
});
await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  await g.eval(SAMPLER);
  const setAnim = (m) => g.eval(`${S}.setPref({ visuals: { animations: '${m}' } })`);
  let cur = null;
  /** Sample ms of synthetic frames with the gather kept alive; only frames with the tool shown while acting count. */
  const run = async (ms = 1400) =>
    (
      await g.eval(
        `window.__W.synthRun(${ms}, ${JSON.stringify(`() => ${cur.go(cur.tgt)}`)}, ${JSON.stringify(cur.sess)})`,
      )
    ).filter((r) => r.sig !== null && r.act);
  const shot = async (name) => {
    const { data } = await g.cdp.send('Page.captureScreenshot', { format: 'png' });
    mkdirSync(SHOTS, { recursive: true });
    writeFileSync(resolve(SHOTS, `${vp}-${name}.png`), Buffer.from(data, 'base64'));
  };
  const rock = await g.eval(
    `(async () => { const R = await import('/src/app/registry.ts'); const r = [...R.CONTENT.rocks.values()].find((x) => x.defId.includes('copper')) ?? [...R.CONTENT.rocks.values()][0]; return { id: r.nodeId, x: r.x, y: r.y }; })()`,
  );
  const tree = await g.targetOfKind('tree');
  const spot =
    await g.eval(`(async () => { const R = await import('/src/app/registry.ts'); const sp = [...R.CONTENT.fishingSpots.values()].find((s) => s.defId === 'net_spot' || s.spotId.includes('net')) ?? [...R.CONTENT.fishingSpots.values()][0];
      const i = ${S}.game.fishing.spots[sp.spotId]?.tile ?? 0; return { id: sp.spotId, ...sp.tiles[i] }; })()`);
  const J = JSON.stringify;
  const acts = {
    chop: {
      kit: ['bronze_axe'],
      tgt: tree,
      go: (t) => `${S}.interactTree(${J(t.id)})`,
      sess: 'gathering.session',
    },
    mine: {
      kit: ['bronze_pickaxe'],
      tgt: rock,
      go: (t) => `${S}.interactTree(${J(t.id)})`,
      sess: 'gathering.session',
    },
    net: {
      kit: ['small_fishing_net'],
      tgt: spot,
      go: (t) => `${S}.interactSpot(${J(t.id)})`,
      sess: 'fishing.session',
    },
  };
  const offs = [
    [0, 3],
    [3, 0],
    [-3, 0],
    [0, -3],
  ];
  const start = async (a, off) => {
    cur = a;
    await g.setInventory(a.kit);
    await g.teleportSettled(a.tgt.x + off[0], a.tgt.y + off[1]);
    await g.eval(a.go(a.tgt));
    const ok = await g
      .waitFor(async () => (await g.state(a.sess)) !== null, {
        label: 'session',
        timeoutMs: 8000,
      })
      .then(
        () => true,
        () => false,
      );
    if (ok)
      await g.waitFor(async () => (await g.state('movement.path')).length === 0, {
        label: 'arrived',
      });
    // The render trail interpolates on wall-clock frames: wait (real frames) until the view has arrived and the scene
    // shows the tool in hand, so synthetic stepping starts in the act state (was a fixed 500 ms sleep).
    if (ok)
      await g
        .waitFor(
          () =>
            g.eval('(() => { const r = window.__W.snap(); return r.sig !== null && r.act; })()'),
          { label: 'tool shown while acting', timeoutMs: 6000 },
        )
        .catch(() => {});
    return ok;
  };
  const stop = async () => {
    cur = null;
    const p = await g.state('movement.position');
    await g.teleport(p.x, p.y, { settleMs: 0 });
  };
  {
    // Synthetic frames are cheap, so phone mine is back in (the wall-clock version had dropped it for time).
    for (const [name, a] of Object.entries(acts).filter(([k]) => k !== 'net')) {
      await setAnim('on');
      await start(a, offs[1]);
      await g.synth.freeze(); // ticks slowed to 600 ms: the session lives while frames are stepped by hand
      const seq = {};
      // Samples are the shortest that still prove the claim: Reduced needs one full swing period (2.4 s) to show its
      // tap; On needs a whole period for the full arc; Off is static. The synthetic-time twin (animE) covers all
      // viewports x tools x facings via animSeries; this file proves the REAL gameplay path (session keeps the tool alive).
      for (const [key, m, ms] of [
        ['on', 'on', 2500],
        ['reduced', 'reduced', 2700],
        ['off', 'off', 400],
        ['on2', 'on', 2500],
      ]) {
        await setAnim(m);
        await run(400);
        seq[key] = await run(ms);
      }
      seq.diag = await g.eval('window.__W.last');
      await shot(`${name}-live-end`);
      await g.synth.thaw();
      await stop();
      await check(
        `red-${name}`,
        `Reduced ${name}: small tap, body still; live toggle, no reload`,
        async () => {
          const on = toolP2p(seq.on),
            red = toolP2p(seq.reduced),
            off = toolP2p(seq.off),
            on2 = toolP2p(seq.on2);
          const bb = bodyP2p(seq.reduced);
          expect(
            seq.reduced.length > 20,
            `reduced frames ${kinds(seq.reduced)} (last sample ${JSON.stringify(seq.diag)})`,
          );
          expect(on > 3, `on tool p2p only ${f(on)}`);
          expect(
            red > 0.2 && red < on * 0.7,
            `reduced tool p2p ${f(red)} vs on ${f(on)} (on ${kinds(seq.on)}; reduced ${kinds(seq.reduced)})`,
          );
          expect(bb < 1e-6, `reduced body p2p ${bb}`);
          expect(off < 0.01, `off tool p2p ${f(off)}`);
          expect(on2 > 3, `back to on: p2p ${f(on2)}`);
          return `frames on ${kinds(seq.on)} red ${kinds(seq.reduced)}; tool p2p on ${f(on, 1)} / reduced ${f(red, 1)} / off ${f(off)} / on again ${f(on2, 1)}; body p2p reduced ${bb}; on body ${f(bodyP2p(seq.on), 2)}`;
        },
      );
      await check(
        `red-${name}-down`,
        `Reduced ${name}: tap reaches the On strike (down) pose, unwrapped`,
        async () => {
          const o = hit(seq.on),
            r = hit(seq.reduced);
          // hit pose = extreme in the On strike direction; compare circularly (wrapped), absolute angle of the tool when striking
          // strike = the high end: Reduced rests low and taps up toward it
          const down = o.hi,
            rd = r.hi;
          expect(
            Math.abs(W(rd - down)) * DEG < 20 && r.hi - r.lo < (o.hi - o.lo) * 0.7,
            `on [${f(o.lo * DEG, 1)}, ${f(o.hi * DEG, 1)}] reduced [${f(r.lo * DEG, 1)}, ${f(r.hi * DEG, 1)}] (unwrapped)`,
          );
          return `on-hit ${f(down * DEG, 1)} deg, reduced-hit ${f(rd * DEG, 1)} deg`;
        },
      );
    }
  }
  await setAnim('on');
});
