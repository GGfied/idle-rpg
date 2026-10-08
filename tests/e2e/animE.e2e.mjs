// QA slice anim-e: Animations Off / Reduced for chop, mine, net fishing + walk. Port 5260 (E2E_PORT overrides).
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
  const TOOLS = ['axe', 'pick', 'net'];
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
    return { sig, kind, tool: tool ? tool.name : null, rx: r.x, ry: r.y, rsx: r.scaleX, rsy: r.scaleY,
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
const toolP2p = (rows) => p2p(rows.filter((r) => r.sig !== null).map((r) => r.sig)) * DEG;

await withGame(
  { port: 5260 },
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
          await g.eval(cur.go(cur.tgt));
        await g.sleep(120);
      }
      return (await pr).filter((r) => r.sig !== null);
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
      for (const [name, a] of Object.entries(acts)) {
        await setAnim('off');
        const faces = [];
        for (const off of offs) {
          await check(
            `off-${name}-${off}`,
            `Off ${name} from offset ${off}: static pose`,
            async () => {
              if (!(await start(a, off))) return `skipped: no session from ${off}`;
              const t = await run();
              const rows = t;
              expect(t.length >= 25, `tool visible in only ${t.length} frames`);
              const tp = toolP2p(rows);
              const bp = bodyP2p(rows);
              expect(tp < 0.01 && bp < 1e-6, `tool p2p ${f(tp)} deg, body p2p ${bp}`);
              faces.push({ sig: t[0].sig, kind: t[0].kind });
              return `${t[0].tool} sig ${f(t[0].sig * DEG)} deg (${t[0].kind}) p2p ${f(tp)} body ${bp}`;
            },
          );
          await stop();
        }
        await check(
          `off-${name}-facings`,
          `Off ${name}: identical tool angle across facings`,
          async () => {
            const ab = faces.map((x) => Math.abs(x.sig) * DEG);
            const d = Math.max(...ab) - Math.min(...ab);
            expect(
              faces.length >= 3 && d < 0.05,
              `abs ${ab.map((v) => f(v)).join(',')} (spread ${f(d)}); raw ${faces.map((x) => f(x.sig * DEG)).join(',')} kinds ${faces.map((x) => x.kind).join(',')}`,
            );
            return `abs ${ab.map((v) => f(v, 2)).join(',')} spread ${f(d)} deg; kinds ${faces.map((x) => x.kind).join(',')}`;
          },
        );
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
          await g.sleep(300);
          seq[key] = await run(1800);
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
            expect(on > 3, `on tool p2p only ${f(on)}`);
            expect(red > 0.2 && red < on * 0.7, `reduced tool p2p ${f(red)} vs on ${f(on)}`);
            expect(bb < 1e-6, `reduced body p2p ${bb}`);
            expect(off < 0.01, `off tool p2p ${f(off)}`);
            expect(on2 > 3, `back to on: p2p ${f(on2)}`);
            return `tool p2p on ${f(on, 1)} / reduced ${f(red, 1)} / off ${f(off)} / on again ${f(on2, 1)}; body p2p reduced ${bb}; on body ${f(bodyP2p(seq.on), 2)}`;
          },
        );
        await check(
          `red-${name}-down`,
          `Reduced ${name}: tap reaches the same down pose On strikes with`,
          async () => {
            const onS = seq.on.map((r) => r.sig),
              rS = seq.reduced.map((r) => r.sig);
            const onMin = Math.min(...onS),
              onMax = Math.max(...onS),
              rMin = Math.min(...rS),
              rMax = Math.max(...rS);
            const down = Math.abs(onMax) > Math.abs(onMin) ? onMax : onMin;
            const rd = Math.abs(rMax - down) < Math.abs(rMin - down) ? rMax : rMin;
            expect(
              rMin >= onMin - 0.02 && rMax <= onMax + 0.02 && Math.abs(rd - down) * DEG < 8,
              `on [${f(onMin * DEG, 1)}, ${f(onMax * DEG, 1)}] reduced [${f(rMin * DEG, 1)}, ${f(rMax * DEG, 1)}]`,
            );
            return `on-hit ${f(down * DEG, 1)} deg, reduced-hit ${f(rd * DEG, 1)} deg`;
          },
        );
      }
    });
    const lane =
      await g.eval(`(async () => { const w = await import('/src/features/world/index.ts'); const grid = w.createWorldCollisionGrid(); const p = ${S}.game.movement.position;
      for (let r = 0; r <= 30; r++) for (let ox = -r; ox <= r; ox++) for (let oy = -r; oy <= r; oy++) { if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
        let ok = true; for (let i = 0; i <= 6 && ok; i++) ok = grid.isWalkable(p.x + ox + i, p.y + oy); if (ok) return { s: { x: p.x + ox, y: p.y + oy }, e: { x: p.x + ox + 6, y: p.y + oy } }; } return null; })()`);
    expect(lane, 'no walk lane');
    const walkRows = {};
    await g.realTime(async () => {
      for (const m of ['on', 'reduced', 'off']) {
        await setAnim(m);
        await g.setInventory([]);
        await g.teleport(lane.s.x, lane.s.y);
        await g.sleep(500);
        const pr = g.eval(`window.__W.run(3000)`);
        await g.eval(`${S}.walkTo({ x: ${lane.e.x}, y: ${lane.e.y} })`);
        const rows = await pr;
        walkRows[m] = rows.filter(
          (r, i) => i > 0 && (r.cx !== rows[i - 1].cx || r.cy !== rows[i - 1].cy),
        );
      }
    });
    await check(
      'walk',
      'Walk: On swings limbs; Reduced and Off keep limbs and body still',
      async () => {
        const limb = (rows) =>
          Math.max(
            ...['tb', 'tf', 'ub', 'uf', 'sb', 'sf', 'ry'].map((k) => p2p(rows.map((r) => r[k]))),
          );
        const { on, reduced: red, off } = walkRows;
        expect(
          on.length > 20 && red.length > 20 && off.length > 20,
          `moving frames ${on.length}/${red.length}/${off.length}`,
        );
        expect(limb(on) > 0.05, `on limb p2p ${limb(on)}`);
        expect(limb(red) < 1e-6 && limb(off) < 1e-6, `reduced ${limb(red)} off ${limb(off)}`);
        return `limb p2p on ${f(limb(on))} reduced ${limb(red)} off ${limb(off)}; moving frames ${on.length}/${red.length}/${off.length}`;
      },
    );
    await setAnim('on');
  }),
);
