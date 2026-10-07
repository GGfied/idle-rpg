// QA slice: Fernhaven bank (building 90,60 9x8, door 94,67; booths 93,62 / 95,62; bankers 93,61 / 95,61).
// Real taps for the behaviour; teleport/store only for preconditions. Port 5207 (E2E_PORT overrides).
import { check, expect, forEachViewport, withGame } from './lib.mjs';

const DOOR = { x: 94, y: 67 };
const pos = (g) => g.state('movement.position');
const bankOpen = (g) => g.state('bankOpen');
const bankQty = async (g, id) =>
  (await g.state('bank.items')).filter((b) => b.itemId === id).reduce((n, b) => n + b.quantity, 0);
const click = (g, sel, re) =>
  g.eval(
    `(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => new RegExp(${JSON.stringify(re)}).test(e.textContent || '')); if (!el) return false; el.click(); return true; })()`,
  );
// lib targets() only lists village spawns, so look Fernhaven's up in WORLD_* ourselves.
const tapSpawn = async (g, id) => {
  const t =
    await g.eval(`(async () => { const w = await import('/src/features/world/index.ts'); const r = await import('/src/render/index.ts');
    const o = w.WORLD_OBJECT_SPAWNS.find((x) => x.objectId === ${JSON.stringify(id)}); const n = w.WORLD_NPC_SPAWNS.find((x) => x.spawnId === ${JSON.stringify(id)});
    const kind = o ? o.kind : 'npc'; const sp = o || n; return { x: sp.x, y: sp.y, up: (r.VIEW_HIT_BOUNDS[kind] || { up: 24 }).up }; })()`);
  expect(t && t.x, `no spawn ${id}`);
  const p = await g.tileClient(t.x, t.y, -t.up / 2);
  expect(
    await g.page(`topIsCanvas(${p.x}, ${p.y})`),
    `${id} at ${Math.round(p.x)},${Math.round(p.y)} covered by HUD`,
  );
  await g.tap(p.x, p.y);
};
const closeBank = async (g) => {
  if (await bankOpen(g)) await click(g, '.bank-overlay button', 'Close');
  await g.sleep(200);
};

await withGame(
  { port: 5207 },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    await check('door', 'walk in through the door by tapping tiles', async () => {
      await closeBank(g);
      await g.teleport(DOOR.x, DOOR.y + 2, { settleMs: 2000 });
      const stop = await g.trackMoves();
      await g.tapTile(DOOR.x, DOOR.y - 1);
      await g.waitFor(async () => (await pos(g)).y <= DOOR.y - 1, { label: 'inside the building' });
      const p = await pos(g);
      const path = await stop();
      expect(
        path.some((s) => s.x === DOOR.x && s.y === DOOR.y),
        'path never crossed the door tile',
      );
      return `${vp}: ended ${p.x},${p.y}; crossed door ${DOOR.x},${DOOR.y}`;
    });

    await check('booth', 'tap booth_3 opens bank; deposit + withdraw work', async () => {
      await closeBank(g);
      await g.teleport(94, 65, { settleMs: 1500 });
      await g.setInventory([{ itemId: 'logs', quantity: 5 }]);
      const before = await bankQty(g, 'logs');
      await tapSpawn(g, 'bank_booth_3');
      await g.waitFor(() => bankOpen(g), { label: 'bank open' });
      expect(await click(g, '.bank-overlay button', 'Deposit inventory'), 'no Deposit button');
      await g.sleep(200);
      const after = await bankQty(g, 'logs');
      expect(after === before + 5, `bank logs ${before} -> ${after}`);
      // withdraw 1 via slot menu
      const r = await g.rect('.bank-overlay .bank-grid button[aria-label^="Logs"]');
      expect(r, 'no Logs slot in bank');
      await g.tap(r.x, r.y);
      await g.sleep(150);
      expect(await click(g, '[role=menuitem]', '^Withdraw 1$'), 'no Withdraw 1');
      await g.sleep(200);
      const w = await bankQty(g, 'logs');
      expect(w === after - 1, `after withdraw ${after} -> ${w}`);
      return `${vp}: bank logs ${before} -> ${after} -> ${w}`;
    });

    await check('shared', "Fernhaven bank is the same bank as Willowbrook's", async () => {
      const fern = await bankQty(g, 'logs');
      await closeBank(g);
      await closeBank(g);
      await g.teleport(12, 12, { settleMs: 1500 });
      await g.tapObject('bank_booth_1');
      await g.waitFor(() => bankOpen(g), { label: 'willowbrook bank open' });
      const seen = await g.eval(
        `(() => { const s = document.querySelector('.bank-overlay .bank-grid button[aria-label^="Logs"]'); return s ? s.getAttribute('aria-label') : null; })()`,
      );
      expect(seen && fern > 0, `Willowbrook bank shows no logs (label ${seen}, state ${fern})`);
      // withdraw at Willowbrook, then confirm Fernhaven count dropped
      const r = await g.rect('.bank-overlay .bank-grid button[aria-label^="Logs"]');
      await g.tap(r.x, r.y);
      await g.sleep(150);
      await click(g, '[role=menuitem]', '^Withdraw 1$');
      await g.sleep(200);
      const now = await bankQty(g, 'logs');
      expect(now === fern - 1, `after Willowbrook withdraw ${fern} -> ${now}`);
      await closeBank(g);
      return `${vp}: willowbrook slot "${seen}", logs ${fern} -> ${now}`;
    });

    await check('banker', 'tap banker_3 -> dialogue', async () => {
      await closeBank(g);
      await g.teleport(94, 65, { settleMs: 1500 });
      await tapSpawn(g, 'banker_3');
      await g.waitFor(() => g.eval(`!!document.querySelector('.dialogue')`), { label: 'dialogue' });
      const txt = await g.eval(`document.querySelector('.dialogue-text')?.textContent ?? ''`);
      await g.eval(`document.querySelector('.dialogue-main')?.click()`);
      await g.sleep(150);
      expect(await click(g, '.dialogue-choice', 'access my bank'), 'no "access my bank" choice');
      await g.waitFor(() => bankOpen(g), { label: 'bank open via banker' });
      await closeBank(g);
      return `${vp}: text "${txt.slice(0, 40)}"; choice opened bank`;
    });

    await check('counter', 'cannot walk behind the counter', async () => {
      await closeBank(g);
      await closeBank(g);
      await g.teleport(94, 65, { settleMs: 1500 });
      const stop = await g.trackMoves();
      for (const [x, y] of [
        [94, 61],
        [93, 61],
        [95, 61],
        [93, 62],
        [94, 60],
      ]) {
        await g.walkTo(x, y); // taps here land on the booth/banker sprites (bank opens): use the walk intent
        await g.waitTicks(14);
        await closeBank(g);
      }
      const path = await stop();
      const bad = path.filter((s) => s.y <= 61 && s.y >= 60 && s.x >= 90 && s.x <= 98);
      expect(!bad.length, `entered counter tiles: ${JSON.stringify(bad)}`);
      return `${vp}: visited ${path.length} tiles, none inside counter rows y60-61; final ${JSON.stringify(await pos(g))}`;
    });

    await check('away', 'walking away closes the bank', async () => {
      await closeBank(g);
      await g.teleport(94, 65, { settleMs: 1500 });
      await tapSpawn(g, 'bank_booth_4');
      await g.waitFor(() => bankOpen(g), { label: 'bank open' });
      const p = await g.tileClient(94, 67);
      if (await g.page(`topIsCanvas(${p.x}, ${p.y})`)) await g.tap(p.x, p.y);
      else {
        await g.walkTo(94, 67); // overlay covers canvas on phone
      }
      await g.waitFor(async () => !(await bankOpen(g)), { label: 'bank closes' });
      return `${vp}: closed after walking to ${JSON.stringify(await pos(g))}`;
    });
  }),
);
