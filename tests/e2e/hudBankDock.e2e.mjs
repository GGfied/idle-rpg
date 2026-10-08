// hud: docked inventory is hidden on phone while bank overlay is open. SHOTS_DIR optional.
// Fast base: runParallel desktop + phone (HUD DOM: webgl only), wait for the overlay + 2 frames instead of a fixed
// 300 ms sleep, budget 60 s. Run: node tests/e2e/hudBankDock.e2e.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9479; // combos use 9479..9480
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const set = (g, open) =>
  g.eval(`(() => { const st = window.__idleRpg.store; const s = st.getState().game;
    st.setState({ game: { ...s, bankOpen: ${open}, bankMode: 'full' } }); })()`);
const dock = (g) =>
  g.eval(`(() => { const e = document.querySelector('.hud'); const b = document.querySelector('.bank-overlay');
    return { dockShown: !!e && getComputedStyle(e).display !== 'none', overlay: !!b }; })()`);

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  await check(`dock-${vp}`, `dock visibility ${vp}`, async () => {
    await set(g, false);
    expect((await dock(g)).dockShown, 'dock hidden with bank closed');
    await set(g, true);
    // wait for the overlay to mount, then 2 frames so the dock's styles reflect it (mirrors the positive case)
    await g
      .waitFor(() => g.eval(`!!document.querySelector('.bank-overlay')`), {
        label: 'bank overlay',
        timeoutMs: 3000,
      })
      .catch(() => {});
    await g.eval(
      'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))',
    );
    const d = await dock(g);
    expect(d.overlay, 'overlay open');
    expect(d.dockShown === (vp === 'desktop'), `dockShown=${d.dockShown} on ${vp}`);
    const dir = process.env.SHOTS_DIR;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      const { data } = await g.cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(resolve(dir, `bankDock-${vp}.png`), Buffer.from(data, 'base64'));
    }
    await set(g, false);
  });
});
