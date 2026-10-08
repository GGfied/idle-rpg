// Rod rest pose: tip above hands along facing (front+back), catch lift, arms hidden in back view. Run: E2E_SHARED=1 node tests/e2e/rodRest.e2e.mjs (own port 5277 otherwise)
import { check, expect, forEachViewport, withGame } from './lib.mjs';

process.env.SHOTS_DIR ??= new URL('./.shots-rodRest', import.meta.url).pathname;
const S = 'window.__idleRpg.store.getState()';
const INSTALL = `(() => { const sc = window.__idleRpg.scene().camera.scene; const pv = sc.player;
  const all = (o, out = []) => { out.push(o); (o.list || []).forEach((c) => all(c, out)); return out; };
  const vis = (o) => { for (let p = o; p; p = p.parentContainer) if (!p.visible) return false; return true; };
  const find = (n) => all(pv.container).filter((o) => o.name === n);
  window.__rig = { sc,
    vec: (n, x0, y0, x1, y1) => { const o = find(n).find(vis); if (!o) return null; const m = o.getWorldTransformMatrix(); const a = m.transformPoint(x0, y0), b = m.transformPoint(x1, y1); return { dx: b.x - a.x, dy: b.y - a.y, ax: a.x, ay: a.y, bx: b.x, by: b.y }; },
    armsVisible: () => find('armFrontUpper').some(vis) };
  window.__pulses = 0; window.__lastPulse = -1e9; const a = sc.animator; if (!a.__w) { a.__w = true; const p = a.pulse.bind(a); a.pulse = (...x) => { window.__pulses++; window.__lastPulse = performance.now(); return p(...x); }; } })()`;
const FRAME = `() => ({ t: performance.now(), a: __rig.sc.animState, f: __rig.sc.facing, p: __pulses, since: performance.now() - __lastPulse,
  arms: __rig.armsVisible(), rod: __rig.vec('rod', 0, 0, 0, 20), line: __rig.vec('rodLine', 0, 0, 0, 18) })`;
const SAMPLE = (ms) =>
  `new Promise((res) => { const out = []; const t0 = performance.now(); const f = () => { out.push((${FRAME})()); if (performance.now() - t0 < ${ms}) requestAnimationFrame(f); else res(out); }; f(); })`;
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
};
const rawCount = (g) =>
  g.eval(
    `${S}.game.inventory.slots.filter((s) => s && s.itemId.startsWith('raw_')).reduce((n, s) => n + s.quantity, 0)`,
  );
const up = (r) => -r.dy / Math.hypot(r.dx, r.dy); // >0: tip above the hand on screen
const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];

await withGame(
  { port: Number(process.env.E2E_PORT ?? 5277) },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    g.vp = vp;
    const spot = await g.eval(
      `(async () => { const R = await import('/src/app/registry.ts'); const sp = R.CONTENT.fishingSpots.get('shore_bait_1'); return sp.tiles[${S}.game.fishing.spots['shore_bait_1']?.tile ?? 0]; })()`,
    );
    const view = async (back) => {
      await g.eval('clearInterval(window.__kf)');
      await g.setLevel('fishing', 5);
      await g.setInventory(['fishing_rod', { itemId: 'fishing_bait', quantity: 500 }]);
      await g.eval('window.__idleRpg.setTickMs(600)');
      const offs =
        await g.eval(`(async () => { const A = await import('/src/render/animation/index.ts'); const o = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx || dy) { if (A.facingIsBack(A.facingFromStep(-dx, -dy)) === ${back}) o.push([dx, dy]); } return o; })()`);
      for (const [dx, dy] of offs) {
        await g.teleport(spot.x + dx, spot.y + dy);
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
        await g.eval(
          `clearInterval(window.__kf); window.__kf = setInterval(() => { const st = ${S}; if (!st.game.fishing.session && !st.game.pendingFishing) st.interactSpot('shore_bait_1'); }, 400)`,
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
          const r0 = await rawCount(g);
          const p0 = await g.eval('window.__pulses');
          let shotRest = false,
            shotLift = false;
          const all = [];
          const t0 = Date.now();
          while (Date.now() - t0 < 60000) {
            const s = await g.eval(SAMPLE(1200));
            all.push(...s);
            if (!shotRest && s.some((x) => x.a === 'fishRod' && x.since > 1500 && x.rod)) {
              await clip(g, `${tag}-rest`);
              shotRest = true;
            }
            if ((await g.eval('window.__pulses')) - p0 >= 2 && shotRest) break;
            // lift screenshot: right after a pulse
            if (!shotLift && s.length && s[s.length - 1].since < 800 && s[s.length - 1].p > p0) {
              await clip(g, `${tag}-lift`);
              shotLift = true;
            }
          }
          // catch screenshot attempt via short polling if not yet taken
          const f = all.filter((x) => x.a === 'fishRod' && x.rod);
          const rest = f.filter((x) => x.since > 1500 || x.p === p0).map((x) => up(x.rod));
          const lift = f.filter((x) => x.p > p0 && x.since < 700).map((x) => up(x.rod));
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
          await g.eval('clearInterval(window.__kf)');
          await g.sleep(1200);
          const c = (await rawCount(g)) - r0,
            p = (await g.eval('window.__pulses')) - p0;
          expect(p >= 1 && p === c, `pulses ${p} vs catches ${c}`);
          return `off ${off} rest ${restMed.toFixed(2)} (${(Math.asin(Math.min(1, restMed)) * 57.3).toFixed(0)}deg up) lift ${liftMax.toFixed(2)} pulses ${p}==catches ${c} shots rest=${shotRest} lift=${shotLift}`;
        },
      );
    }
    await g.eval('window.__idleRpg.setTickMs(60)');
  }),
);
