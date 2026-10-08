// Area banner placement: the banner must never cover the player, the minimap or the orbs.
// Run: node tests/e2e/areaBannerPlacement.e2e.mjs   (SHOTS_DIR=<dir> saves screenshots)
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = 6800;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone', 'landscape'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});
const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp) => {
    // landscape is only 390 px tall: at 2.5x the head itself reaches the top edge, so it checks 1.6x
    for (const zoom of vp === 'landscape' ? [1, 1.6] : [1, 2.5]) {
      await check(
        `b-${zoom}`,
        `${vp} zoom ${zoom}: banner clear of player, minimap, orbs, inside view`,
        async () => {
          await g.eval(
            `(() => { const sc = window.__idleRpg.scene(); sc.camera.scene.cameras.main.setZoom(${zoom}); })()`,
          );
          await g.settle();
          await g.eval(`window.__idleRpg.store.getState().showAreaBanner('Whispering Wood')`);
          await g.sleep(700); // past fade-in
          const m = JSON.parse(
            await g.eval(`(() => {
            const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
            const sc = window.__idleRpg.scene(); const pv = sc.playerView.container;
            // the character = nameplate top (just above the head) down to the feet point; width = nameplate/rig width
            const np = pv.list.find((k) => k.type === 'Text').getBounds();
            const b = { left: Math.min(np.left, pv.x - 12), top: np.top, right: Math.max(np.right, pv.x + 12), bottom: pv.y };
            const a = window.__e.toClient(b.left, b.top), c = window.__e.toClient(b.right, b.bottom);
            const inner = document.querySelector('.area-banner-inner');
            const t = document.querySelector('.area-banner-title');
            return JSON.stringify({
              banner: R(inner), title: R(t), player: { left: a.x, top: a.y, right: c.x, bottom: c.y },
              topright: R(document.querySelector('.topright')), minimap: R(document.querySelector('.minimap')),
              orbs: [...document.querySelectorAll('.orb, .orbs > *')].map(R),
              vw: innerWidth, vh: innerHeight, opacity: inner ? getComputedStyle(inner).opacity : null,
            });
          })()`),
          );
          await g.screenshot(`banner-${vp}-z${zoom}`);
          expect(m.banner && m.title, 'banner not rendered');
          const where = JSON.stringify(m);
          expect(!hit(m.banner, m.player), `banner covers player ${where}`);
          if (m.topright)
            expect(!hit(m.banner, m.topright), `banner overlaps minimap cluster ${where}`);
          for (const o of m.orbs) if (o) expect(!hit(m.banner, o), `banner overlaps orb ${where}`);
          expect(m.title.left >= 0 && m.title.right <= m.vw, `banner clipped ${where}`);
          return `${vp} z${zoom} banner ${Math.round(m.banner.top)}-${Math.round(m.banner.bottom)} x${Math.round(m.banner.left)}-${Math.round(m.banner.right)} player ${Math.round(m.player.top)}-${Math.round(m.player.bottom)} topright ${m.topright && Math.round(m.topright.bottom)}`;
        },
      );
    }
  }),
);
