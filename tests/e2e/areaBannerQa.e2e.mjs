// QA independent check of the area banner: no overlap with player/minimap/orbs/tabs/sheet/chat, readable, fades.
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';
const PORT = Number(process.env.E2E_PORT || 6850);
const BUDGET_MS = 90e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone', 'landscape'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});
const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp) => {
    for (const zoom of vp === 'landscape' ? [1, 1.6] : [1, 2.5]) {
      await check(`q-${zoom}`, `${vp} z${zoom}`, async () => {
        await g.eval(`window.__idleRpg.scene().camera.scene.cameras.main.setZoom(${zoom}); 0`);
        await g.settle();
        await g.eval(`window.__idleRpg.store.getState().showAreaBanner('Whispering Wood')`);
        await g.sleep(700);
        const m = JSON.parse(
          await g.eval(`(() => {
        const R = (e) => { const r = e.getBoundingClientRect(); return r.width * r.height ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null; };
        const sc = window.__idleRpg.scene(); const pv = sc.playerView.container;
        const np = pv.list.find((k) => k.type === 'Text').getBounds();
        const a = window.__e.toClient(Math.min(np.left, pv.x - 12), np.top), c = window.__e.toClient(Math.max(np.right, pv.x + 12), pv.y);
        const t = document.querySelector('.area-banner-title');
        const others = {};
        for (const sel of ['.topright','.minimap','.hud','.tabs','.sheet-fold','.chat-toggle','.chat-peek','.chatbox','.hud-show','.orb','.dialogue'])
          document.querySelectorAll(sel).forEach((e, i) => { const r = R(e); if (r) others[sel + i] = r; });
        const cs = getComputedStyle(t);
        const rng = document.createRange(); rng.selectNodeContents(t);
        return JSON.stringify({ title: R(t), text: R(document.querySelector('.area-banner-inner')), textRange: rng.getBoundingClientRect().toJSON(),
          fs: cs.fontSize, scrollW: t.scrollWidth, clientW: t.clientWidth, player: { left: a.x, top: a.y, right: c.x, bottom: c.y },
          others, vw: innerWidth, vh: innerHeight, op: getComputedStyle(document.querySelector('.area-banner-inner')).opacity });
      })()`),
        );
        await g.screenshot(`bq-${vp}-z${zoom}`);
        const rect = m.text,
          w = JSON.stringify({ rect, player: m.player, fs: m.fs });
        expect(rect, 'no banner');
        expect(!hit(rect, m.player), 'covers player ' + w);
        for (const [k, r] of Object.entries(m.others)) {
          if (k.startsWith('.hud') && !k.startsWith('.hud-show')) {
            /* .hud container: only the tabs+sheet matter, checked via children; check it too */
          }
          expect(!hit(rect, r), `overlaps ${k} ${JSON.stringify(r)} ${w}`);
        }
        expect(
          m.textRange.left >= 0 && m.textRange.right <= m.vw && m.textRange.top >= 0,
          'clipped ' + w,
        );
        expect(m.scrollW <= m.clientW + 1, `text overflow ${m.scrollW}>${m.clientW}`);
        expect(parseFloat(m.fs) >= 18, 'font too small ' + m.fs);
        expect(Number(m.op) > 0.9, 'not faded in ' + m.op);
        return `${vp} z${zoom} banner x${Math.round(rect.left)}-${Math.round(rect.right)} y${Math.round(rect.top)}-${Math.round(rect.bottom)} player y${Math.round(m.player.top)}-${Math.round(m.player.bottom)} fs ${m.fs} checked ${Object.keys(m.others).join(',')}`;
      });
    }
    await check('fade', `${vp} fade in then out then gone`, async () => {
      const s = await g.eval(`new Promise((res) => { const out = []; const t0 = performance.now();
      window.__idleRpg.store.getState().showAreaBanner('Fade Test');
      const tick = () => { const e = document.querySelector('.area-banner-inner'); const fresh = e && e.textContent.includes('Fade Test'); if (fresh || out.length) out.push([Math.round(performance.now() - t0), fresh ? +getComputedStyle(e).opacity : null]);
        if (performance.now() - t0 > 7000) res(JSON.stringify(out)); else requestAnimationFrame(tick); }; tick(); })`);
      const o = JSON.parse(s);
      const first = o[0][1],
        max = Math.max(...o.map((x) => x[1] ?? 0)),
        last = o[o.length - 1][1];
      expect(first === null || first < 0.5, 'starts visible ' + first);
      expect(max > 0.95, 'never fully visible ' + max);
      expect(last === null || last < 0.05, 'did not fade out ' + last);
      return `first ${first} max ${max} last ${last}`;
    });
  }),
);
