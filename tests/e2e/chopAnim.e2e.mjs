// QA slice anim-a3: two-handed chop AND mine pose; facing forced through the scene (walking cannot reach the back view).
// Port 5272 (E2E_PORT overrides). Real 600 ms ticks.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { check, expect, forEachViewport, withGame } from './lib.mjs';

const SHOTS = process.env.SHOTS_DIR ?? resolve(process.cwd(), 'tests/e2e/.shots-animA');
const f = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const SAMPLER = `(() => {
  const H = window.__idleRpg, S = (window.__S = { rows: [], on: false, want: null, frozen: null, back: null });
  const pv = () => H.scene().playerView;
  const all = (o, out = []) => { out.push(o); (o.list ?? []).forEach((c) => all(c, out)); return out; };
  const W = (o, x, y) => o.getWorldTransformMatrix().transformPoint(x, y);
  const find = (n) => all(pv().container).filter((o) => o.name === n);
  S.tool = 'axe';
  const pvw = pv(), orig = pvw.setBackView && pvw.setBackView.bind(pvw);
  if (orig) pvw.setBackView = (b) => { S.back = b; return orig(b); };
  Promise.all([import('/src/render/figureArt.ts'), import('/src/render/figureLooks.ts')]).then(([fa, fl]) => { S.topY = Math.min(...fa.figureRects(fl.PLAYER_LOOK, 'front').map((r) => r.y)); });
  const loop = () => {
    try { if (S.on) {
      const c = pv().container, rig = c.list.find((o) => o.type === 'Container' && o.list.length === 4);
      const uf = find('armFrontUpper')[0], ub = find('armBackUpper')[0], ff = find('armFrontFore')[0], fb = find('armBackFore')[0];
      const axes = find(S.tool), hand = axes.find((a) => a.parentContainer?.name === 'armFrontFore'), back = axes.find((a) => a !== hand);
      const body = pv().body;
      const sf = W(uf, 0, 0), sb = W(ub, 0, 0), ef = W(ff, 0, 0), eb = W(fb, 0, 0);
      const hf = W(ff, 0, 9), hb = W(fb, 0, 9);
      const ax = hand.visible ? hand : back;
      const a0 = W(ax, 0, 0), a1 = W(ax, 0, 1), butt = W(ax, 0, -8), tip = W(ax, 0, 11);
      const inv = ax.getWorldTransformMatrix().invert();
      const lf = inv.transformPoint(hf.x, hf.y), lb = inv.transformPoint(hb.x, hb.y);
      const bb = { top: W(body, 0, S.topY ?? -40).y };
      const r = { t: performance.now(), y: c.y, back: S.back, sx: body.scaleX, lean: Math.abs(body.rotation) * 180 / Math.PI,
        afVis: uf.visible, abVis: ub.visible, handVis: hand.visible, backVis: back.visible,
        cx: (sf.x + sb.x) / 2, half: Math.abs(sf.x - sb.x) / 2, sy: sf.y,
        ef: ef.x, eb: eb.x, hfx: hf.x, hfy: hf.y, hbx: hb.x, hby: hb.y,
        headDy: a1.y - a0.y, buttY: butt.y, tipY: tip.y, top: bb.top,
        lfx: lf.x, lfy: lf.y, lbx: lb.x, lby: lb.y, bodyTop: bb.top };
      S.rows.push(r);
      if (S.want && S.want(r)) { S.frozen = r; S.want = null; H.scene().camera.scene.game.loop.sleep(); }
    }
    } catch (e) { S.err = String(e); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  S.go = () => { S.rows = []; S.on = true; };
  S.wake = () => { S.frozen = null; H.scene().camera.scene.game.loop.wake(); };
  S.player = () => { const c = pv().container; return window.__e.toClient(c.x, c.y); };
})()`;

async function clip(g, name) {
  const p = await g.eval('window.__S.player()');
  const { data } = await g.cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: {
      x: Math.max(0, p.x - 55),
      y: Math.max(0, p.y - 100),
      width: 110,
      height: 140,
      scale: 3,
    },
  });
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(resolve(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
  return `${SHOTS}/${name}.png`;
}

const FACINGS = { s: 'front', se: 'front', sw: 'front', n: 'back' };
const TOOLS = { chop: { tool: 'axe', kind: 'tree' }, mine: { tool: 'pick', kind: 'copper_rock' } };

await withGame(
  { port: Number(process.env.E2E_PORT ?? 5272) },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    await g.eval(SAMPLER);
    await g.setInventory(['bronze_axe', 'bronze_pickaxe']);
    await g.eval(`window.__idleRpg.store.getState().setPref({ visuals: { animations: 'on' } })`);
    const data = {};
    /** Force the facing, gather at 600 ms ticks, collect swing rows, freeze + close-up at impact and wind-up. */
    const run = async (name, facing) => {
      const { tool, kind } = TOOLS[name];
      const view = FACINGS[facing];
      const wantBackNow = view === 'back';
      const t =
        name === 'mine'
          ? await g.eval(
              `(async () => { const w = await import('/src/features/world/index.ts'); const r = w.WORLD_ROCKS.find((q) => q.defId === 'copper_rock'); return { id: r.nodeId, x: r.x, y: r.y }; })()`,
            )
          : await g.targetOfKind(kind);
      for (const [ox, oy] of [
        [0, 2],
        [1, 2],
        [-1, 2],
        [0, -2],
        [2, 0],
        [-2, 0],
        [1, -2],
      ]) {
        const ok =
          await g.eval(`(async () => { const w = await import('/src/features/world/index.ts'); const gr = w.createWorldCollisionGrid();
          return gr.isWalkable(${t.x + ox}, ${t.y + oy}); })()`);
        if (!ok) continue;
        await g.teleport(t.x + ox, t.y + oy);
        break;
      }
      await g.eval(
        `Object.defineProperty(window.__idleRpg.scene().camera.scene, 'facing', { get: () => '${facing}', set() {}, configurable: true }); 0`,
      );
      await g.sleep(500);
      await g.eval(
        `window.__S.back = ${wantBackNow}; window.__S.tool = '${tool}'; window.__S.go()`,
      );
      const wantBack = view === 'back';
      const sel = `window.__S.rows.filter((r) => (r.handVis || r.backVis) && !!r.back === ${wantBack})`;
      const t0 = Date.now();
      while (Date.now() - t0 < 25000) {
        if ((await g.eval(sel + '.length')) > 70) break;
        if (!(await g.state('gathering.session !== null')))
          await g.store(`s.interactTree(${JSON.stringify(t.id)})`);
        await g.sleep(250);
      }
      const rows = await g.eval(sel);
      if (rows.length < 60)
        throw new Error(
          `${name}/${facing}: only ${rows.length} frames (S.back=${await g.eval('window.__S.back')})`,
        );
      const yMax = Math.max(...rows.map((r) => (view === 'front' ? (r.hfy + r.hby) / 2 : r.tipY)));
      const tipMin = Math.min(...rows.map((r) => r.tipY));
      const shots = {};
      const grab = async (key, want) => {
        await g.eval(`window.__S.want = ${want}`);
        await g.waitFor(
          async () => {
            if (!(await g.state('gathering.session !== null')))
              await g.store(`s.interactTree(${JSON.stringify(t.id)})`);
            return g.eval('!!window.__S.frozen');
          },
          {
            timeoutMs: 15000,
            label: `${name}/${facing} ${key} freeze`,
          },
        );
        shots[key] = {
          row: await g.eval('window.__S.frozen'),
          file: await clip(g, `${vp}-${name}-${facing}-${key}`),
        };
        await g.eval('window.__S.wake()');
      };
      const vis = '(r.handVis||r.backVis) && !!r.back === ' + wantBack;
      await grab(
        'impact',
        view === 'front'
          ? `(r) => ${vis} && r.headDy > 0.5 && (r.hfy + r.hby) / 2 >= ${yMax - 0.6}`
          : `(r) => ${vis} && r.tipY >= ${yMax - 0.6}`,
      );
      await grab('windup', `(r) => ${vis} && r.tipY <= ${tipMin + 0.6}`);
      return { rows, shots };
    };
    await g.realTime(async () => {
      for (const name of Object.keys(TOOLS)) {
        data[name] = {};
        for (const facing of Object.keys(FACINGS))
          data[name][facing] = await run(name, facing).catch((e) => ({
            err: String(e.message ?? e),
          }));
        await check(
          `c1-${name}`,
          `${name} front: both fists on the haft, arms + tool in hand, whole swing incl. wind-up`,
          async () => {
            const out = [];
            for (const facing of ['s', 'se', 'sw']) {
              const d = data[name][facing];
              expect(!d.err, d.err);
              const R = d.rows;
              expect(
                R.every((r) => r.handVis && !r.backVis && r.afVis && r.abVis),
                `${facing}: arms/hand tool missing in some frame`,
              );
              const bad = R.filter(
                (r) =>
                  Math.abs(r.lfx) > 3 ||
                  Math.abs(r.lbx) > 3 ||
                  r.lfy < -11 ||
                  r.lby < -11 ||
                  r.lfy > 13 ||
                  r.lby > 13,
              );
              expect(
                bad.length / R.length < 0.03,
                `${facing}: ${bad.length}/${R.length} frames fist off haft e.g. ${JSON.stringify(bad[0])}`,
              );
              out.push(`${facing} ${R.length - bad.length}/${R.length}`);
            }
            return out.join(', ');
          },
        );
        await check(
          `c2-${name}`,
          `${name} impact: elbows within torso half-width + V (s, se, sw)`,
          async () => {
            const out = [];
            for (const facing of ['s', 'se', 'sw']) {
              const d = data[name][facing];
              expect(!d.err, d.err);
              const r = d.shots.impact.row;
              const eIn = Math.max(Math.abs(r.ef - r.cx), Math.abs(r.eb - r.cx));
              const eGap = Math.abs(r.ef - r.eb),
                hGap = Math.abs(r.hfx - r.hbx);
              expect(
                eIn <= r.half + 0.5,
                `${facing}: elbow offset ${f(eIn)} > half-width ${f(r.half)}`,
              );
              expect(r.hfy > r.sy && r.hby > r.sy, `${facing}: hands not below shoulders`);
              expect(
                hGap <= 2 * r.half + 0.5,
                `${facing}: no V, hand gap ${f(hGap)} > shoulder gap ${f(2 * r.half)}`,
              );
              out.push(
                `${facing} elbow ${f(eIn)}<=${f(r.half)} V hands ${f(hGap)}<=shoulders ${f(2 * r.half)} (elbow gap ${f(eGap)})`,
              );
            }
            return out.join('; ');
          },
        );
        await check(
          `c3-${name}`,
          `${name}: lean <= 12 deg, tool head above head top at wind-up`,
          async () => {
            const out = [];
            for (const facing of ['s', 'se', 'sw']) {
              const d = data[name][facing];
              expect(!d.err, d.err);
              const lean = Math.max(...d.rows.map((r) => r.lean));
              const w = d.shots.windup.row;
              expect(lean <= 12, `${facing}: lean ${f(lean)}`);
              expect(
                w.tipY < w.bodyTop,
                `${facing}: head ${f(w.tipY)} not above head top ${f(w.bodyTop)}`,
              );
              out.push(`${facing} lean ${f(lean)} head ${f(w.tipY)} < top ${f(w.bodyTop)}`);
            }
            return out.join('; ');
          },
        );
        await check(
          `c6-${name}`,
          `${name} wind-up (s): the two fists are >= 8 px apart along the haft`,
          async () => {
            const d = data[name].s;
            expect(!d.err, d.err);
            const w = d.shots.windup.row;
            const gap = Math.hypot(w.hfx - w.hbx, w.hfy - w.hby);
            expect(gap >= 8, `fist gap ${f(gap)} < 8 at wind-up`);
            return `fist gap ${f(gap)} px`;
          },
        );
        await check(
          `c4-${name}`,
          `${name} back (n): arms hidden, tool visible, head above head top at wind-up`,
          async () => {
            const d = data[name].n;
            expect(!d.err, d.err);
            const R = d.rows;
            const shown = R.filter((r) => r.afVis || r.abVis || r.handVis);
            expect(
              shown.length === 0,
              `${shown.length}/${R.length} frames show an arm or hand tool`,
            );
            expect(
              R.every((r) => r.backVis),
              'back tool not shown every frame',
            );
            const w = d.shots.windup.row;
            expect(w.tipY < w.bodyTop, `head ${f(w.tipY)} not above top ${f(w.bodyTop)}`);
            return `${R.length} frames, 0 with arms; windup head ${f(w.tipY)} top ${f(w.bodyTop)}`;
          },
        );
      }
      await check('c5', 'no console errors', async () => {
        const e = g.consoleErrors();
        expect(e.length === 0, e.join(' | '));
        return '0 errors';
      });
    });
  }),
);
