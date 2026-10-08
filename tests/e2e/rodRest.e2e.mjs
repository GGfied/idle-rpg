// Rod rest pose: tip above hands along facing (front+back), catch lift, arms hidden in back view, pulses == catches.
// Run: node tests/e2e/rodRest.e2e.mjs (base port E2E_PORT or 9065; desktop + phone as parallel children).
// Fast base, two halves per facing:
//   LIVE (?tickMs=60): stand on a neighbour of the spot whose facing is front/back, start fishing through the store
//     (as before) with a keep-alive, wait on state for >= 2 catches while an in-page rAF sampler records every live
//     frame (arms check on the real game path), then wait for the session to end and compare pulses with catches.
//   SYNTHETIC (g.synth): the old file sampled ~60 s of 600 ms-tick wall clock to see rest frames between catches. Here
//     the animator is driven by hand at chosen times with the facing the live game picked: 3.5 s of cast + wait
//     (rest), then one catch pulse and 2.5 s after it (lift, then rest again). Same rig vectors, same thresholds.
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

process.env.SHOTS_DIR ??= new URL('./.shots-rodRest', import.meta.url).pathname;
const PORT = Number(process.env.E2E_PORT ?? 9065);
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
  window.__rig = { sc,
    vec: (n, x0, y0, x1, y1) => { const o = find(n).find(vis); if (!o) return null; const m = o.getWorldTransformMatrix(); const a = m.transformPoint(x0, y0), b = m.transformPoint(x1, y1); return { dx: b.x - a.x, dy: b.y - a.y, ax: a.x, ay: a.y, bx: b.x, by: b.y }; },
    armsVisible: () => find('armFrontUpper').some(vis) };
  window.__pulses = 0; window.__lastPulse = -1e9; const a = sc.animator; if (!a.__w) { a.__w = true; const p = a.pulse.bind(a); a.__rawPulse = p; a.pulse = (...x) => { window.__pulses++; window.__lastPulse = performance.now(); return p(...x); }; } })()`;
// One frame sample; `since` = ms since the last catch pulse (1e9 = none yet), `p` = pulses so far.
const FRAME = (since, p) =>
  `({ a: __rig.sc.animState, f: __rig.sc.facing, p: ${p}, since: ${since}, arms: __rig.armsVisible(), rod: __rig.vec('rod', 0, 0, 0, 20), line: __rig.vec('rodLine', 0, 0, 0, 18) })`;
// Live rAF sampler (no CDP polling): start / stop -> frames
// Each live frame also records whether ITS facing is a back facing: at 60 ms ticks the spot hops (and the keep-alive
// walks the player to the new tile) far more often per second than at 600 ms, so the facing can change mid-sample.
const LIVE_START = `(async () => { const { facingIsBack } = await import('/src/render/animation/index.ts');
  window.__live = []; window.__liveOn = true; const p0 = window.__pulses;
  const f = () => { if (!window.__liveOn) return; const fr = ${FRAME('performance.now() - __lastPulse', '__pulses - p0')}; fr.back = facingIsBack(fr.f); window.__live.push(fr); requestAnimationFrame(f); }; f(); })()`;
const LIVE_STOP = '(() => { window.__liveOn = false; return window.__live; })()';
/**
 * Synthetic series on the frozen loop: offsets (ms) after T, the pulse (if any) requested before the first offset.
 * Uses the animator's raw update/setState (muted for the scene by synth.muteAnim) and the RAW pulse (not counted).
 */
const SERIES = ({ start, facing, offsets, pulseAt }) => `(() => {
  const S = window.__e.synth; S.muteAnim(); const { a, u, s } = S.saved, T = 1e6;
  if (${start}) { s.call(a, 'fishRod', { facing: ${JSON.stringify(facing)} }); u.call(a, T); window.__synPulse = null; }
  if (${pulseAt ?? 'null'} !== null) { a.__rawPulse('catch'); window.__synPulse = ${pulseAt}; }
  const rows = [];
  for (const t of ${JSON.stringify(offsets)}) { u.call(a, T + t);
    const since = window.__synPulse === null ? 1e9 : t - window.__synPulse;
    // the animator is in fishRod because WE set it (the scene's own animState is idle once the live session ended)
    const fr = ${FRAME('since', 'window.__synPulse === null ? 0 : 1')}; fr.a = 'fishRod'; rows.push(fr); }
  return rows; })()`;
const range = (a, b, step) => {
  const o = [];
  for (let t = a; t <= b; t += step) o.push(t);
  return o;
};
const clip = async (g, name) => {
  const p = await g.eval(
    `(() => { const c = window.__idleRpg.scene().camera.scene.player.container; return window.__e.toClient(c.x, c.y - 20); })()`,
  );
  const { data } = await g.cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: Math.max(0, p.x - 50), y: Math.max(0, p.y - 70), width: 100, height: 110, scale: 4 },
  });
  const fs = await import('node:fs');
  fs.mkdirSync(process.env.SHOTS_DIR, { recursive: true });
  fs.writeFileSync(`${process.env.SHOTS_DIR}/${g.vp}-${name}.png`, Buffer.from(data, 'base64'));
  return true;
};
const rawCount = (g) =>
  g.eval(
    `${S}.game.inventory.slots.filter((s) => s && s.itemId.startsWith('raw_')).reduce((n, s) => n + s.quantity, 0)`,
  );
const up = (r) => -r.dy / Math.hypot(r.dx, r.dy); // >0: tip above the hand on screen
const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp) => {
    g.vp = vp;
    const spot = await g.eval(
      `(async () => { const R = await import('/src/app/registry.ts'); const sp = R.CONTENT.fishingSpots.get('shore_bait_1'); return sp.tiles[${S}.game.fishing.spots['shore_bait_1']?.tile ?? 0]; })()`,
    );
    // keep-alive: re-start the session whenever it ends (sessions end in ~1 s at 60 ms ticks)
    const keepAlive = `clearInterval(window.__kf); window.__kf = setInterval(() => { const st = ${S}; if (!st.game.fishing.session && !st.game.pendingFishing) st.interactSpot('shore_bait_1'); }, 100)`;
    const view = async (back) => {
      await g.eval('clearInterval(window.__kf)');
      await g.setLevel('fishing', 40); // pose test, not a catch-rate test: high level = more catches per minute
      await g.setInventory(['fishing_rod', { itemId: 'fishing_bait', quantity: 500 }]);
      const offs =
        await g.eval(`(async () => { const A = await import('/src/render/animation/index.ts'); const o = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx || dy) { if (A.facingIsBack(A.facingFromStep(-dx, -dy)) === ${back}) o.push([dx, dy]); } return o; })()`);
      for (const [dx, dy] of offs) {
        await g.teleport(spot.x + dx, spot.y + dy, { settleMs: 0 });
        const p = await g.state('movement.position');
        if (p.x !== spot.x + dx || p.y !== spot.y + dy) continue;
        await g.eval(`${S}.interactSpot('shore_bait_1')`);
        try {
          await g.waitFor(async () => (await g.state('fishing.session')) !== null, {
            timeoutMs: 4000,
            label: 'session',
          });
        } catch {
          continue;
        }
        await g.eval(INSTALL);
        await g.eval(keepAlive);
        // Wait for the fishing pose and a settled facing (the player turns to the spot a few frames after the session starts).
        try {
          await g.waitFor(async () => (await g.eval('__rig.sc.animState')) === 'fishRod', {
            timeoutMs: 4000,
            label: 'fishRod pose',
          });
        } catch {
          continue;
        }
        let lastFacing = null,
          stable = 0;
        await g.waitFor(
          async () => {
            const f = await g.eval('__rig.sc.facing');
            stable = f === lastFacing ? stable + 1 : 0;
            lastFacing = f;
            return stable >= 4; // same facing for 4 polls in a row
          },
          { timeoutMs: 3000, label: 'facing settled' },
        );
        const isBack = await g.eval(
          `(async () => { const A = await import('/src/render/animation/index.ts'); return A.facingIsBack(__rig.sc.facing); })()`,
        );
        if (isBack === back) return [dx, dy];
      }
      throw new Error('no neighbour for back=' + back);
    };

    for (const back of [false, true]) {
      const tag = back ? 'back' : 'front';
      await check(
        back ? 'b' : 'f',
        `${tag}: rest tip above hands, line+float visible; lift higher; pulses==catches; arms ${back ? 'hidden' : 'shown'}`,
        async () => {
          const off = await view(back);
          const facing = await g.eval('__rig.sc.facing');
          // ---- LIVE: >= 2 catches, every frame sampled in-page; then the session ends and pulses must equal catches
          const r0 = await rawCount(g);
          const p0 = await g.eval('window.__pulses');
          await g.eval(LIVE_START);
          await g.waitFor(async () => (await g.eval('window.__pulses')) - p0 >= 2, {
            timeoutMs: 30000,
            label: '2 catch pulses',
          });
          await g.eval('clearInterval(window.__kf)');
          await g.waitState('', 'g => !g.fishing.session && !g.pendingFishing', {
            label: 'fishing session ended',
          });
          await g.waitTicks(2); // a catch on the last tick is pulsed on the next frame (was a fixed 1200 ms sleep)
          const live = (await g.eval(LIVE_STOP)).filter((x) => x.a === 'fishRod' && x.rod);
          const c = (await rawCount(g)) - r0,
            p = (await g.eval('window.__pulses')) - p0;
          expect(p >= 1 && p === c, `pulses ${p} vs catches ${c}`);
          // arms hidden exactly when the frame's facing is a back facing (same rule as before, judged per frame)
          const badLive = live.filter((x) => (x.back ? x.arms : !x.arms));
          const backFrames = live.filter((x) => x.back).length;
          expect(
            live.length > 20 && badLive.length <= live.length * 0.02,
            `live arms vs facing: ${badLive.length}/${live.length} wrong frames, first ${JSON.stringify(badLive[0] && { a: badLive[0].a, f: badLive[0].f, back: badLive[0].back, arms: badLive[0].arms, p: badLive[0].p })}`,
          );

          // ---- SYNTHETIC: cast + wait (rest), one catch pulse, lift, rest again; facing = the live one
          await g.synth.freeze();
          const pre = await g.eval(
            SERIES({ start: true, facing, offsets: range(0, 3500, 33), pulseAt: null }),
          );
          await g.synth.step(16); // render the rest pose (scene animator muted) for the evidence shot
          const shotRest = await clip(g, `${tag}-rest`);
          const PULSE = 3533;
          const lift0 = await g.eval(
            SERIES({
              start: false,
              facing,
              offsets: range(PULSE, PULSE + 300, 33),
              pulseAt: PULSE,
            }),
          );
          await g.synth.step(16);
          const shotLift = await clip(g, `${tag}-lift`);
          const post = await g.eval(
            SERIES({
              start: false,
              facing,
              offsets: range(PULSE + 333, PULSE + 2500, 33),
              pulseAt: null,
            }),
          );
          await g.eval(
            `(() => { const { a, s, u } = window.__e.synth.saved; s.call(a, 'idle', { facing: ${JSON.stringify(facing)} }); u.call(a, 1e6 + 1e5); })()`,
          );
          await g.synth.thaw();
          const f = [...pre, ...lift0, ...post].filter((x) => x.a === 'fishRod' && x.rod);
          // same selections as the old live file: rest = no pulse yet or > 1.5 s after one; lift = < 0.7 s after it
          const rest = f.filter((x) => x.since > 1500 || x.p === 0).map((x) => up(x.rod));
          const lift = f
            .filter((x) => x.p > 0 && x.since >= 0 && x.since < 700)
            .map((x) => up(x.rod));
          const restMed = med(rest),
            liftMax = Math.max(...lift);
          expect(rest.length > 20, `rest frames ${rest.length}`);
          expect(
            restMed > 0.2,
            `rest median upward component ${restMed.toFixed(2)} (tip above hand; mutant -55 would be <=0)`,
          );
          const ln = f.filter((x) => x.line && x.since > 1500);
          expect(
            ln.length > 10 && med(ln.map((x) => x.line.by - x.rod.by)) >= -2,
            `line frames ${ln.length}`,
          );
          expect(
            liftMax > restMed + 0.1,
            `lift max ${liftMax.toFixed(2)} vs rest ${restMed.toFixed(2)}`,
          );
          const bad = f.filter((x) => (back ? x.arms : !x.arms));
          expect(
            bad.length <= f.length * 0.02,
            `arms ${back ? 'hidden' : 'shown'}: ${bad.length}/${f.length} wrong frames, first ${JSON.stringify(bad[0] && { a: bad[0].a, f: bad[0].f, p: bad[0].p, i: f.indexOf(bad[0]) })}`,
          );
          return `${vp}: off ${off} facing ${facing} rest ${restMed.toFixed(2)} (${(Math.asin(Math.min(1, restMed)) * 57.3).toFixed(0)}deg up) lift ${liftMax.toFixed(2)} | live: pulses ${p}==catches ${c}, ${live.length} frames (${backFrames} back-facing) arms ok | shots rest=${shotRest} lift=${shotLift}`;
        },
      );
    }
  }),
);
