// Inventory drag-to-swap e2e on tests/e2e/lib.mjs. Run: node tests/e2e/inventorySwap.e2e.mjs  (E2E_PORT overrides 5201)
import { check, expect, forEachViewport, withGame } from './lib.mjs';

const PORT = Number(process.env.E2E_PORT) || 5201;
const SEED = ['bronze_axe', { itemId: 'logs', quantity: 5 }, null, 'raw_shrimp'];

await withGame(
  { port: PORT },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    const inv = async () =>
      (await g.state('inventory.slots')).slice(0, 5).map((s) => s && `${s.itemId}x${s.quantity}`);
    const menuOpen = () => g.eval(`!!document.querySelector('[role=menu]')`);
    const slot = async (i) => {
      const sel = `[data-slot-index="${i}"]`;
      if (!(await g.rect(sel))?.w)
        await g.tapSelector('[aria-label="Inventory"], [aria-label^="Inventory"]').catch(() => {});
      await g.eval(`document.querySelector('${sel}')?.scrollIntoView({block:'nearest'}), 0`);
      await g.sleep(100);
      const r = await g.rect(sel);
      expect(r && r.w > 0, `slot ${i} rect ${JSON.stringify(r)}`);
      return { x: r.x, y: r.y, r };
    };
    const reset = async () => {
      await g.closeOverlays();
      await g.setInventory(SEED);
      await g.sleep(150);
    };

    await check('s1', 'drag slot 0 -> slot 3 swaps (store confirms)', async () => {
      await reset();
      const before = await inv();
      const a = await slot(0),
        b = await slot(3);
      await g.drag(a.x, a.y, b.x, b.y);
      const after = await inv();
      expect(
        after[0] === before[3] && after[3] === before[0] && after[1] === before[1],
        `${before} -> ${after}`,
      );
      expect(!(await menuOpen()), 'menu opened after drag');
      return `${vp}: ${before.join(',')} -> ${after.join(',')}`;
    });

    await check('s2', 'drop on a different EMPTY slot moves the item', async () => {
      await reset();
      const a = await slot(1),
        b = await slot(2);
      await g.drag(a.x, a.y, b.x, b.y);
      const after = await inv();
      expect(after[1] === null && after[2] === 'logsx5', `after ${after}`);
      return `${vp}: ${after.join(',')}`;
    });

    await check('s3', 'long-press without moving opens the menu, no swap', async () => {
      await reset();
      const before = await inv();
      const a = await slot(0);
      await g.longPress(a.x, a.y);
      await g.sleep(150);
      expect(await menuOpen(), 'no item menu after long-press/right-click');
      expect(
        JSON.stringify(await inv()) === JSON.stringify(before),
        `inventory changed ${await inv()}`,
      );
      return `${vp}: menu open, inventory unchanged`;
    });

    await check('s4', 'move under 8 px is a tap (menu), not a drag', async () => {
      await reset();
      const before = await inv();
      const a = await slot(0),
        b = await slot(1);
      // 5 px move, ends inside slot 0; also try releasing on neighbour's edge is not needed
      await g.drag(a.x, a.y, a.x + 3, a.y + 4, 2);
      await g.sleep(150);
      expect(
        JSON.stringify(await inv()) === JSON.stringify(before),
        `inventory changed ${await inv()}`,
      );
      expect(await menuOpen(), 'tap did not open the menu');
      await g.closeOverlays();
      // sub-threshold movement that crosses into the neighbour slot would still not swap
      const near = { x: a.r.left + a.r.w - 1, y: a.y };
      await g.drag(near.x, near.y, near.x + 5, near.y, 2);
      expect(
        JSON.stringify(await inv()) === JSON.stringify(before),
        `inventory changed ${await inv()}`,
      );
      return `${vp}: 5px move -> unchanged + menu; slot1 x=${Math.round(b.x)}`;
    });

    await check('s5', 'drop on same slot or outside the grid changes nothing', async () => {
      await reset();
      const before = await inv();
      const a = await slot(0);
      await g.drag(a.x, a.y, a.x + 6, a.y + 6, 8); // 8.5 px = a real drag, still inside the same slot
      const same = await inv();
      await g.closeOverlays();
      await g.drag(a.x, a.y, a.x, a.y, 1);
      await g.closeOverlays();
      const w = await g.eval('innerWidth'),
        h = await g.eval('innerHeight');
      // outside grid: far corner of viewport (HUD/canvas area, not a slot)
      await g.drag(a.x, a.y, w - 5, h - 5, 10);
      await g.closeOverlays();
      const out = await inv();
      expect(
        JSON.stringify(out) === JSON.stringify(before),
        `${before} -> ${out} (same-slot step: ${same})`,
      );
      return `${vp}: unchanged ${out.join(',')}`;
    });
  }),
);
