// Camera jerk on re-follow (user bug: "on mobile whenever i move the camera jerks").
// Real taps on the canvas, 4x CPU throttle, per-frame sampling of camera scroll + player client position.
// FAST BASE: desktop, phone (walks + gather) and phone (sheet) run as parallel runParallel children (withCombos: one
// page load each), waits on state (tile stepped, walk end, camera still, ticks) instead of fixed sleeps, budget 60 s.
// realTime (600 ms ticks) IS the thing tested: the per-frame scroll/step limits are for real walking speed; at 60 ms
// ticks the player crosses 10x the distance per frame and the limits would no longer mean anything.
// Run: node tests/e2e/camJerk.e2e.mjs (base port 9566; E2E_PORT overrides)
import { VIEWPORTS, check, expect, runParallel, waitStill, withCombos } from './lib.mjs';

// The phone runs at dpr 3 here (as the user's phone). Its sheet check is its own child (same phone) so the two phone
// halves run in parallel; added here, lib.mjs stays unchanged.
VIEWPORTS.phone3 = { width: 390, height: 844, touch: true, mobile: true, dsf: 3 };
VIEWPORTS.phone3sheet = { ...VIEWPORTS.phone3 };
const PORT = 9566;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone3', 'phone3sheet'],
  budgetMs: BUDGET_MS,
});

const MAX_SCROLL = 2; // world px per frame
const MAX_BODY = 1.7; // client px per frame (live max 1.58 desktop+phone, 4x throttle; mutant 2.09-2.10 red): the body's offset inside the container eases (POSE_BLEND_MS), never snaps
const MAX_STEP = 3; // client px per frame, dt-normalised (snaps measured 6.6+, lerp onset ~2.4)

const SAMPLER = `(() => {
  const sc = window.__idleRpg.scene(), w = sc.camera.scene;
  window.__cs = { on: false, f: [] };
  const loop = (t) => { try { if (window.__cs.on) { const c = sc.camera, p = sc.playerView.container, q = window.__e.toClient(p.x, p.y);
    const b = sc.playerView.body, k = p.scaleX || 1, bq = window.__e.toClient(p.x + b.x * k, p.y + b.y * (p.scaleY || 1));
    window.__cs.f.push([t, c.scrollX, c.scrollY, q.x, q.y, bq.x - q.x, bq.y - q.y]); } } catch {} requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
})()`;

const stats = (frames) => {
  const sd = [],
    pd = [],
    dt = [],
    raw = [],
    bd = [];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1],
      b = frames[i];
    const d = Math.max(1, b[0] - a[0]),
      k = 16.67 / d; // normalise to a 60 fps frame so a slow frame is not a "jump"
    const s1 = Math.hypot(b[1] - a[1], b[2] - a[2]),
      p1 = Math.hypot(b[3] - a[3], b[4] - a[4]);
    bd.push(Math.hypot(b[5] - a[5], b[6] - a[6]) * k); // body offset inside the player container (client px)
    sd.push(s1 * k);
    pd.push(p1 * k);
    dt.push(d);
    raw.push({ i, d: Math.round(d), s: +s1.toFixed(2), p: +p1.toFixed(2) });
  }
  const p95 = (v) => [...v].sort((x, y) => x - y)[Math.floor(v.length * 0.95)] ?? 0;
  const mx = (v) => Math.max(0, ...v);
  const top = raw.sort((x, y) => y.p + y.s - x.p - x.s).slice(0, 3);
  return {
    n: sd.length,
    sMax: mx(sd),
    sP95: p95(sd),
    pMax: mx(pd),
    pP95: p95(pd),
    bMax: mx(bd),
    bP95: p95(bd),
    fps: 1000 / (dt.reduce((s, x) => s + x, 0) / Math.max(1, dt.length)),
    top,
    maxDt: mx(dt),
  };
};
const fmt = (s) =>
  `frames ${s.n} (~${s.fps.toFixed(0)}fps) scroll max ${s.sMax.toFixed(2)} p95 ${s.sP95.toFixed(2)} | player step max ${s.pMax.toFixed(2)} p95 ${s.pP95.toFixed(2)} | body offset step max ${(s.bMax ?? 0).toFixed(2)} p95 ${(s.bP95 ?? 0).toFixed(2)} (dt-normalised to 60fps; worst frame dt ${s.maxDt.toFixed(0)}ms; top3 ${JSON.stringify(s.top)})`;
const okS = (s) => s.sMax <= MAX_SCROLL && s.pMax <= MAX_STEP;

const camPos = (g) =>
  g.eval(
    `(() => { const c = window.__idleRpg.scene(); return { x: c.camera.scrollX, y: c.camera.scrollY }; })()`,
  );
async function settle(g) {
  await waitStill(() => camPos(g), { intervalMs: 200, stable: 3, max: 40, eps: 0.2 });
}
async function sample(g, fn) {
  await g.eval('window.__cs.f = []; window.__cs.on = true');
  try {
    await fn();
  } finally {
    await g.eval('window.__cs.on = false');
  }
  return stats(await g.eval('window.__cs.f'));
}
const pos = (g) => g.state('movement.position');
// walk end, then keep sampling until the follow camera has stopped easing (was a fixed 500 ms)
async function arrive(g, ms = 12000) {
  await g.waitFor(async () => (await g.state('movement.path')).length === 0, {
    timeoutMs: ms,
    label: 'walk end',
  });
  await waitStill(() => camPos(g), { intervalMs: 100, stable: 3, max: 40, eps: 0.2 });
}
// mid-walk re-tap moment: wait until the DRAWN player has moved 20 world px (past the middle of a 36 px tile step)
// since the previous tap. Was a fixed 500-700 ms; this keeps the re-tap mid-step (random tick phase like the old
// sleep) instead of on a tick boundary, and does not depend on machine speed.
const drawn = (g) =>
  g.eval(
    `(() => { const c = window.__idleRpg.scene().playerView.container; return { x: c.x, y: c.y }; })()`,
  );
let stepMiss = []; // re-tap moments where the drawn player had not moved 20 px within 1.5 s (reported in evidence)
async function stepped(g) {
  const p0 = await drawn(g);
  let last = p0;
  await g
    .waitFor(
      async () => {
        last = await drawn(g);
        return Math.hypot(last.x - p0.x, last.y - p0.y) >= 20;
      },
      { timeoutMs: 1500, label: 'drawn player moved mid-step' },
    )
    .catch(async () =>
      stepMiss.push(
        `${Math.hypot(last.x - p0.x, last.y - p0.y).toFixed(1)}px path ${(await g.state('movement.path')).length}`,
      ),
    );
}
// tap a tile `d` away from the player, trying direction candidates until one is on-canvas and moves us
async function tapAhead(g, dist) {
  const p = await pos(g);
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, -1],
  ]) {
    try {
      await g.tapTile(p.x + dx * dist, p.y + dy * dist);
      return [dx, dy];
    } catch {
      /* covered by HUD */
    }
  }
  throw new Error('no tappable tile');
}

await withCombos({ port: PORT, budgetMs: BUDGET_MS, realTime: true }, COMBOS, async (g, vp) => {
  const throttle = (rate) => g.cdp.send('Emulation.setCPUThrottlingRate', { rate });
  {
    await g.eval(SAMPLER);
    await throttle(4);
    const t = await g.targetOfKind('tree');
    await g.setInventory(['bronze_axe']);
    await g.realTime(async () => {
      if (vp !== 'phone3sheet')
        await check(
          'walks',
          '5 tap-walks 4-8 tiles with mid-walk re-taps: no camera snap',
          async () => {
            await g.teleport(18, 15);
            await settle(g);
            const all = [];
            let retaps = 0,
              moved = 0;
            for (let i = 0; i < 5; i++) {
              const from = await pos(g);
              const s = await sample(g, async () => {
                await tapAhead(g, 3);
                await stepped(g);
                await tapAhead(g, 3);
                retaps++; // re-follow mid-walk
                if (i % 2 === 0) {
                  await stepped(g);
                  await tapAhead(g, 2);
                  retaps++;
                }
                await arrive(g);
              });
              const to = await pos(g);
              if (Math.abs(to.x - from.x) + Math.abs(to.y - from.y) >= 3) moved++;
              all.push(s);
            }
            const agg = {
              n: 0,
              sMax: Math.max(...all.map((s) => s.sMax)),
              sP95: Math.max(...all.map((s) => s.sP95)),
              pMax: Math.max(...all.map((s) => s.pMax)),
              pP95: Math.max(...all.map((s) => s.pP95)),
              fps: all[0].fps,
              top: all
                .flatMap((s) => s.top)
                .sort((x, y) => y.p + y.s - x.p - x.s)
                .slice(0, 3),
              maxDt: Math.max(...all.map((s) => s.maxDt)),
            };
            for (const s of all) agg.n += s.n;
            expect(moved >= 4, `only ${moved}/5 walks moved >=3 tiles`);
            expect(retaps >= 2, 'retaps');
            expect(okS(agg), `${fmt(agg)} retaps ${retaps} stepMiss [${stepMiss.join(', ')}]`);
            return `${vp}: ${moved}/5 walks, ${retaps} re-taps (re-tap waits that timed out: ${stepMiss.length ? stepMiss.join(', ') : 'none'}); ${fmt(agg)}`;
          },
        );
      if (vp !== 'phone3sheet')
        await check('gather', 'gather start right after a walk: no snap', async () => {
          await g.teleport(t.x + 3, t.y + 3);
          await settle(g);
          const s = await sample(g, async () => {
            await tapAhead(g, 2);
            await arrive(g, 8000);
            await g.tapObject(t.id);
            await g.waitFor(
              async () =>
                (await g.state('gathering.session')) != null ||
                (await g.chatLines()).some((l) => /log/i.test(l)),
              { label: 'gather started' },
            );
            // keep sampling 2 game ticks of the gather start (was a fixed 1200 ms = 2 ticks at 600 ms)
            const t0 = await g.state('tick');
            await g.waitState('tick', `t => t >= ${t0 + 2}`, { timeoutMs: 5000, label: '2 ticks' });
          });
          expect(okS(s), fmt(s));
          expect(s.bMax <= MAX_BODY, `body offset snap: ${fmt(s)}`);
          return `${vp}: ${fmt(s)}`;
        });
      if (vp === 'phone3sheet')
        await check(
          'sheet',
          'sheet collapsed/expanded: walk stays above HUD, no snap after inset settles',
          async () => {
            const out = [];
            for (const state of ['toggle1', 'toggle2']) {
              await g.tapSelector('.sheet-fold');
              const folded = await g.eval(
                `document.querySelector('.sheet-fold').getAttribute('aria-expanded')`,
              );
              await g.teleport(18, 15, { settleMs: 0 });
              await waitStill(() =>
                g.eval(
                  `(() => { const c = window.__idleRpg.scene(); return { x: c.camera.scrollX, y: c.camera.scrollY }; })()`,
                ),
              );
              const s = await sample(g, async () => {
                await tapAhead(g, 3);
                await stepped(g);
                await tapAhead(g, 3);
                await arrive(g);
              });
              const hudTop = (await g.rect('.sheet-fold')).top;
              const pv = await g.eval(
                `(() => { const p = window.__idleRpg.scene().playerView.container, q = window.__e.toClient(p.x, p.y); return q.y; })()`,
              );
              expect(
                pv < hudTop,
                `player y ${pv.toFixed(0)} not above HUD top ${hudTop.toFixed(0)} (${state})`,
              );
              expect(okS(s), `${state} ${fmt(s)}`);
              out.push(
                `expanded=${folded}: ${fmt(s)}; player y ${pv.toFixed(0)} < hud ${hudTop.toFixed(0)}`,
              );
            }
            return out.join(' || ');
          },
        );
    });
    await throttle(1);
  }
});
