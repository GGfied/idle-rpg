// Nameplate clamp in real play: NPCs walk past the screen edges, camera drag-pan pushes labels to the edges.
// Per frame (scene 'render' = what is drawn): label inside the view, no jitter, no detach from the entity.
// Fast base: runParallel phone + landscape + desktop x webgl + canvas (6 children, own port each), wait-on-state
// (arrival, camera still, frame counts) instead of sleeps/polling loops, budget 60 s.
// Run: node tests/e2e/nameplateClampPlay.e2e.mjs   (E2E_PORT=base, SHOTS_DIR=..., VPS=phone,landscape,desktop)
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

// Shots DURING recording (mid-walk, drag) stall rendering ~650 ms and perturb the frame series, so they stay opt-in via
// SHOTS_DIR as before; one end-of-run shot per combo (outside recording) is always written for a look at the game.
const SHOTS_IN_RECORDING = !!process.env.SHOTS_DIR;
process.env.SHOTS_DIR ??= new URL('./.shots-nameplate-play/', import.meta.url).pathname;
// One source: parse the designed keep-out cap (CSS px) from the render code instead of copying the number.
const MAX_SIDE_SHIFT = +/MAX_SIDE_SHIFT\s*=\s*(\d+)/.exec(
  readFileSync(new URL('../../src/render/labelKeepOut.ts', import.meta.url), 'utf8'),
)[1];
const PORT = 9170; // combos use 9170..9175
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: (process.env.VPS || 'phone,landscape,desktop').split(','),
  renderers: (process.env.MODES || 'webgl,canvas').split(','),
  budgetMs: BUDGET_MS,
});

const SAMPLER = `(() => { const sc = window.__idleRpg.scene().camera.scene; const cam = sc.cameras.main;
  const L = (window.__lp = window.__lp || { on: false, frames: [], hooked: false }); let nid = window.__lpn || 0;
  if (L.hooked) return; L.hooked = true;
  // entity-anchored label box (before any sideways keep-out shift) touches a HUD keep-out rect (+8 px): the designed shift applies
  const nearKeepOut = (c, m, t, v, r) => { const z = r.width / v.width; const x0 = r.left + ((c.x - v.x) * z) - t.width * z / 2 - 8; const x1 = x0 + t.width * z + 16;
    const y = r.top + (m.ty - v.y) * z; const y0 = y - 20, y1 = y + 20;
    return [...document.querySelectorAll('.topright, .tabs, .chatbox')].some((e) => { const b = e.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && x0 < b.right && x1 > b.left && y0 < b.bottom && y1 > b.top; }); };
  sc.events.on('render', () => { if (!L.on) return; const v = cam.worldView; const r = sc.game.canvas.getBoundingClientRect(); const rows = [];
    sc.children.list.forEach((c) => { if (!c.list) return; const t = c.list.find((o) => o.type === 'Text' && o.visible && o.text); if (!t) return;
      if (!c.visible || c.alpha < 0.01) return; if (c.__lid == null) c.__lid = ++nid; const m = t.getWorldTransformMatrix(); const hw = t.width / 2;
      rows.push({ id: c.__lid, text: t.text, cx: c.x, lx: m.tx, hw, L: m.tx - hw - v.left, R: v.right - (m.tx + hw), vl: v.left, vr: v.right,
        sx: r.left + ((m.tx - v.x) / v.width) * r.width, off: t.x, cy: c.y, zoom: r.width / v.width, near: nearKeepOut(c, m, t, v, r) }); });
    L.frames.push({ t: performance.now(), vl: v.left, vr: v.right, rows }); }); })()`;

function analyse(frames) {
  let minMargin = 1e9,
    clipped = 0,
    maxDetach = 0,
    maxDetachNear = -1e9,
    ghost = 0,
    reversals = 0,
    atEdge = 0,
    nearFloat = 0,
    small = 0;
  const series = new Map();
  let seg = 0;
  for (let fi = 0; fi < frames.length; fi++) {
    const f = frames[fi];
    // a >45 ms gap (2.5 frames) = the page was frozen (screenshot/GC): the entity legitimately jumps; start a new series
    if (fi && f.t - frames[fi - 1].t > 45) seg++;
    for (const r of f.rows) {
      const m = Math.min(r.L, r.R);
      minMargin = Math.min(minMargin, m);
      if (m < -0.5) clipped++;
      if (m < 6) atEdge++;
      // entity comfortably inside the clamp zone (6 px buffer for the 1-frame camera lag) -> label must sit on it
      if (r.cx - r.hw - 10 > r.vl && r.cx + r.hw + 10 < r.vr)
        // a label near a HUD keep-out rect may be shifted sideways by up to MAX_SIDE_SHIFT css px (design); track it apart
        if (r.near)
          maxDetachNear = Math.max(maxDetachNear, Math.abs(r.lx - r.cx) - MAX_SIDE_SHIFT / r.zoom);
        else maxDetach = Math.max(maxDetach, Math.abs(r.lx - r.cx));
      // label drawn inside the view for an entity beyond the cull margin (96 px + 14): culling/hide must have removed it
      if (m >= -0.5 && (r.cx < r.vl - 110 || r.cx > r.vr + 110)) ghost++;
      else if (m >= -0.5 && (r.cx < r.vl - 2 * r.hw || r.cx > r.vr + 2 * r.hw)) nearFloat++; // inside cull margin: info
      const key = `${r.id}:${seg}`;
      if (!series.has(key)) series.set(key, []);
      series.get(key).push(r.sx);
    }
  }
  let maxJump = 0,
    camStep = 0,
    firstRev = null;
  for (let i = 1; i < frames.length; i++)
    if (frames[i].t - frames[i - 1].t <= 45)
      camStep = Math.max(camStep, Math.abs(frames[i].vl - frames[i - 1].vl));
  for (const [sid, s] of series.entries())
    for (let i = 2; i < s.length; i++) {
      const a = s[i - 1] - s[i - 2],
        b = s[i] - s[i - 1];
      maxJump = Math.max(maxJump, Math.abs(b));
      if (Math.abs(a) > 2 && Math.abs(b) > 2 && Math.sign(a) !== Math.sign(b)) {
        small++; // 2-5 px wobble: the follow camera's integer worldView.x vs fractional body under frame-time noise (info)
      }
      if (Math.abs(a) > 5 && Math.abs(b) > 5 && Math.sign(a) !== Math.sign(b)) {
        reversals++;
        if (!firstRev)
          firstRev = { sid, sx: s.slice(Math.max(0, i - 4), i + 2).map((x) => +x.toFixed(1)) };
      }
    }
  return {
    n: frames.length,
    labels: new Set([...series.keys()].map((k) => k.split(':')[0])).size,
    minMargin: +minMargin.toFixed(1),
    clipped,
    atEdge,
    maxDetach: +maxDetach.toFixed(2),
    maxDetachNear: +Math.max(maxDetachNear, -99).toFixed(2),
    ghost,
    nearFloat,
    reversals,
    small,
    maxJump: +maxJump.toFixed(1),
    camStep: +camStep.toFixed(1),
    firstRev,
  };
}

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp0, mode) => {
    {
      const vp = `${vp0}-${mode}`;
      g.expect(
        (await g.rendererName()) === mode,
        `booted ${await g.rendererName()}, wanted ${mode}`,
      );
      await g.eval(SAMPLER);
      const S = {}; // scenario -> {a: analysis, moved}
      const rec = async (name, fn) => {
        await g.eval('window.__lp.frames = []; window.__lp.on = true');
        let extra = '';
        try {
          extra = (await fn()) ?? '';
        } finally {
          await g.eval('window.__lp.on = false');
        }
        S[name] = { a: analyse(await g.eval('window.__lp.frames')), extra };
      };
      const pos = () => g.state('movement.position');
      /** Walk to (x, y) by the real walk intent; mid-walk shot once 2+ tiles are covered; wait for arrival (was a 100 ms poll loop). */
      const walk = async (x, y, shot) => {
        const p0 = await pos();
        await g.walkTo(x, y);
        if (shot && SHOTS_IN_RECORDING) {
          await g
            .waitState(
              'movement.position',
              `p => Math.abs(p.x - ${p0.x}) + Math.abs(p.y - ${p0.y}) >= 2`,
              { timeoutMs: 4000 },
            )
            .catch(() => {});
          await g.screenshot(`${vp}-${shot}`); // the >45 ms stall starts a new series in analyse()
        }
        // not reaching the target is reported in the evidence (as before), not failed here
        await g
          .waitState('movement.position', `p => p.x === ${x} && p.y === ${y}`, { timeoutMs: 9000 })
          .catch(() => {});
        const p1 = await pos();
        return `moved ${Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y)} tiles -> ${p1.x},${p1.y}`;
      };
      /** Keep recording until `n` more frames are drawn (was a fixed sleep window). */
      const frames = (n) =>
        g.eval('window.__lp.frames.length').then((k) =>
          g.waitFor(() => g.eval(`window.__lp.frames.length >= ${k + n}`), {
            label: `${n} frames drawn`,
            timeoutMs: 10000,
          }),
        );
      // 200 ms ticks, not 60: the per-frame label path (jitter / reversals) depends on how far the body glides each
      // frame; at 60 ms a tile step lasts ~4 frames, which is not what a player sees (real 600 ms) nor comparable.
      await g.setTickMs(200);
      await g.teleportSettled(82, 68);
      await rec('fern-east', () => walk(92, 68, 'fern-walk'));
      await rec('fern-south', () => walk(92, 76));
      await g.teleportSettled(4, 11);
      await rec('willow-east', () => walk(11, 11, 'willow-walk'));
      await rec('willow-south', () => walk(11, 19));
      // the DEV hook clamps tickMs to 30..600, so ticks cannot freeze (the old 3600000 was clamped to 600 too); the
      // player is idle after the teleport, so only the drag moves the camera
      await g.setTickMs(600);
      await g.teleportSettled(12, 9); // beside the static Banker: the pan always has a named entity (no wandering NPC needed)
      const view0 = await g.eval(
        '(() => { const v = window.__idleRpg.scene().camera.scene.cameras.main.worldView; return { x: v.x, y: v.y }; })()',
      );
      const cr = await g.eval(
        '(() => { const r = window.__idleRpg.scene().camera.scene.game.canvas.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()',
      );
      const cx = cr.l + cr.w / 2,
        cy = cr.t + cr.h * 0.35;
      let panned = 0;
      await rec('drag-pan', async () => {
        for (const [dx, dy] of [
          [170, 0],
          [-340, 0],
          [170, 0],
          [0, 150],
          [0, -300],
          [0, 150],
        ]) {
          await g.drag(cx - dx / 2, cy - dy / 2, cx + dx / 2, cy + dy / 2, 14);
          const v = await g.eval(
            '(() => { const v = window.__idleRpg.scene().camera.scene.cameras.main.worldView; return { x: v.x, y: v.y }; })()',
          );
          panned = Math.max(panned, Math.abs(v.x - view0.x) + Math.abs(v.y - view0.y));
          if (SHOTS_IN_RECORDING && dx === 170 && panned > 0)
            await g.screenshot(`${vp}-drag-${dx}-${dy}`);
        }
        await g.settle(); // was a 500 ms sleep: record until the camera has stopped after the last drag
        await frames(10);
        return `max pan ${panned.toFixed(0)} world px`;
      });
      await rec('rest', () => frames(22)); // was a 600 ms window; p1 needs > 20 frames per scenario
      await g.screenshot(`${vp}-end`); // after recording: no effect on the frame series
      const sc = Object.entries(S);
      const all = (k) => sc.map(([n, s]) => `${n}:${s.a[k]}`).join(' ');
      await check('p1', `${vp}: label never clipped (>=0 px inside view, margin 4)`, async () => {
        expect(
          sc.every(([n, s]) => s.a.n > 20 && (n === 'rest' || s.a.labels > 0)),
          `no frames/labels: ${all('n')} / ${all('labels')}`,
        );
        expect(
          sc.every(([, s]) => s.a.clipped === 0),
          `clipped frames ${all('clipped')} minMargin ${all('minMargin')}`,
        );
        return `frames ${all('n')} | minMargin ${all('minMargin')} | atEdge frames ${all('atEdge')} | ${sc.map(([n, s]) => `${n} ${s.extra}`).join(' ; ')}`;
      });
      await check(
        'p2',
        `${vp}: no jitter (no back-and-forth > 5 px between frames; 2-5 px counted as info)`,
        async () => {
          const walks = sc.filter(([n]) => !n.startsWith('drag'));
          expect(
            walks.every(([, s]) => s.a.reversals === 0),
            `reversals ${all('reversals')} maxJump ${all('maxJump')} first ${JSON.stringify(walks.map(([n, s]) => [n, s.a.firstRev]))}`,
          );
          return `reversals>5px ${all('reversals')} (info 2-5px wobble ${all('small')}) | max per-frame jump px ${all('maxJump')}`;
        },
      );
      await check('p3', `${vp}: label stays on its entity when not at an edge`, async () => {
        expect(
          sc.every(
            ([, s]) => s.a.maxDetach < 2 + s.a.camStep && s.a.maxDetachNear < 2 + s.a.camStep,
          ),
          `detach world px ${all('maxDetach')} beyond-keep-out ${all('maxDetachNear')} camStep ${all('camStep')}`,
        );
        return `max detach ${all('maxDetach')} (allowed 2 + camera step ${all('camStep')}; labels near a HUD rect: allowed + ${MAX_SIDE_SHIFT} css px keep-out shift, excess ${all('maxDetachNear')})`;
      });
      await check('p4', `${vp}: pan really moved the camera`, async () => {
        expect(panned > 40, `pan only ${panned}`);
        return `${panned.toFixed(0)} world px`;
      });
      await check(
        'p5',
        `${vp}: no label floats at an edge for an entity far off-screen`,
        async () => {
          expect(
            sc.every(([, s]) => s.a.ghost === 0),
            `ghost label frames ${all('ghost')}`,
          );
          return `ghost frames ${all('ghost')} (info: label floating for an entity 60-110 px outside, still inside cull margin: ${all('nearFloat')})`;
        },
      );
    }
  }),
);
