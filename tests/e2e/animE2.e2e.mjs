// QA slice anim-e: Reduced chop/mine tap + live toggle (unwrapped angles, keep-alive). Port 5273 (E2E_PORT overrides).
// Reads the player rig through window.__idleRpg.scene().playerView; SHOTS_DIR defaults to tests/e2e/.shots-animE.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { check, expect, forEachViewport, withGame } from './lib.mjs';

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
  W.run = (ms) => new Promise((res) => { const rows = []; const t0 = performance.now();
    const id = setInterval(() => { rows.push(W.snap()); if (performance.now() - t0 > ms) { clearInterval(id); res(rows); } }, 16); });
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

await withGame(
  { port: 5273 },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    await g.eval(SAMPLER);
    const setAnim = (m) => g.eval(`${S}.setPref({ visuals: { animations: '${m}' } })`);
    let cur = null;
    /** Sample for ms; restart the gather whenever it ends (trees fall, rocks deplete) so the tool keeps showing. */
    const run = async (ms = 1400) => {
      const pr = g.eval(`window.__W.run(${ms})`);
      let done = false;
      pr.then(() => (done = true));
      while (!done) {
        if (
          cur &&
          (await g.state(cur.sess)) === null &&
          (await g.state('movement.path')).length === 0
        )
          await g.update('({ ...g, gathering: { ...g.gathering, nodes: {} } })');
        await g.eval(cur.go(cur.tgt));
        await g.sleep(120);
      }
      return (await pr).filter((r) => r.sig !== null && r.act);
    };
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
      await g.teleport(a.tgt.x + off[0], a.tgt.y + off[1]);
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
      await g.sleep(500);
      return ok;
    };
    const stop = async () => {
      cur = null;
      const p = await g.state('movement.position');
      await g.teleport(p.x, p.y);
      await g.sleep(300);
    };
    await g.realTime(async () => {
      for (const [name, a] of Object.entries(acts).filter(([k]) => k !== 'net')) {
        await setAnim('on');
        await start(a, offs[1]);
        const seq = {};
        for (const [key, m] of [
          ['on', 'on'],
          ['reduced', 'reduced'],
          ['off', 'off'],
          ['on2', 'on'],
        ]) {
          await setAnim(m);
          await run(400);
          seq[key] = await run(3000);
        }
        await shot(`${name}-live-end`);
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
            expect(seq.reduced.length > 20, `reduced frames ${kinds(seq.reduced)}`);
            expect(on > 3, `on tool p2p only ${f(on)}`);
            expect(red > 0.2 && red < on * 0.7, `reduced tool p2p ${f(red)} vs on ${f(on)}`);
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
    });
    await setAnim('on');
  }),
);
