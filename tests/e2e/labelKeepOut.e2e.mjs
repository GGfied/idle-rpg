// Nameplate keep-out: with the player panned near the top of the view, the "You" label must not sit
// under the HUD (orbs + minimap, area banner, phone tab bar / chat button), must stay attached, no jitter.
// Run: node tests/e2e/labelKeepOut.e2e.mjs   (SHOTS_DIR=<dir> saves screenshots; E2E ports 6900-6949)
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = 6900;
const BUDGET_MS = 90e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl', 'canvas'],
  budgetMs: BUDGET_MS,
});
const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const SAMPLE = `(() => {
  const R = (e) => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
  const sc = window.__idleRpg.scene(); const pv = sc.playerView.container;
  const t = pv.list.find((k) => k.type === 'Text');
  const m = t.getWorldTransformMatrix(); const z = sc.camera.zoom;
  const w = t.width * Math.abs(m.scaleX) * z, h = t.height * Math.abs(m.scaleY) * z;
  const f = window.__e.toClient(m.tx, m.ty); // origin (0.5, 1): bottom-centre
  const a = { x: f.x - w / 2, y: f.y - h }, c = { x: f.x + w / 2, y: f.y };
  const body = window.__e.toClient(pv.x, pv.y);
  const sel = ['.topright', '.tabs', '.area-banner-inner', '.chat-toggle', '.chatbox', '#hud'];
  const keep = [];
  for (const q of sel) for (const e of document.querySelectorAll(q)) {
    if (parseFloat(getComputedStyle(e).opacity) < 0.05) continue;
    const r = R(e); if (r.right - r.left < 4 || r.bottom - r.top < 4) continue;
    const cv = R(document.querySelector('canvas'));
    const l = Math.max(r.left, cv.left), tp = Math.max(r.top, cv.top), rr = Math.min(r.right, cv.right), b = Math.min(r.bottom, cv.bottom);
    if (rr - l >= 4 && b - tp >= 4) keep.push({ q, left: l, top: tp, right: rr, bottom: b });
  }
  return JSON.stringify({ label: { left: a.x, top: a.y, right: c.x, bottom: c.y }, bodyX: body.x, bodyY: body.y, visible: t.visible, keep });
})()`;

let plainTop = null;
await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp, renderer) => {
    for (const banner of [false, true]) {
      await check(
        `lk-${banner ? 'b' : 'n'}`,
        `${vp}/${renderer}${banner ? ' +banner' : ''}: "You" clear of HUD at top, attached, steady`,
        async () => {
          await g.eval(`(() => { const c = window.__idleRpg.scene().camera; c.setZoom(2.5); })()`);
          await g.settle();
          // pan so the body sits ~215 css px under the canvas top, 70% across (where the orbs/minimap are)
          // BEFORE=1: unregister the keep-out provider to capture the pre-wiring behaviour
          if (process.env.BEFORE)
            await g.eval(`import('/src/render/index.ts').then((m) => m.setLabelKeepOuts(null))`);
          const pan = `(() => { const sc = window.__idleRpg.scene(); const c = sc.camera; const pv = sc.playerView.container;
            c.stopFollow(); const cv = document.querySelector('canvas').getBoundingClientRect();
            const p = window.__e.toClient(pv.x, pv.y); const tx = cv.left + cv.width * 0.8, ty = cv.top + 215;
            c.setScroll(c.scrollX + (p.x - tx) / c.zoom, c.scrollY + (p.y - ty) / c.zoom);
            const q = window.__e.toClient(pv.x, pv.y); return JSON.stringify({ x: q.x - tx, y: q.y - ty }); })()`;
          for (let i = 0; i < 3; i++) {
            await g.sleep(100);
            await g.eval(pan);
          }
          if (banner)
            await g.eval(`window.__idleRpg.store.getState().showAreaBanner('Willowbrook Bank')`);
          await g.sleep(banner ? 700 : 400);
          const samples = [];
          for (let i = 0; i < 6; i++) {
            samples.push(JSON.parse(await g.eval(SAMPLE)));
            await g.sleep(120);
          }
          await g.screenshot(`label-${vp}-${renderer}-${banner ? 'banner' : 'plain'}`);
          const s = samples[samples.length - 1];
          if (!banner) plainTop = s.label.top;
          expect(s.visible, 'label not visible');
          const hits = s.keep.filter((k) => hit(s.label, k));
          expect(
            hits.length === 0,
            `label ${JSON.stringify(s.label)} overlaps ${JSON.stringify(hits)}`,
          );
          const dx = Math.abs((s.label.left + s.label.right) / 2 - s.bodyX);
          expect(
            Math.abs(s.label.bottom - s.bodyY) < 160 &&
              (dx <= 48 ||
                s.keep
                  .filter((k) => k.q !== '#hud' && k.left < s.label.right && k.right > s.label.left)
                  .every((k) => s.label.top >= k.bottom)),
            `label detached dx=${dx} body=${s.bodyX},${s.bodyY} label=${JSON.stringify(s.label)}`,
          );
          const jit = Math.max(
            ...samples.map(
              (m) => Math.abs(m.label.left - s.label.left) + Math.abs(m.label.top - s.label.top),
            ),
          );
          expect(jit < 1.5, `label jitter ${jit}px`);
          if (banner && !process.env.BEFORE) {
            // after the banner fades its rect stops counting: the label returns to its banner-free spot
            await g.eval(`new Promise((res) => { const t0 = performance.now(); const tick = () => {
              const e = document.querySelector('.area-banner-inner');
              if (!e || parseFloat(getComputedStyle(e).opacity) < 0.05 || performance.now() - t0 > 12000) res(1); else setTimeout(tick, 100); }; tick(); })`);
            await g.sleep(500);
            const f = JSON.parse(await g.eval(SAMPLE));
            expect(!f.keep.some((k) => k.q === '.area-banner-inner'), 'banner still counted');
            expect(
              !f.keep.some((k) => hit(f.label, k)),
              `after fade ${JSON.stringify(f.label)} overlaps`,
            );
            expect(
              f.label.top <= s.label.top + 0.5 &&
                (s.label.top - f.label.top > 5 || s.label.top === plainTop),
              `label after fade ${f.label.top}, with banner ${s.label.top}, plain ${plainTop}`,
            );
          }
          return `body ${Math.round(s.bodyX)},${Math.round(s.bodyY)} label ${JSON.stringify(s.label)} keep ${s.keep.map((k) => `${k.q}[${Math.round(k.left)},${Math.round(k.top)},${Math.round(k.right)},${Math.round(k.bottom)}]`).join(' ')} jitter ${jit.toFixed(2)}`;
        },
      );
    }
  }),
);
