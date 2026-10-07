// Off-screen view culling e2e (src/render/viewCull.ts), on tests/e2e/lib.mjs. Run: node tests/e2e/cull.e2e.mjs  (E2E_PORT overrides 5212)
// Oracle: every frame (postrender), any Container whose own bounds overlap the camera worldView must be visible.
import { check, expect, forEachViewport, withGame } from './lib.mjs';

const SAMPLER = `(() => {
  const sc = window.__idleRpg.scene(); const world = sc.camera.scene; const cam = sc.camera;
  const S = (window.__cull = { frames: 0, viol: [], playerHidden: 0, minTotal: 1e9, maxVis: 0, minVis: 1e9, total: 0, vis: 0, on: true });
  world.game.events.on('postrender', () => {
    if (!S.on) return; const v = cam.worldView; if (!v || !v.width) return;
    const cs = world.children.list.filter((c) => c.type === 'Container');
    let vis = 0; S.frames++;
    for (const c of cs) {
      if (c.visible) vis++;
      const b = c.getBounds(); if (!b || (b.width === 0 && b.height === 0)) continue;
      const hit = b.right > v.x && b.left < v.right && b.bottom > v.y && b.top < v.bottom;
      if (hit && !c.visible && S.viol.length < 8) S.viol.push({ x: Math.round(c.x), y: Math.round(c.y), b: [b.left, b.top, b.right, b.bottom].map(Math.round), v: [v.x, v.y, v.right, v.bottom].map(Math.round), z: cam.zoom });
      if (hit && !c.visible) S.nviol = (S.nviol || 0) + 1;
    }
    if (!sc.playerView.container.visible) S.playerHidden++;
    S.total = cs.length; S.vis = vis; S.maxVis = Math.max(S.maxVis, vis); S.minVis = Math.min(S.minVis, vis);
  });
})()`;
const SNAP = `(() => { const s = window.__cull; return { frames: s.frames, nviol: s.nviol || 0, viol: s.viol, playerHidden: s.playerHidden, total: s.total, vis: s.vis }; })()`;
const RESET = `(() => { const s = window.__cull; s.frames = 0; s.nviol = 0; s.viol = []; s.playerHidden = 0; })()`;

const port = 5212;
await withGame(
  { port },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    // forest centre = tree with most trees within 10 tiles
    const targets = await g.targets();
    const trees = targets.filter((t) => t.kind.includes('tree'));
    let best = trees[0],
      bn = -1;
    for (const t of trees) {
      const n = trees.filter((o) => Math.abs(o.x - t.x) + Math.abs(o.y - t.y) <= 10).length;
      if (n > bn) {
        bn = n;
        best = t;
      }
    }
    await g.setInventory(['bronze_axe']);
    await g.teleport(best.x, best.y + 2, { settleMs: 1200 });
    await g.eval(SAMPLER);
    const snap = () => g.eval(SNAP);
    const noViol = async (label) => {
      const s = await snap();
      expect(s.frames > 20, `${label}: only ${s.frames} frames sampled`);
      expect(
        s.nviol === 0 && s.playerHidden === 0,
        () =>
          `${label}: ${s.nviol} pop-in frames-views, player hidden ${s.playerHidden} frames; ${JSON.stringify(s.viol.slice(0, 3))}`,
      );
      return `${s.frames} frames, 0 violations, ${bn} trees in forest cluster`;
    };

    await check(
      'c1',
      'walking across the forest: no visible-region view is culled; player always visible',
      async () => {
        await g.eval(RESET);
        const pos = await g.state('movement.position');
        const stop = await g.trackMoves();
        await g.walkTo(pos.x + 8, pos.y + 8);
        await g.sleep(2500);
        const moves = await stop();
        expect(moves.length > 4, `player barely moved: ${moves.length} tiles`);
        return (await noViol('walk')) + `; moved ${moves.length} tiles`;
      },
    );

    await check('c2', 'drag-panning in 4 directions: no pop-in', async () => {
      await g.eval(RESET);
      const cx = vp === 'phone' ? 195 : 640,
        cy = vp === 'phone' ? 420 : 400,
        d = vp === 'phone' ? 150 : 350;
      for (const [dx, dy] of [
        [d, 0],
        [-d, 0],
        [0, d],
        [0, -d],
        [d, d],
        [-d, -d],
        [-d, d],
        [d, -d],
      ]) {
        await g.drag(cx, cy, cx + dx, cy + dy, 12);
      }
      return noViol('pan');
    });

    await check(
      'c3',
      'zoom to both limits: no pop-in, culling still happens when zoomed out',
      async () => {
        await g.eval(RESET);
        const cx = vp === 'phone' ? 195 : 640,
          cy = vp === 'phone' ? 420 : 400;
        const zooms = [];
        for (let i = 0; i < 14; i++) {
          await g.wheel(cx, cy, -300);
        }
        zooms.push(await g.eval('window.__idleRpg.scene().camera.zoom'));
        await g.sleep(300);
        for (let i = 0; i < 40; i++) {
          await g.wheel(cx, cy, 300);
        }
        zooms.push(await g.eval('window.__idleRpg.scene().camera.zoom'));
        await g.sleep(300);
        for (const [dx, dy] of [
          [100, 60],
          [-200, -120],
        ])
          await g.drag(cx, cy, cx + dx, cy + dy, 10);
        expect(zooms[0] > zooms[1], `zoom did not change: ${zooms}`);
        return (
          (await noViol('zoom')) + `; zoom in ${zooms[0].toFixed(2)} out ${zooms[1].toFixed(2)}`
        );
      },
    );

    await check('c4', 'off-screen views are invisible (visible << total)', async () => {
      // zoom back to 1-ish via wheel in, then stay
      const cx = vp === 'phone' ? 195 : 640,
        cy = vp === 'phone' ? 420 : 400;
      for (let i = 0; i < 40; i++) await g.wheel(cx, cy, 300);
      for (let i = 0; i < 6; i++) await g.wheel(cx, cy, -150);
      await g.sleep(400);
      const s = await snap();
      const z = await g.eval('window.__idleRpg.scene().camera.zoom');
      expect(
        s.total > 60 && s.vis < s.total * 0.5,
        `visible ${s.vis} of ${s.total} containers at zoom ${z}`,
      );
      return `zoom ${z.toFixed(2)}: ${s.vis} visible of ${s.total} containers`;
    });

    await check('c5', 'tap a tree at the right / top screen edge still chops', async () => {
      const cr = await g.eval(
        '(() => { const r = document.querySelector("canvas").getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()',
      );
      const W = cr.w,
        H = cr.h;
      const cands = trees.filter(
        (t) => t.kind === 'tree' && Math.abs(t.x - best.x) + Math.abs(t.y - best.y) <= 6,
      );
      const res = [];
      for (const edge of ['right', 'top']) {
        let done = false;
        for (const t of cands) {
          await g.setInventory(['bronze_axe']);
          await g.teleport(t.x, t.y + 2, { settleMs: 500 });
          await g.eval('window.__idleRpg.scene().camera.stopFollow(), 0');
          const wp = await g.eval(
            `(async () => { const { isoProjection } = await import('/src/render/projection.ts'); const w = isoProjection.tileToWorld(${t.x}, ${t.y}); return w; })()`,
          );
          // put the tap point (mid-height) 5 px inside the edge
          const tx = edge === 'right' ? W - 5 : W / 2;
          const ty = edge === 'right' ? H / 2 : 5;
          const my = wp.y - t.up / 2;
          await g.eval(`(() => { const c = window.__idleRpg.scene().camera; const k = c.zoom;
            c.setScroll(${wp.x} - (${tx} / ${W}) * c.width / k - (c.width - c.width / k) / 2, ${my} - (${ty} / ${H}) * c.height / k - (c.height - c.height / k) / 2); })()`);
          await g.sleep(300);
          const p = await g.tileClient(t.x, t.y, -t.up / 2);
          if (!(await g.page(`topIsCanvas(${p.x}, ${p.y})`))) continue; // HUD overlay here: try another tree
          const near = edge === 'right' ? cr.l + W - p.x : p.y - cr.t;
          if (!(near > 0 && near < 45)) {
            res.push(`skip ${t.id} near=${Math.round(near)}`);
            continue;
          }
          const before = await g.chatCount('log');
          await g.tap(p.x, p.y);
          const ok = await g
            .waitFor(async () => (await g.chatCount('log')) > before, {
              timeoutMs: 6000,
              label: 'log',
            })
            .then(
              () => true,
              () => false,
            );
          res.push(
            `${edge}: tree ${t.id} tapped at ${Math.round(p.x)},${Math.round(p.y)} (${W}x${H}) -> ${ok ? 'chopped' : 'NO LOG'}`,
          );
          expect(ok, () => res.join(' | '));
          done = true;
          break;
        }
        expect(done, `no tappable ${edge}-edge tree found; ${res.join(' | ')}`);
      }
      return res.join(' | ');
    });
  }),
);
