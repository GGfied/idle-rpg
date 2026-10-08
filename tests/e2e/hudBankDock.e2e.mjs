// hud: docked inventory is hidden on phone while bank overlay is open. Port 5198, SHOTS_DIR optional.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { check, expect, forEachViewport, withGame } from './lib.mjs';

const set = (g, open) =>
  g.eval(`(() => { const st = window.__idleRpg.store; const s = st.getState().game;
    st.setState({ game: { ...s, bankOpen: ${open}, bankMode: 'full' } }); })()`);
const dock = (g) =>
  g.eval(`(() => { const e = document.querySelector('.hud'); const b = document.querySelector('.bank-overlay');
    return { dockShown: !!e && getComputedStyle(e).display !== 'none', overlay: !!b }; })()`);

withGame(
  { port: 5198 },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    await check(`dock-${vp}`, `dock visibility ${vp}`, async () => {
      await set(g, false);
      expect((await dock(g)).dockShown, 'dock hidden with bank closed');
      await set(g, true);
      await new Promise((r) => setTimeout(r, 300));
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
  }),
);
