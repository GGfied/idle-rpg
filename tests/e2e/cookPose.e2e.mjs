// Cook-over-fire pose capture (screenshot-judged, plus a light numeric check that cooking really runs):
// player adjacent to a fire in 3 facings, raw_shrimp cooking, zoomed frame sheets for desktop + phone.
// Sheets: tests/e2e/.shots-cookpose/sheet-<vp>-<facing>.png. Run: node tests/e2e/cookPose.e2e.mjs (fast base: desktop +
// phone in parallel on 9207/9208; frames are driven by synthetic time, not sampled on the wall clock)
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { check, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = 9207; // C5 port block 9201-9250
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});
// 16 frames, 190 ms of synthetic time apart (10 full frames of 19 ms each): ~3 s of the cook pose, like the old
// 3 s wall-clock sampler, but every frame is a chosen one (screenshots no longer eat the sample window)
const SAMPLES = 16;
const STEP_MS = 19;
const STEPS_PER_SAMPLE = 10;

process.env.SHOTS_DIR ??= new URL('./.shots-cookpose/', import.meta.url).pathname;
// fire offset from the player: the player must turn to face it (east, south, north-west on screen = iso diagonals)
const FACINGS = { fireE: [1, 0], fireS: [0, 1], fireNW: [-1, 0] };

// Food prop (Graphics named 'food', visible) in client px vs the fire tile centre (flame middle ~ -14 px above the tile).
// Back view (fireNW): the fire is behind the player, so the food hangs in front of the log base, ~31 px off the flame middle.
const MAX_PX = { fireE: 24, fireS: 24, fireNW: 34 };
// Median over the cook (the held-over pose dominates; min alone is set by the lift-and-check frames).
const MAX_MED = { fireE: 27, fireS: 27, fireNW: 38 };
async function foodToFire(g, ft) {
  const f = await g.tileClient(ft.x, ft.y, -14);
  const pos =
    await g.eval(`(() => { const seen = new Set(); const walk = (o, d) => { if (!o || typeof o !== 'object' || seen.has(o) || d > 6) return null;
    seen.add(o); if (o.name === 'food' && o.visible && o.getWorldTransformMatrix) { const m = o.getWorldTransformMatrix(); return { x: m.tx, y: m.ty }; }
    const kids = Array.isArray(o.list) ? o.list : Object.entries(o).filter(([k]) => !['scene', 'parent', 'game', 'displayList', 'input', 'body'].includes(k)).map(([, v]) => v); for (const k of kids) { const r = walk(k, d + 1); if (r) return r; } return null; };
    const h = window.__idleRpg.scene(); const w = walk(h.playerView, 0); return w ? window.__e.toClient(w.x, w.y) : null; })()`);
  return pos ? Math.hypot(pos.x - f.x, pos.y - f.y) : null;
}

await withGame(
  // fast ticks for the set-up; synth.freeze() slows the tick to real time (600 ms) for the captured cook frames
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp) => {
    for (const [name, [dx, dy]] of Object.entries(FACINGS)) {
      await check(
        `pose-${name}`,
        `cook next to a fire (${name}): frames captured, cooking runs`,
        async () => {
          await g.setInventory(Array.from({ length: 20 }, () => 'raw_shrimp'));
          const spot =
            await g.eval(`(async () => { const { CONTENT } = await import('/src/app/registry.ts'); const gr = CONTENT.grid;
          const p = window.__idleRpg.store.getState().game.movement.position;
          for (let r = 0; r < 12; r++) for (let x = p.x - r; x <= p.x + r; x++) for (let y = p.y - r; y <= p.y + r; y++)
            if (gr.isWalkable(x, y) && gr.isWalkable(x + ${dx}, y + ${dy}) && gr.isWalkable(x - 1, y) && gr.isWalkable(x, y - 1)) return { x, y }; })()`);
          await g.teleportSettled(spot.x, spot.y);
          const ft = { x: spot.x + dx, y: spot.y + dy };
          await g.update(
            `({ ...g, cooking: { ...g.cooking, session: null }, firemaking: { ...g.firemaking, nextId: g.firemaking.nextId + 1, fires: [{ id: 'fireP' + g.firemaking.nextId, tile: ${JSON.stringify(ft)}, logsId: 'logs', expiresAtTick: g.tick + 9000 }] } })`,
          );
          // the fire view appears on the next rendered frame; settle() spans several frames and waits out the camera
          await g.settle();
          await g.tapTile(ft.x, ft.y, -14);
          await g.waitFor(async () => !!(await g.state('cooking.session')), {
            label: 'cooking session',
          });
          const frames = [];
          const dists = [];
          await g.synth.freeze();
          for (let i = 0; i < SAMPLES; i++) {
            if (i) await g.synth.step(STEP_MS, STEPS_PER_SAMPLE);
            const pos = await g.state('movement.position');
            const p = await g.tileClient(pos.x, pos.y, -22);
            const { data } = await g.cdp.send('Page.captureScreenshot', {
              format: 'jpeg',
              quality: 88,
              clip: { x: p.x - 64, y: p.y - 52, width: 128, height: 112, scale: 2 },
            });
            frames.push({ t: i * STEP_MS * STEPS_PER_SAMPLE, data });
            dists.push(await foodToFire(g, ft));
          }
          const still = !!(await g.state('cooking.session'));
          await g.synth.thaw();
          const url =
            await g.eval(`(async () => { const fr = ${JSON.stringify(frames)}; const cols = 6, w = 256, h = 224; const rows = Math.ceil(fr.length / cols);
          const c = document.createElement('canvas'); c.width = cols * w; c.height = rows * h; const x = c.getContext('2d'); x.fillStyle = '#222'; x.fillRect(0, 0, c.width, c.height);
          for (let i = 0; i < fr.length; i++) { const im = new Image(); im.src = 'data:image/jpeg;base64,' + fr[i].data; await im.decode(); x.drawImage(im, (i % cols) * w, Math.floor(i / cols) * h, w, h);
            x.fillStyle = '#ff0'; x.font = '16px monospace'; x.fillText(String(fr[i].t), (i % cols) * w + 4, Math.floor(i / cols) * h + 16); }
          return c.toDataURL('image/png'); })()`);
          mkdirSync(process.env.SHOTS_DIR, { recursive: true });
          writeFileSync(
            `${process.env.SHOTS_DIR}sheet-${vp}-${name}.png`,
            Buffer.from(url.split(',')[1], 'base64'),
          );
          g.expect(frames.length >= 8, `only ${frames.length} frames`);
          await g.update(
            `({ ...g, cooking: { ...g.cooking, session: null }, firemaking: { ...g.firemaking, fires: [] } })`,
          );
          const ok = dists.filter((d) => d !== null);
          g.expect(ok.length >= 8, `food prop not found (${ok.length} samples)`);
          const med = [...ok].sort((a, b) => a - b)[Math.floor(ok.length / 2)];
          g.expect(
            med <= (MAX_MED[name] ?? 1e9),
            `food median ${med.toFixed(1)}px from the fire, over ${MAX_MED[name]}`,
          );
          const best = Math.min(...ok),
            range = Math.max(...ok) - best;
          g.expect(
            best <= MAX_PX[name],
            `food never within ${MAX_PX[name]}px of the fire (closest ${best.toFixed(1)})`,
          );
          g.expect(range >= 2, `no poke motion in the food (range ${range.toFixed(1)}px)`);
          return `${vp}: ${frames.length} frames, session=${still}, food-fire px median ${med.toFixed(1)} min ${best.toFixed(1)} range ${range.toFixed(1)}`;
        },
      );
    }
  }),
);
