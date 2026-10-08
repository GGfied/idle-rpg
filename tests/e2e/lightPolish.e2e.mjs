// Lighting polish: F3 (no frame with the player inside the flames after ignition) + F1 (kneel arm pose, zoomed sheets
// per facing and strike phase; judged by eye). Sheets: tests/e2e/.shots-lightpolish/sheet-<vp>-<renderer>-<dir>.jpg.
// Fast base: runParallel desktop + phone x webgl + canvas (sheets are visual), ?tickMs=60, wait-on-state, synthetic
// time for the sheets (frames stepped by hand and copied in-page: no wall-clock screenshot loop), budget 60 s.
// Run: node tests/e2e/lightPolish.e2e.mjs
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { check, forEachCombo, runParallel, withGame } from './lib.mjs';

process.env.SHOTS_DIR ??= new URL('./.shots-lightpolish/', import.meta.url).pathname;
const PORT = 9164; // combos use 9164..9167
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl', 'canvas'],
  budgetMs: BUDGET_MS,
});
const START = { x: 18, y: 15 };
const STEP = {
  e: [1, 0],
  w: [-1, 0],
  s: [0, 1],
  n: [0, -1],
  se: [1, 1],
  nw: [-1, -1],
  ne: [1, -1],
  sw: [-1, 1],
};
const FACINGS = (process.env.FACINGS ?? 'e,w,s,n,se,nw,ne,sw').split(',');
// One strike cycle: a frame every 50 ms of synthetic time over 0-950 ms (the old wall-clock loop caught ~10 kneel frames
// before ignition). Game ticks cannot run inside the stepped loop, so frames past one cycle (~1 s) show the one-shot
// strike ending and the player standing on the logs: a harness artefact, not the game, so they are not captured.
const OFFSETS = Array.from({ length: 20 }, (_, i) => i * 50);

/** Phone HUD sheet: open (slots have a size) or folded (canvas taps reach the world). Waits on the DOM, not a sleep. */
async function sheet(g, open) {
  if (!g.touch) return;
  const isFolded = () => g.eval(`document.querySelector('.hud').dataset.folded === 'true'`);
  if ((await isFolded()) !== open) return;
  await g.tapSelector('.sheet-fold');
  await g.waitFor(async () => (await isFolded()) !== open, { label: `sheet open=${open}` });
  if (open)
    await g.waitFor(async () => ((await g.rect('[data-slot-index="1"]'))?.w ?? 0) > 0, {
      label: 'slot 1 has a size',
    });
}
/** Right-click / long-press slot 1 -> Light. fold:false keeps the phone sheet open (no canvas taps follow). */
async function menuLight(g, { fold = true } = {}) {
  await sheet(g, true);
  const r = await g.rect('[data-slot-index="1"]');
  if (g.touch)
    await g.eval(
      `document.querySelector('[data-slot-index="1"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: ${r.x}, clientY: ${r.y}, button: 2 }))`,
    );
  else await g.rightClick(r.x, r.y);
  let m = null;
  await g
    .waitFor(
      async () =>
        (m = await g.eval(
          `(() => { const e = [...document.querySelectorAll('[role=menu] .menu-item')].find((x) => x.textContent.trim() === 'Light'); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`,
        )),
      { label: 'Light menu item', timeoutMs: 3000 },
    )
    .catch(() => {});
  g.expect(m, 'Light option missing');
  await g.tap(m.x, m.y);
  if (fold) await sheet(g, false);
}
const reset = async (g) => {
  await g.update(
    '({ ...g, firemaking: { ...g.firemaking, fires: [], lighting: null }, chat: [] })',
  );
  await g.setInventory(['tinderbox', { itemId: 'logs', quantity: 3 }]);
  await g.teleport(START.x, START.y, { settleMs: 0 });
};
/** Face `dir` by a real one-tile walk (facing comes from the last step), then wait for idle + camera still. */
async function faceBy(g, dir) {
  const [dx, dy] = STEP[dir];
  await g.teleport(START.x - dx, START.y - dy, { settleMs: 0 });
  await g.walkTo(START.x, START.y);
  await g.waitState('movement.position', `p => p.x === ${START.x} && p.y === ${START.y}`, {
    label: 'stepped',
    timeoutMs: 5000,
  });
  await g.waitIdle();
  await g.settle();
}
const SCENE = `window.__idleRpg.scene().camera.scene`;

/**
 * Page source: freeze Phaser's loop, step one full frame per offset and copy the 72x72 css-px box around the player
 * (above START) from the game canvas into a sheet (same task as the render, so WebGL's buffer is still valid).
 * Returns the sheet JPEG plus per-frame luminance spread (blank-frame guard) and distinct-frame count (motion evidence).
 */
const SHEET_SRC = (offsets) => `(async () => {
  const p = await window.__e.tileClient(${START.x}, ${START.y}, -22);
  const S = window.__e.synth, cv = S.game().canvas, r = cv.getBoundingClientRect();
  const kx = cv.width / r.width, ky = cv.height / r.height;
  const sx = (p.x - 36 - r.left) * kx, sy = (p.y - 30 - r.top) * ky, sw = 72 * kx, sh = 72 * ky;
  const offs = ${JSON.stringify(offsets)}, cols = 8, w = 144, h = 144, rows = Math.ceil(offs.length / cols);
  const c = document.createElement('canvas'); c.width = cols * w; c.height = rows * h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#222'; x.fillRect(0, 0, c.width, c.height);
  const spread = [], sigs = new Set();
  S.freeze();
  for (let i = 0; i < offs.length; i++) {
    S.stepTo(offs[i]);
    const dx = (i % cols) * w, dy = Math.floor(i / cols) * h;
    x.drawImage(cv, sx, sy, sw, sh, dx, dy, w, h);
    const d = x.getImageData(dx, dy, w, h).data; let lo = 255, hi = 0, sig = 0;
    for (let k = 0; k < d.length; k += 16) { const l = (d[k] * 3 + d[k + 1] * 6 + d[k + 2]) / 10; lo = Math.min(lo, l); hi = Math.max(hi, l); sig = (sig * 31 + (l | 0)) >>> 0; }
    spread.push(Math.round(hi - lo)); sigs.add(sig);
    x.fillStyle = '#ff0'; x.font = '16px monospace'; x.fillText(String(offs[i]), dx + 4, dy + 16);
  }
  return { url: c.toDataURL('image/jpeg', 0.9), spread, distinct: sigs.size };
})()`;

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp, renderer) => {
    await check(
      'lp-overlap',
      'no frame with the player drawn on the flames after ignition',
      async () => {
        await reset(g);
        await g.settle();
        await g.eval(`(async () => { const { isoProjection } = await import('/src/render/projection.ts'); window.__ov = []; const sc = ${SCENE};
        sc.events.on('postupdate', () => { try { const f = window.__idleRpg.store.getState().game.firemaking.fires[0]; if (!f) return;
          const w = isoProjection.tileToWorld(f.tile.x, f.tile.y); const pv = sc.player.container; window.__ov.push({ d: Math.hypot(pv.x - w.x, pv.y - w.y), t: performance.now() }); } catch {} }); })()`);
        // realTime: the bug is frames drawn between ignition and the step-aside glide; at 60 ms ticks the glide lasts
        // ~4 frames and would hide it. 600 ms ticks = the real pace the player sees.
        const ov = await g.realTime(async () => {
          await menuLight(g);
          await g.waitFor(async () => (await g.state('firemaking.fires')).length > 0, {
            label: 'lit',
            timeoutMs: 8000,
          });
          // was a fixed 1.5 s sleep: wait for the step-aside walk to end, then for frames covering one more tick
          await g.waitState(
            '',
            `g => { const f = g.firemaking.fires[0], p = g.movement.position; return f && (p.x !== f.tile.x || p.y !== f.tile.y) && g.movement.path.length === 0; }`,
            { label: 'stepped aside, idle', timeoutMs: 5000 },
          );
          await g.waitFor(
            () =>
              g.eval(
                `window.__ov.length > 5 && window.__ov[window.__ov.length - 1].t - window.__ov[0].t >= 1500`,
              ),
            { label: '1.5 s of frames after ignition', timeoutMs: 5000 },
          );
          return g.eval('window.__ov');
        });
        g.expect(ov.length > 5, `only ${ov.length} frames sampled`);
        const first = ov[0].d,
          min = Math.min(...ov.map((o) => o.d));
        const close = ov.filter((o) => o.d < 14).length;
        g.expect(
          close === 0,
          `${close}/${ov.length} frames with the player within 14 world px of the fire (first frame d=${first.toFixed(1)})`,
        );
        return `${vp}/${renderer}: ${ov.length} frames after ignition, first-frame distance ${first.toFixed(1)} px, min ${min.toFixed(1)} px, frames within 14px: ${close}`;
      },
    );

    await check(
      'lp-arms-capture',
      'zoomed strike-phase sheets for every facing captured (frames not blank)',
      async () => {
        const out = [];
        const { mkdirSync, writeFileSync } = await import('node:fs');
        mkdirSync(process.env.SHOTS_DIR, { recursive: true });
        for (const dir of FACINGS) {
          await reset(g);
          await faceBy(g, dir);
          // keep the lighting session alive while frames are stepped (synth.freeze also slows ticks to 600 ms)
          await g.setTickMs(600);
          // the sheet copies the game canvas itself, so an open phone HUD sheet over it does not matter: stay open
          await menuLight(g, { fold: false });
          await g.waitState('firemaking.lighting', 'l => !!l', {
            label: 'lighting started',
            timeoutMs: 8000,
          });
          let res;
          try {
            res = await g.eval(SHEET_SRC(OFFSETS));
          } finally {
            await g.synth.thaw();
            await g.setTickMs(g.tickMs);
          }
          writeFileSync(
            `${process.env.SHOTS_DIR}sheet-${vp}-${renderer}-${dir}.jpg`,
            Buffer.from(res.url.split(',')[1], 'base64'),
          );
          const blank = res.spread.filter((s) => s < 8).length;
          g.expect(blank === 0, `${dir}: ${blank}/${res.spread.length} blank frames`);
          out.push(`${dir}:${res.spread.length}f/${res.distinct}distinct`);
        }
        return `${vp}/${renderer}: ${out.join(' ')}`;
      },
    );
  }),
);
