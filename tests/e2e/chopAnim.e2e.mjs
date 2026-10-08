// QA slice anim-a3: two-handed chop AND mine pose; facing forced through the scene (walking cannot reach the back view).
// Port 9001 (+1 per parallel combo; E2E_PORT overrides). Fast base: desktop + phone run as parallel children, budget 60 s. Deterministic: the scene animator is driven by hand with synthetic times (as animE),
// so a swing is sampled exactly N times per period instead of waiting seconds of gameplay per facing.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = 9001;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const SHOTS = process.env.SHOTS_DIR ?? resolve(process.cwd(), 'tests/e2e/.shots-animA');
const f = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const SAMPLER = `(() => {
  const H = window.__idleRpg, S = (window.__S = { back: null });
  const pv = () => H.scene().playerView;
  const all = (o, out = []) => { out.push(o); (o.list ?? []).forEach((c) => all(c, out)); return out; };
  const W = (o, x, y) => o.getWorldTransformMatrix().transformPoint(x, y);
  const find = (n) => all(pv().container).filter((o) => o.name === n);
  S.tool = 'axe';
  const pvw = pv(), orig = pvw.setBackView && pvw.setBackView.bind(pvw);
  if (orig) pvw.setBackView = (b) => { S.back = b; return orig(b); };
  Promise.all([import('/src/render/figureArt.ts'), import('/src/render/figureLooks.ts')]).then(([fa, fl]) => { S.topY = Math.min(...fa.figureRects(fl.PLAYER_LOOK, 'front').map((r) => r.y)); });
  const row = () => {
      const c = pv().container;
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
      return { y: c.y, back: S.back, sx: body.scaleX, lean: Math.abs(body.rotation) * 180 / Math.PI,
        afVis: uf.visible, abVis: ub.visible, handVis: hand.visible, backVis: back.visible,
        cx: (sf.x + sb.x) / 2, half: Math.abs(sf.x - sb.x) / 2, sy: sf.y,
        ef: ef.x, eb: eb.x, hfx: hf.x, hfy: hf.y, hbx: hb.x, hby: hb.y,
        headDy: a1.y - a0.y, buttY: butt.y, tipY: tip.y, top: bb.top,
        lfx: lf.x, lfy: lf.y, lbx: lb.x, lby: lb.y, bodyTop: bb.top };
  };
  // Hand-driven animator: mute the scene's own update/setState once, then step synthetic time. stop = sample index to leave posed.
  const A = H.scene().animator, O = { u: A.update, s: A.setState };
  A.update = () => {}; A.setState = () => {};
  const N = 50, T = 1e6;
  S.run = (state, facing, tool, item, stop = -1) => {
    S.tool = tool; const P = A.swingPeriodMs;
    O.s.call(A, state, { facing, toolItemId: item }); O.u.call(A, T);
    const rows = [];
    for (let i = 1; i <= N * 3; i++) { O.u.call(A, T + (i * P) / N);
      if (i >= N) { rows.push(row()); if (i - N === stop) break; } }
    return rows;
  };
  // Fine sweep (M2 elbow tuck smoothing): phase from..to in 0.5% steps, one row per step, elbows also in client px.
  S.sweep = (state, facing, tool, item, from, to) => {
    S.tool = tool; const P = A.swingPeriodMs;
    O.s.call(A, state, { facing, toolItemId: item }); O.u.call(A, T);
    const rows = [];
    for (let ph = from; ph <= to + 1e-9; ph += 0.005) {
      O.u.call(A, T + (1 + ph) * P);
      const r = row(), uf = find('armFrontFore')[0], ub = find('armBackFore')[0];
      const e1 = W(uf, 0, 0), e2 = W(ub, 0, 0);
      const c1 = window.__e.toClient(e1.x, e1.y), c2 = window.__e.toClient(e2.x, e2.y);
      const bi = pv().body.getWorldTransformMatrix().invert(), l1 = bi.transformPoint(e1.x, e1.y), l2 = bi.transformPoint(e2.x, e2.y);
      rows.push({ ph, r, w: [[e1.x, e1.y], [e2.x, e2.y]], e: [[l1.x, l1.y], [l2.x, l2.y]], c: [[c1.x, c1.y], [c2.x, c2.y]] });
    }
    return rows;
  };
  S.pose = (state, facing, tool, item, ph) => {
    S.tool = tool; const P = A.swingPeriodMs;
    O.s.call(A, state, { facing, toolItemId: item }); O.u.call(A, T); O.u.call(A, T + (1 + ph) * P);
    return 1;
  };
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

// Whole swing, recoil key included. Mine leans harder on the pull-back (mine.test.ts allows 14 deg).
const LEAN_MAX = { chop: 12, mine: 14 };
const FACINGS = { s: 'front', se: 'front', sw: 'front', n: 'back' };
const TOOLS = {
  chop: { tool: 'axe', item: 'bronze_axe' },
  mine: { tool: 'pick', item: 'bronze_pickaxe' },
};

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp) => {
    await g.eval(SAMPLER);
    await g.setInventory(['bronze_axe', 'bronze_pickaxe']);
    await g.eval(`window.__idleRpg.store.getState().setPref({ visuals: { animations: 'on' } })`);
    const data = {};
    /** Drive 2 swing periods at fixed phase steps; the impact + wind-up frames are re-posed for the close-ups. */
    const run = async (name, facing) => {
      const { tool, item } = TOOLS[name];
      const view = FACINGS[facing];
      const wantBack = view === 'back';
      const drive = (stop) =>
        g.eval(`window.__S.run('${name}', '${facing}', '${tool}', '${item}', ${stop})`);
      // One drive: the hand-driven animator is deterministic, so the unfiltered series doubles as the index source.
      const all = await drive(-1);
      const rows = all.filter((r) => (r.handVis || r.backVis) && !!r.back === wantBack);
      if (rows.length < 60)
        throw new Error(`${name}/${facing}: only ${rows.length} frames (view ${view})`);
      const tipMin = Math.min(...rows.map((r) => r.tipY));
      const idx = (pred) =>
        all.findIndex((r, i) => (r.handVis || r.backVis) && !!r.back === wantBack && pred(r, i));
      const shots = {};
      const grab = async (key, pred) => {
        const i = idx(pred);
        expect(i >= 0, `${name}/${facing} ${key}: no frame matches`);
        const row = (await drive(i))[i];
        // wait for two rendered frames of the posed figure (state, not a fixed sleep)
        await g.eval(
          'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))',
        );
        shots[key] = { row, file: await clip(g, `${vp}-${name}-${facing}-${key}`) };
      };
      // the strike key (SWING_IMPACT_PHASE 0.68 = sample 34 of 50), not the later recoil key
      await grab('impact', (r, i) => i === 34);
      await grab('windup', (r) => r.tipY <= tipMin + 0.6);
      return { rows, shots };
    };
    {
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
          `c8-${name}`,
          `${name} phase 0.55-0.70 in 0.5% steps (s, se, sw): elbow jump < 7 art px, both fists on the haft`,
          async () => {
            const out = [];
            const { tool, item } = TOOLS[name];
            for (const facing of ['s', 'se', 'sw']) {
              const sw = await g.eval(
                `window.__S.sweep('${name}', '${facing}', '${tool}', '${item}', 0.55, 0.7)`,
              );
              expect(sw.length >= 30, `${facing}: only ${sw.length} sweep frames`);
              let jump = 0,
                jumpW = 0,
                jumpPx = 0,
                at = 0;
              for (let i = 1; i < sw.length; i++)
                for (const k of [0, 1]) {
                  const d = Math.hypot(
                    sw[i].e[k][0] - sw[i - 1].e[k][0],
                    sw[i].e[k][1] - sw[i - 1].e[k][1],
                  );
                  jumpW = Math.max(
                    jumpW,
                    Math.hypot(
                      sw[i].w[k][0] - sw[i - 1].w[k][0],
                      sw[i].w[k][1] - sw[i - 1].w[k][1],
                    ),
                  );
                  if (d > jump) {
                    jump = d;
                    at = sw[i].ph;
                    jumpPx = Math.hypot(
                      sw[i].c[k][0] - sw[i - 1].c[k][0],
                      sw[i].c[k][1] - sw[i - 1].c[k][1],
                    );
                  }
                }
              // lateral drift budget = ELBOW_BLEND_HAND_DRIFT_PX (4) mid-window; along the haft the same range as c1
              const bad = sw.filter(
                ({ r }) =>
                  Math.abs(r.lfx) > 4 ||
                  Math.abs(r.lbx) > 4 ||
                  r.lfy < -11 ||
                  r.lby < -11 ||
                  r.lfy > 13 ||
                  r.lby > 13 ||
                  !r.handVis,
              );
              expect(jump < 7, `${facing}: elbow jump ${f(jump, 2)} art px at phase ${f(at, 3)}`);
              expect(
                bad.length === 0,
                `${facing}: ${bad.length}/${sw.length} frames fist off haft e.g. ph ${bad[0]?.ph} lfx ${f(bad[0]?.r.lfx)} lbx ${f(bad[0]?.r.lbx)} lfy ${f(bad[0]?.r.lfy)} lby ${f(bad[0]?.r.lby)}`,
              );
              out.push(
                `${facing} max jump ${f(jump, 2)} art px (body-local; ${f(jumpW, 2)} world incl. bob/lean; ${f(jumpPx, 2)} screen px) @${f(at, 3)}, ${sw.length} frames fists ok (max lateral ${f(Math.max(...sw.map(({ r }) => Math.max(Math.abs(r.lfx), Math.abs(r.lbx)))), 2)})`,
              );
            }
            return out.join('; ');
          },
        );
        if (name === 'mine')
          await check(`c9-${name}`, 'mine (s) close-ups at phases 0.60-0.66 saved', async () => {
            const files = [];
            for (const ph of [0.6, 0.62, 0.64, 0.66]) {
              await g.eval(
                `window.__S.pose('mine', 's', 'pick', 'bronze_pickaxe', ${ph}); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))`,
              );
              files.push(await clip(g, `${vp}-mine-s-ph${Math.round(ph * 100)}`));
            }
            return files.join(' ');
          });
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
          `c7-${name}`,
          `${name} recoil key (phase 0.74): elbows within torso half-width (s, se, sw)`,
          async () => {
            const out = [];
            for (const facing of ['s', 'se', 'sw']) {
              const d = data[name][facing];
              expect(!d.err, d.err);
              const r = d.rows[37]; // rows[k] = phase k/50, so 37 = 0.74
              const eIn = Math.max(Math.abs(r.ef - r.cx), Math.abs(r.eb - r.cx));
              expect(
                eIn <= r.half + 0.5,
                `${facing}: 0.74 elbow ${f(eIn)} > half-width ${f(r.half)}`,
              );
              out.push(`${facing} ${f(eIn)}<=${f(r.half)}`);
            }
            return out.join('; ');
          },
        );
        await check(
          `c3-${name}`,
          `${name}: lean <= 12 (chop) / 14 (mine) deg, tool head above head top at wind-up`,
          async () => {
            const out = [];
            for (const facing of ['s', 'se', 'sw']) {
              const d = data[name][facing];
              expect(!d.err, d.err);
              const lean = Math.max(...d.rows.map((r) => r.lean));
              const w = d.shots.windup.row;
              expect(lean <= LEAN_MAX[name], `${facing}: lean ${f(lean)}`);
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
    }
  }),
);
