// Camera inset e2e (P3 #31): phone camera scrolls past south/right edge so shore spots clear the HUD.
// Run: node tests/e2e/cameraInset.e2e.mjs  (port 5263, E2E_PORT overrides)
import { check, expect, forEachViewport, withGame } from './lib.mjs';
const port = Number(process.env.E2E_PORT ?? 5263);
const SAMPLER = `(() => { const sc = window.__idleRpg.scene(); const cam = sc.camera.scene.cameras.main; const pv = sc.playerView.container;
  window.__cs = { last: null, maxJump: 0, maxPy: 0, minPy: 1e9, minPx: 1e9, maxPx: 0, off: 0, n: 0 };
  const f = () => { const s = window.__cs; const c = window.__e.toClient(pv.x, pv.y); const cur = { x: cam.scrollX, y: cam.scrollY };
    if (s.last) s.maxJump = Math.max(s.maxJump, Math.hypot(cur.x - s.last.x, cur.y - s.last.y));
    s.last = cur; s.n++; s.maxPy = Math.max(s.maxPy, c.y); s.minPy = Math.min(s.minPy, c.y); s.minPx = Math.min(s.minPx, c.x); s.maxPx = Math.max(s.maxPx, c.x);
    if (!window.__e.topIsCanvas(c.x, c.y - 20)) s.off++; requestAnimationFrame(f); }; requestAnimationFrame(f); return 1; })()`;
await withGame(
  { port },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    let spot;
    await check(
      'c1',
      'south shore spot (54,51) above HUD, canvas on top, tap starts fishing',
      async () => {
        await g.setInventory(['fishing_rod', 'fishing_bait', 'small_fishing_net']);
        await g.setLevel('fishing', 10);
        const cur = async () =>
          JSON.parse(
            await g.eval(
              `(async () => { const { CONTENT } = await import('/src/app/registry.ts'); const { spotTile } = await import('/src/app/game/fishingSpots.ts'); const sp = CONTENT.fishingSpots.get('shore_bait_1'); const t = spotTile(sp, window.__e.game().fishing); return JSON.stringify({ id: sp.spotId, x: t.x, y: t.y }); })()`,
            ),
          );
        await g.teleport(54, 53);
        await g.sleep(2500);
        const t54 = await g.tileClient(54, 51, 0);
        const top54 = await g.page(`topIsCanvas(${t54.x}, ${t54.y})`);
        expect(top54, `tile 54,51 at ${Math.round(t54.x)},${Math.round(t54.y)} not canvas-topmost`);
        spot = await cur();
        await g.teleport(spot.x, spot.y + 2);
        await g.sleep(2500);
        spot = await cur();
        const p = await g.tileClient(spot.x, spot.y, 0);
        const info = await g.eval(
          `(() => { const c = document.querySelector('canvas:not(.minimap)').getBoundingClientRect(); const cam = window.__idleRpg.scene().camera.scene.cameras.main; const b = cam.getBounds ? cam.getBounds() : cam._bounds; return JSON.stringify({ canvasBottom: c.bottom, innerH: innerHeight, boundsH: b.height, zoom: cam.zoom, hudTop: Math.min(...[...document.querySelectorAll('.hud, .chat, .hud-body')].map((e) => e.getBoundingClientRect().top)) }); })()`,
        );
        const top = await g.page(`topIsCanvas(${p.x}, ${p.y})`);
        expect(
          top,
          `spot ${spot.id} at ${Math.round(p.x)},${Math.round(p.y)} not canvas-topmost; ${info}`,
        );
        await g.tap(p.x, p.y);
        await g.waitFor(async () => (await g.state('fishing.session')) != null, {
          label: 'fishing started',
          timeoutMs: 15000,
        });
        return `${vp}: tile54,51 client ${Math.round(t54.x)},${Math.round(t54.y)}; ${spot.id} client ${Math.round(p.x)},${Math.round(p.y)} ${info}`;
      },
    );
    await check('c2', 'camera inset: desktop 0, phone > 0 bottom', async () => {
      const r = await g.eval(
        `(() => { const cam = window.__idleRpg.scene().camera.scene.cameras.main; const b = cam.getBounds(); return JSON.stringify({ h: b.height, w: b.width, zoom: cam.zoom }); })()`,
      );
      globalThis.__bounds ??= {};
      globalThis.__bounds[vp] = JSON.parse(r);
      return `${vp}: bounds ${r}`;
    });
    await check('c3', 'follow stability walking 6+ tiles near south edge', async () => {
      await g.eval('window.__idleRpg.store.getState().cancelAction?.(); 0');
      spot = { x: 54, y: 51 };
      await g.teleport(spot.x - 7, spot.y + 1);
      await g.sleep(2500);
      await g.eval(SAMPLER);
      const start = await g.state('movement.position');
      await g.eval(`window.__idleRpg.store.getState().walkTo({ x: ${spot.x}, y: ${spot.y + 1} })`);
      await g.waitFor(
        async () => {
          const p = await g.state('movement.position');
          return p.x === spot.x && p.y === spot.y + 1;
        },
        { label: 'arrive', timeoutMs: 20000 },
      );
      await g.sleep(1500);
      const s = JSON.parse(await g.eval('JSON.stringify(window.__cs)'));
      const jumpLimit = 32; // world px: one tile (iso tile height 32)
      expect(s.maxJump <= jumpLimit && s.off === 0 && s.n > 20, `stats ${JSON.stringify(s)}`);
      return `${vp}: walked ${JSON.stringify(start)}->${spot.x},${spot.y + 1}; ${JSON.stringify(s)}`;
    });
    await check('c4', '0 console errors', async () => {
      expect(g.consoleErrors().length === 0, g.consoleErrors().join(' | '));
      return `${vp}: 0 errors`;
    });
  }),
);
