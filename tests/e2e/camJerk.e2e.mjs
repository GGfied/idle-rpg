// Camera jerk on re-follow (user bug: "on mobile whenever i move the camera jerks").
// Real taps on the canvas, 4x CPU throttle, per-frame sampling of camera scroll + player client position.
import { check, expect, waitStill, withGame } from './lib.mjs';

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
async function arrive(g, ms = 12000) {
  await g.waitFor(async () => (await g.state('movement.path')).length === 0, {
    timeoutMs: ms,
    label: 'walk end',
  });
  await g.sleep(500);
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

await withGame({ port: Number(process.env.QA_PORT ?? 5275) }, async (g) => {
  const throttle = (rate) => g.cdp.send('Emulation.setCPUThrottlingRate', { rate });
  for (const vp of ['desktop', 'phone']) {
    await g.setViewport(vp);
    if (vp === 'phone')
      await g.cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
        mobile: true,
      });
    await g.load();
    await g.eval(SAMPLER);
    await throttle(4);
    const t = await g.targetOfKind('tree');
    await g.setInventory(['bronze_axe']);
    await g.realTime(async () => {
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
              await g.sleep(700);
              await tapAhead(g, 3);
              retaps++; // re-follow mid-walk
              if (i % 2 === 0) {
                await g.sleep(500);
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
          expect(okS(agg), `${fmt(agg)} retaps ${retaps}`);
          return `${vp}: ${moved}/5 walks, ${retaps} re-taps; ${fmt(agg)}`;
        },
      );
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
          await g.sleep(1200);
        });
        expect(okS(s), fmt(s));
        expect(s.bMax <= MAX_BODY, `body offset snap: ${fmt(s)}`);
        return `${vp}: ${fmt(s)}`;
      });
      if (vp === 'phone')
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
              await g.teleport(18, 15, { settleMs: 300 });
              await waitStill(() =>
                g.eval(
                  `(() => { const c = window.__idleRpg.scene(); return { x: c.camera.scrollX, y: c.camera.scrollY }; })()`,
                ),
              );
              const s = await sample(g, async () => {
                await tapAhead(g, 3);
                await g.sleep(600);
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
