// Fishing-stop overhead flash e2e: fishingStopped blocks flash the same red text as locked trees/rocks.
// Run: node tests/e2e/fishFlash.e2e.mjs   (shots in tests/e2e/.shots-fishflash)
// Fast base: desktop + phone as parallel children (webgl: the checks read the flash Text objects' text/colour/size,
// the shots are evidence), ?tickMs=60, setInventory/setLevels/teleport preconditions, "previous flash faded" and the
// negative spotMoved case wait on the scene (no fixed 2.5 s / 500 ms sleeps), budget 60 s.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9326; // C7 port block 9301-9350; 2 combos use 9326-9327
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});
const SHOTS = resolve(dirname(fileURLToPath(import.meta.url)), '.shots-fishflash');
const NET = { id: 'shore_net_1', x: 56, y: 51 };
const BAIT = { id: 'shore_bait_1', x: 48, y: 51 };
const IRON = { id: 'quarry_iron_1', x: 77, y: 45 };

const SPY = `(() => { const sc = window.__idleRpg.scene().camera.scene; if (window.__spyOn) { window.__flash = []; return 1; }
  window.__spyOn = true; window.__flash = []; const v = sc.vfx; const orig = v.handleEvent.bind(v);
  v.handleEvent = (e, c) => { const r = orig(e, c); const texts = sc.children.list.filter((o) => o.type === 'Text' && o.visible && o.alpha > 0 && /needed|No |full|too low/.test(o.text)).map((o) => ({ t: o.text, color: o.style.color, px: o.style.fontSize }));
    window.__flash.push({ type: e.type, reason: e.reason, texts }); return r; }; return 2; })()`;
const flashes = (g) => g.eval('JSON.stringify(window.__flash)').then(JSON.parse);
// Visible blocked-action texts in the scene right now (same filter as the spy).
const FLASH_TEXTS = `window.__idleRpg.scene().camera.scene.children.list.filter((o) => o.type === 'Text' && o.visible && o.alpha > 0 && /needed|No |full|too low/.test(o.text)).length`;
const raf = (g, n = 2) =>
  g.eval(
    `new Promise((r) => { let k = ${n}; const f = () => (--k <= 0 ? r(0) : requestAnimationFrame(f)); requestAnimationFrame(f); })`,
  );
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
  // was a fixed 2.5 s: wait until this flash has faded, so the next check's spy can't see the old text
  await g.waitFor(async () => (await g.eval(FLASH_TEXTS)) === 0, {
    label: `${name} flash faded`,
    timeoutMs: 8000,
  });
  return l;
}

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  g.vpn = vp;
  let rockLabel;
  await check('f0', 'Mining 1 iron rock: red "Level N needed" (reference style)', async () => {
    await g.setInventory(['bronze_pickaxe']);
    await g.setLevels({ mining: 1 });
    await g.teleportSettled(IRON.x, IRON.y + 3); // real tap on the rock: camera must be on the player
    rockLabel = await flashOf(g, 'rock', () => tapAt(g, IRON, -12));
    expect(/needed/.test(rockLabel.t), JSON.stringify(rockLabel));
    return `${vp}: ${JSON.stringify(rockLabel)}`;
  });
  await check('f1', 'Fishing 1 bait spot: "Level 5 needed", same style as rock', async () => {
    await g.setInventory(['fishing_rod', 'fishing_bait']);
    await g.setLevels({ fishing: 1 });
    await g.teleportSettled(BAIT.x, BAIT.y + 2); // settled so the evidence shot clips the player
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
    await g.teleportSettled(NET.x, NET.y + 2);
    const l = await flashOf(g, 'nonet', () => intent(g, NET));
    expect(l.t === 'No net', JSON.stringify(l));
    return `${vp}: ${l.t}`;
  });
  await check('f3', 'Fishing 5, rod, 0 bait: "No bait"', async () => {
    await g.setInventory(['fishing_rod']);
    await g.setLevels({ fishing: 5 });
    await g.teleportSettled(BAIT.x, BAIT.y + 2);
    const l = await flashOf(g, 'nobait', () => intent(g, BAIT));
    expect(l.t === 'No bait', JSON.stringify(l));
    return `${vp}: ${l.t}`;
  });
  await check('f4', 'Full inventory while fishing: "Inventory full" (as rocks)', async () => {
    await g.setInventory(['small_fishing_net', ...Array(27).fill('logs')]);
    await g.setLevels({ fishing: 5 });
    await g.teleportSettled(NET.x, NET.y + 2);
    const l = await flashOf(g, 'full', () => intent(g, NET));
    expect(l.t === 'Inventory full', JSON.stringify(l));
    return `${vp}: ${l.t}`;
  });
  await check('f5', 'spotMoved: no flash', async () => {
    await g.eval(SPY);
    await g.eval(
      `window.__idleRpg.scene().camera.scene.onTickEvents([{ type: 'spotMoved', spotId: ${JSON.stringify(NET.id)}, to: 1 }]); 0`,
    );
    await raf(g, 3); // negative case: the spy records synchronously; give a few frames for any late text
    const fl = await flashes(g);
    expect(
      fl.length >= 1 && fl.every((f) => f.type === 'spotMoved') && labels(fl).length === 0,
      JSON.stringify(fl),
    );
    return `${vp}: handled ${fl.length} spotMoved event(s), ${labels(fl).length} texts`;
  });
  // old f6 "no console errors" is lib's built-in 'console' check (runs after every combo)
});
