// Fishing-stop overhead flash e2e: fishingStopped blocks flash the same red text as locked trees/rocks.
// Run: node tests/e2e/fishFlash.e2e.mjs   (port 5255, E2E_PORT overrides; shots in tests/e2e/.shots-fishflash)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { check, expect, forEachViewport, withGame } from './lib.mjs';

const SHOTS = resolve(dirname(fileURLToPath(import.meta.url)), '.shots-fishflash');
const port = Number(process.env.E2E_PORT ?? 5255);
const NET = { id: 'shore_net_1', x: 56, y: 51 };
const BAIT = { id: 'shore_bait_1', x: 48, y: 51 };
const IRON = { id: 'quarry_iron_1', x: 77, y: 45 };

const SPY = `(() => { const sc = window.__idleRpg.scene().camera.scene; if (window.__spyOn) { window.__flash = []; return 1; }
  window.__spyOn = true; window.__flash = []; const v = sc.vfx; const orig = v.handleEvent.bind(v);
  v.handleEvent = (e, c) => { const r = orig(e, c); const texts = sc.children.list.filter((o) => o.type === 'Text' && o.visible && o.alpha > 0 && /needed|No |full|too low/.test(o.text)).map((o) => ({ t: o.text, color: o.style.color, px: o.style.fontSize }));
    window.__flash.push({ type: e.type, reason: e.reason, texts }); return r; }; return 2; })()`;
const flashes = (g) => g.eval('JSON.stringify(window.__flash)').then(JSON.parse);
const labels = (fl) => fl.flatMap((f) => f.texts);
async function shot(g, name) {
  const p = await g.eval(
    '(() => { const pv = window.__idleRpg.scene().playerView.container; return window.__e.toClient(pv.x, pv.y); })()',
  );
  const { data } = await g.cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: {
      x: Math.max(0, p.x - 80),
      y: Math.max(0, p.y - 110),
      width: 160,
      height: 140,
      scale: 3,
    },
  });
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(resolve(SHOTS, `${g.vpn}-${name}.png`), Buffer.from(data, 'base64'));
}
async function tapAt(g, t, dy) {
  const p = await g.tileClient(t.x, t.y, dy);
  expect(await g.page(`topIsCanvas(${p.x}, ${p.y})`), `${t.id} covered at ${p.x},${p.y}`);
  await g.tap(p.x, p.y);
}
/** Start fishing via the store intent (no pixel tap): the spot's id, walking from the teleport tile. */
async function intent(g, t) {
  await g.eval(`window.__idleRpg.store.getState().interactSpot(${JSON.stringify(t.id)}); 0`);
}
/** Reset spy, run `act`, wait for a blocked text, shoot it, return the label/colour. */
async function flashOf(g, name, act) {
  await g.eval(SPY);
  await act();
  await g.waitFor(async () => labels(await flashes(g)).length > 0, {
    label: `${name} flash`,
    timeoutMs: 20000,
  });
  await shot(g, name);
  const fl = await flashes(g);
  process.stdout.write(
    `  [${g.vpn}:${name}] events seen: ${fl.map((f) => f.type + ':' + (f.reason ?? '')).join(',')}\n`,
  );
  const l = labels(fl)[0];
  await g.eval('window.__idleRpg.store.getState().cancelAction?.()').catch(() => {});
  await g.sleep(2500);
  return l;
}

await withGame(
  { port },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    g.vpn = vp;
    let rockLabel;
    await check('f0', 'Mining 1 iron rock: red "Level N needed" (reference style)', async () => {
      await g.setInventory(['bronze_pickaxe']);
      await g.setLevel('mining', 1);
      await g.teleport(IRON.x, IRON.y + 3);
      rockLabel = await flashOf(g, 'rock', () => tapAt(g, IRON, -12));
      expect(/needed/.test(rockLabel.t), JSON.stringify(rockLabel));
      return `${vp}: ${JSON.stringify(rockLabel)}`;
    });
    await check('f1', 'Fishing 1 bait spot: "Level 5 needed", same style as rock', async () => {
      await g.setInventory(['fishing_rod', 'fishing_bait']);
      await g.setLevel('fishing', 1);
      await g.teleport(BAIT.x, BAIT.y + 2);
      const l = await flashOf(g, 'level', () => intent(g, BAIT));
      expect(l.t === 'Level 5 needed', JSON.stringify(l));
      expect(
        l.color === rockLabel.color && l.px === rockLabel.px,
        `style ${JSON.stringify(l)} vs ${JSON.stringify(rockLabel)}`,
      );
      return `${vp}: ${JSON.stringify(l)}`;
    });
    await check('f2', 'No net: "No net"', async () => {
      await g.setInventory([]);
      await g.teleport(NET.x, NET.y + 2);
      const l = await flashOf(g, 'nonet', () => intent(g, NET));
      expect(l.t === 'No net', JSON.stringify(l));
      return `${vp}: ${l.t}`;
    });
    await check('f3', 'Fishing 5, rod, 0 bait: "No bait"', async () => {
      await g.setInventory(['fishing_rod']);
      await g.setLevel('fishing', 5);
      await g.teleport(BAIT.x, BAIT.y + 2);
      const l = await flashOf(g, 'nobait', () => intent(g, BAIT));
      expect(l.t === 'No bait', JSON.stringify(l));
      return `${vp}: ${l.t}`;
    });
    await check('f4', 'Full inventory while fishing: "Inventory full" (as rocks)', async () => {
      await g.setInventory(['small_fishing_net', ...Array(27).fill('logs')]);
      await g.setLevel('fishing', 5);
      await g.teleport(NET.x, NET.y + 2);
      const l = await flashOf(g, 'full', () => intent(g, NET));
      expect(l.t === 'Inventory full', JSON.stringify(l));
      return `${vp}: ${l.t}`;
    });
    await check('f5', 'spotMoved: no flash', async () => {
      await g.eval(SPY);
      await g.eval(
        `window.__idleRpg.scene().camera.scene.onTickEvents([{ type: 'spotMoved', spotId: ${JSON.stringify(NET.id)}, to: 1 }]); 0`,
      );
      await g.sleep(500);
      const fl = await flashes(g);
      expect(
        fl.length >= 1 && fl.every((f) => f.type === 'spotMoved') && labels(fl).length === 0,
        JSON.stringify(fl),
      );
      return `${vp}: handled ${fl.length} spotMoved event(s), ${labels(fl).length} texts`;
    });
    await check('f6', 'no console errors', async () => {
      const e = g.consoleErrors();
      expect(e.length === 0, e.join(' | '));
      return `${vp}: 0 errors`;
    });
  }),
);
