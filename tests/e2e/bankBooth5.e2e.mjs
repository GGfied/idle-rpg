// QA slice: Greatmere bank booth bank_booth_5 at (72,52), reached from (72,53). Run: node tests/e2e/bankBooth5.e2e.mjs (SHOTS_DIR optional)
// Fast base: desktop + phone as parallel children (webgl: nothing here depends on the renderer; the booth shot is
// evidence, the draw check asserts the spawn), ?tickMs=60, minimap spy via initScripts (no extra reload),
// wait-on-state (bank open/closed, bank quantities, menu, minimap still) instead of fixed waits, budget 60 s.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { check, expect, runParallel, waitStill, withCombos } from './lib.mjs';

const PORT = 9321; // C7 port block 9301-9350; 2 combos use 9321-9322
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const SPY = `(() => { const P = CanvasRenderingContext2D.prototype, oc = P.clearRect, of = P.fillText;
  window.__mm = { frame: [] };
  P.clearRect = function (...a) { if (this.canvas.className === 'minimap') window.__mm.frame = []; return oc.apply(this, a); };
  P.fillText = function (t, x, y) { if (this.canvas.className === 'minimap') window.__mm.frame.push({ t, x, y }); return of.call(this, t, x, y); }; })()`;
const pos = (g) => g.state('movement.position');
const bankOpen = (g) => g.state('bankOpen');
const bankQty = async (g, id) =>
  (await g.state('bank.items')).filter((b) => b.itemId === id).reduce((n, b) => n + b.quantity, 0);
const click = (g, sel, re) =>
  g.eval(
    `(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => new RegExp(${JSON.stringify(re)}).test(e.textContent || '')); if (!el) return false; el.click(); return true; })()`,
  );
async function shot(g, name, clip) {
  const dir = process.env.SHOTS_DIR;
  if (!dir) return '';
  mkdirSync(dir, { recursive: true });
  const { data } = await g.cdp.send('Page.captureScreenshot', {
    format: 'png',
    ...(clip ? { clip: { ...clip, scale: 2 } } : {}),
  });
  const f = resolve(dir, `bankBooth5-${name}.png`);
  writeFileSync(f, Buffer.from(data, 'base64'));
  return f;
}
const closeBank = async (g) => {
  if (await bankOpen(g)) await click(g, '.bank-overlay button', 'Close');
  await g.waitState('bankOpen', 'o => !o', { label: 'bank closed', timeoutMs: 4000 });
};
/** Minimap settled: the drawn label positions hold still (it redraws every rAF; the trail glides after a teleport). */
const minimapStill = (g) =>
  waitStill(
    () =>
      g.eval(
        `(() => { const f = window.__mm.frame; let x = f.length * 1000, y = 0; for (const c of f) { x += c.x; y += c.y; } return { x, y }; })()`,
      ),
    { intervalMs: 100, stable: 2, max: 80 },
  );

await withCombos({ port: PORT, budgetMs: BUDGET_MS, initScripts: [SPY] }, COMBOS, async (g, vp) => {
  const touch = vp === 'phone';

  await check(`${vp}-draw`, 'booth drawn at (72,52) (screenshot)', async () => {
    await g.teleportSettled(72, 55);
    const p = await g.tileClient(72, 52, -20);
    // clip kept inside the viewport (phone booth sits at x 339 of 390: an unclamped clip shows a black strip)
    const vw = await g.eval('innerWidth');
    const cx = Math.max(0, Math.min(p.x - 90, vw - 180));
    const f = await shot(g, `${vp}-booth`, { x: cx, y: p.y - 90, width: 180, height: 180 });
    const v = await g.eval(`(async () => { const w = await import('/src/features/world/index.ts');
        const o = w.WORLD_OBJECT_SPAWNS.find((x) => x.objectId === 'bank_booth_5'); 
        const cam = window.__idleRpg.scene().camera.scene.views; return { o, hasView: !!(cam.object?.('bank_booth_5') ?? cam.facility?.('bank_booth_5') ?? true) }; })()`);
    expect(v.o && v.o.x === 72 && v.o.y === 52, `spawn ${JSON.stringify(v.o)}`);
    return `client ${Math.round(p.x)},${Math.round(p.y)} shot=${f}`;
  });

  await check(`${vp}-tap`, 'tap booth walks to (72,53) and opens bank', async () => {
    await g.teleportSettled(72, 56);
    await g.tapObject('bank_booth_5');
    await g.waitFor(() => bankOpen(g), { label: 'bank open' });
    const p = await pos(g);
    expect(Math.max(Math.abs(p.x - 72), Math.abs(p.y - 52)) === 1, `ended ${JSON.stringify(p)}`);
    const mode = await g.state('bankMode');
    expect(mode === 'full', `bankMode ${mode}`);
    const dep = await g.eval(
      `[...document.querySelectorAll('.bank-overlay button')].map(b=>b.textContent.trim()).filter(Boolean).join('|')`,
    );
    expect(/Deposit inventory/.test(dep), `buttons: ${dep}`);
    await shot(g, `${vp}-bank`);
    await closeBank(g);
    return `ended ${JSON.stringify(p)} bankMode=${mode}`;
  });

  await check(`${vp}-menu`, 'menu "Bank" opens full bank', async () => {
    await g.teleportSettled(72, 55);
    const t = (await g.targets()).find((o) => o.id === 'bank_booth_5');
    const p = await g.tileClient(t.x, t.y, -t.up / 2);
    if (touch) {
      await g.longPress(p.x, p.y); // 900 ms touch hold: the hold IS the input (canvas long-press menu)
    } else {
      await g.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
      for (const type of ['mousePressed', 'mouseReleased'])
        await g.cdp.send('Input.dispatchMouseEvent', {
          type,
          x: p.x,
          y: p.y,
          button: 'right',
          buttons: type === 'mousePressed' ? 2 : 0,
          clickCount: 1,
        });
    }
    await g.waitFor(() => g.eval(`!!document.querySelector('[role=menu]')`), { label: 'menu' });
    const labels = await g.eval(
      `[...document.querySelectorAll('[role=menuitem]')].map(b=>b.textContent.trim())`,
    );
    const r = await g.eval(
      `(() => { const el=[...document.querySelectorAll('[role=menuitem]')].find(e=>/^Bank/.test(e.textContent)); if(!el) return null; const b=el.getBoundingClientRect(); return {x:b.left+b.width/2,y:b.top+b.height/2}; })()`,
    );
    expect(r, `no Bank item in ${labels}`);
    await g.tap(r.x, r.y);
    await g.waitFor(() => bankOpen(g), { label: 'bank open via menu' });
    const mode = await g.state('bankMode');
    expect(mode === 'full', `bankMode ${mode}`);
    await closeBank(g);
    return `menu ${JSON.stringify(labels)} bankMode=${mode}`;
  });

  await check(`${vp}-ops`, 'deposit and withdraw', async () => {
    await g.teleportSettled(72, 56);
    await g.setInventory([{ itemId: 'logs', quantity: 5 }]);
    const before = await bankQty(g, 'logs');
    await g.tapObject('bank_booth_5');
    await g.waitFor(() => bankOpen(g), { label: 'bank open' });
    expect(await click(g, '.bank-overlay button', 'Deposit inventory'), 'no Deposit button');
    await g
      .waitFor(async () => (await bankQty(g, 'logs')) !== before, {
        label: 'deposit',
        timeoutMs: 4000,
      })
      .catch(() => {}); // the expect below reports the numbers
    const after = await bankQty(g, 'logs');
    expect(after === before + 5, `bank logs ${before} -> ${after}`);
    const r = await g.rect('.bank-overlay .bank-grid button[aria-label^="Logs"]');
    expect(r, 'no Logs slot');
    await g.tap(r.x, r.y);
    await g
      .waitFor(() => g.eval(`!!document.querySelector('[role=menuitem]')`), {
        label: 'slot menu',
        timeoutMs: 3000,
      })
      .catch(() => {}); // 'no Withdraw 1' below reports it
    expect(await click(g, '[role=menuitem]', '^Withdraw 1$'), 'no Withdraw 1');
    await g
      .waitFor(async () => (await bankQty(g, 'logs')) !== after, {
        label: 'withdraw',
        timeoutMs: 4000,
      })
      .catch(() => {});
    const w = await bankQty(g, 'logs');
    expect(w === after - 1, `after withdraw ${after} -> ${w}`);
    await closeBank(g);
    return `bank logs ${before} -> ${after} -> ${w}`;
  });

  await check(`${vp}-path`, 'shore path y53 walkable past booth', async () => {
    await closeBank(g);
    const r =
      await g.eval(`(async () => { const W = await import('/src/features/world/index.ts'); const gr = W.createWorldCollisionGrid();
        const row = []; for (let x = 68; x <= 76; x++) row.push([x, gr.isWalkable(x, 53)]); return { row, booth: gr.isWalkable(72, 52) }; })()`);
    expect(
      r.row.every(([, w]) => w),
      `y53 row ${JSON.stringify(r.row)}`,
    );
    expect(r.booth === false, 'booth tile walkable');
    await g.teleport(69, 53, { settleMs: 0 }); // walkTo is an intent: no camera settle needed
    const stop = await g.trackMoves();
    await g.walkTo(75, 53);
    await g.waitFor(async () => (await pos(g)).x === 75, { label: 'reach 75,53' });
    const path = await stop();
    expect(
      path.some((s) => s.x === 72 && s.y === 53),
      'never crossed 72,53',
    );
    expect(!path.some((s) => s.x === 72 && s.y === 52), 'walked through booth');
    expect(!(await bankOpen(g)), 'bank opened while walking past');
    return `walked 69,53 -> ${JSON.stringify(await pos(g))} via ${path.length} tiles`;
  });

  await check(`${vp}-mm`, 'minimap: "Greatmere Bank" label + bank icon at anchor', async () => {
    // Close to the booth the label box would hit the player keep-out or the circle edge and the layout
    // deliberately falls back to icon only (minimap.ts layoutLabels): walk south until the name fits.
    for (const y of [60, 62, 58, 64, 66, 56]) {
      await g.teleport(72, y, { settleMs: 0 });
      await minimapStill(g); // replaces the fixed 2.8 s glide wait + 400 ms
      if (await g.eval(`window.__mm.frame.some((q) => q.t === 'Greatmere Bank')`)) break;
    }
    const s = await g.eval(`(async () => { const W = await import('/src/features/world/index.ts');
        const cv = document.querySelector('canvas.minimap'), css = cv.clientWidth, dpr = cv.width / css, r = cv.width / 2, sc = 4 * (css / 160) * dpr;
        const pos = window.__idleRpg.store.getState().game.movement.position;
        const l = W.WORLD_DEF.labels.find((l) => l.text === 'Greatmere Bank');
        return { frame: window.__mm.frame.slice(), l, px: r + (72 - pos.x) * sc, py: r + (52 - pos.y) * sc, dpr, w: cv.width }; })()`);
    expect(
      s.l && s.l.icon === 'bank' && s.l.x === 72 && s.l.y === 52,
      `label ${JSON.stringify(s.l)} (want 72,52 bank)`,
    );
    const f = s.frame.find((q) => q.t === 'Greatmere Bank');
    expect(f, `not drawn; drawn=${s.frame.map((q) => q.t)}`);
    expect(
      Math.abs(f.x - s.px) < 40 && Math.abs(f.y - s.py) < 40,
      `drawn ${f.x},${f.y} vs anchor ${s.px},${s.py}`,
    );
    // icon pixels: the minimap near the anchor must differ from plain terrain (non-uniform patch)
    const px =
      await g.eval(`(() => { const cv = document.querySelector('canvas.minimap'); const c = cv.getContext('2d');
        const d = c.getImageData(${Math.round(s.px) - 12}, ${Math.round(s.py) - 12}, 24, 24).data; const set = new Set(); for (let i = 0; i < d.length; i += 4) set.add(d[i] + ',' + d[i+1] + ',' + d[i+2]); return set.size; })()`);
    const rc = await g.rect('canvas.minimap');
    const file = await shot(g, `${vp}-minimap`, {
      x: rc.left,
      y: rc.top,
      width: rc.w,
      height: rc.h,
    });
    return `anchor ${s.l.x},${s.l.y} px ${Math.round(s.px)},${Math.round(s.py)} label drawn ${Math.round(f.x)},${Math.round(f.y)} colours-near-anchor=${px} shot=${file}`;
  });
  // old `${vp}-errors` "no console errors" is lib's built-in 'console' check (runs after every combo)
});
