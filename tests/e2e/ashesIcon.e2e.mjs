// Ashes icon: drop ashes next to the player (ground view) and show it in the inventory; desktop + phone shots.
// Run: node tests/e2e/ashesIcon.e2e.mjs (ports 9419-9420, E2E_PORT overrides; fast base: parallel desktop + phone
// children, ?tickMs=60, wait-on-state instead of sleeps, budget 60 s).
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9419;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

process.env.SHOTS_DIR ??= new URL('./.shots-ashes/', import.meta.url).pathname;

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  await check('a1', 'ashes in inventory and on the ground', async () => {
    await g.teleportSettled(48, 15);
    await g.setInventory(['ashes', 'logs']);
    if (
      vp === 'phone' &&
      (await g.eval(`document.querySelector('.hud').dataset.folded === 'true'`))
    ) {
      // Phone: the HUD sheet boots folded (slots 0x0); unfold it with a real tap on the chevron.
      await g.tapSelector('.sheet-fold');
      await g.waitFor(() => g.eval(`document.querySelector('.hud').dataset.folded === 'false'`), {
        label: 'sheet unfolded',
        timeoutMs: 4000,
      });
    }
    // Inventory rendered with the ashes icon loaded, and the slot no longer moving (replaces 2 fixed 300 ms sleeps).
    await g.waitFor(
      () =>
        g.eval(
          `(() => { const i = document.querySelector('[data-slot-index="0"] .slot-icon'); return !!i && i.complete && i.naturalWidth > 0; })()`,
        ),
      { label: 'ashes icon loaded', timeoutMs: 4000 },
    );
    await g.settleRect('[data-slot-index="0"]');
    await g.screenshot(`ashes-${vp}-inventory`);
    await g.tapSelector('.slot');
    const r = await g.eval(
      `(() => { const b = [...document.querySelectorAll('.menu-item')].find((e) => e.textContent.trim() === 'Drop'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
    );
    expect(r, 'no Drop menu item');
    await g.tap(r.x, r.y);
    await g
      .waitState('ground.items', `gi => gi.some((i) => i.itemId === 'ashes')`, {
        label: 'ashes on the ground',
        timeoutMs: 4000,
      })
      .catch(() => {}); // the expect below reports the ground items
    const gi = (await g.state('ground.items')).filter((i) => i.itemId === 'ashes');
    expect(gi.length === 1, 'ground ' + JSON.stringify(gi));
    await g.eval(
      `window.__idleRpg.scene().camera.scene.cameras.main.setZoom(${vp === 'phone' ? 2.6 : 2.2}), 0`,
    );
    await g.settle(); // zoomed view drawn and still (replaces a fixed 400 ms)
    await g.screenshot(`ashes-${vp}-ground`);
    return vp;
  });
});
