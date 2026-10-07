// QA slice: item stacking in inventory + bank + ground, as the player sees it (qty badge, slot counts).
// NOTE: no stackable item exists in the shipped content yet (all 4 woodcutting items are stackable:false), so t2/t4/t5
// flip `stackable` on the live 'logs' def in-page (precondition shim); the real chop/drop/take/badge code runs on it.
import { check, expect, forEachViewport, withGame } from './lib.mjs';

const SHIM = (on) =>
  `(async () => { const { CONTENT } = await import('/src/app/registry.ts'); const d = CONTENT.items.require('logs'); d.stackable = ${on}; return d.stackable; })()`;

await withGame(
  { port: Number(process.env.E2E_PORT ?? 5208) },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    const slots = () => g.state('inventory.slots');
    const used = async () => (await slots()).filter(Boolean).length;
    const total = async (id) =>
      (await slots()).reduce((n, s) => n + (s?.itemId === id ? s.quantity : 0), 0);
    const bank = () => g.state('bank.items');
    const badge = (i) =>
      g.eval(`document.querySelector('[data-slot-index="${i}"] .slot-qty')?.textContent ?? null`);
    const tapMenu = async (label) => {
      const r = await g.eval(
        `(() => { const b = [...document.querySelectorAll('.menu-item')].find((e) => e.textContent.trim() === ${JSON.stringify(label)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
      );
      expect(r, `no menu item ${label}`);
      await g.tap(r.x, r.y);
      await g.sleep(150);
    };
    const bankSlot = (grid, n) =>
      `[role=dialog][aria-label=Bank] .bank-grid:nth-of-type(${grid}) .slot:nth-child(${n})`;
    const openBank = async () => {
      await g.update('({ ...g, bankOpen: true })');
      await g.sleep(250);
    };
    const tree = await g.targetOfKind('tree');
    const chop = async (want, id = 'logs') => {
      const t0 = Date.now();
      while ((await total(id)) < want) {
        expect(Date.now() - t0 < 40000, `timeout waiting ${want} ${id}`);
        await g.teleport(tree.x, tree.y + 2, { settleMs: 400 });
        await g.tapObject(tree.id);
        const n = await total(id);
        await g
          .waitFor(async () => (await total(id)) > n, { timeoutMs: 4000, label: 'a log' })
          .catch(() => {});
      }
    };
    const lane =
      await g.eval(`(async () => { const { CONTENT } = await import('/src/app/registry.ts'); const gr = CONTENT.grid; const s = window.__e.game().movement.position;
      for (let r = 0; r < 12; r++) for (let x = s.x - r; x <= s.x + r; x++) for (let y = s.y - r; y <= s.y + r; y++) {
        if ([[0,0],[0,2]].every(([dx,dy]) => gr.isWalkable(x+dx,y+dy)) && gr.isWalkable(x,y+1)) return { x, y }; } })()`);

    await check('t1', 'non-stackable logs: 3 chopped = 3 slots, no qty badge', async () => {
      expect((await g.eval(SHIM(false))) === false, 'logs should be non-stackable');
      await g.setInventory(['bronze_axe']);
      await chop(3);
      await g.sleep(200);
      const s = await slots();
      const logSlots = s.filter((x) => x?.itemId === 'logs');
      const badges = await g.eval(`document.querySelectorAll('.slot-qty').length`);
      expect(
        logSlots.length === 3 && logSlots.every((x) => x.quantity === 1),
        `slots ${JSON.stringify(logSlots)}`,
      );
      expect(badges === 0, `${badges} qty badges`);
      return `${vp}: ${logSlots.length} log slots (qty 1 each), used ${await used()}, badges ${badges}`;
    });

    await check('t2', 'stackable: chop adds to ONE slot, badge text updates', async () => {
      await g.eval(SHIM(true));
      await g.setInventory(['bronze_axe', { itemId: 'logs', quantity: 5 }]);
      await g.sleep(200);
      expect((await badge(1)) === '5', `badge before ${await badge(1)}`);
      await chop(6);
      await g.sleep(200);
      const s = await slots();
      expect(s[1].quantity === 6 && (await used()) === 2, `slots ${JSON.stringify(s.slice(0, 3))}`);
      const b = await badge(1);
      expect(b === '6', `badge ${b}`);
      return `${vp}: slot1 qty 5->6, badge "${b}", used slots ${await used()}`;
    });

    await check(
      't3',
      'bank: deposit 3 logs -> one bank slot x3; withdraw-all into near-full inv fills only free slots',
      async () => {
        await g.eval(SHIM(false));
        await g.setInventory(['logs', 'logs', 'logs']);
        await openBank();
        await g.tapSelector(bankSlot(3, 1));
        await tapMenu('Deposit all');
        const b = await bank();
        expect(
          b.length === 1 && b[0].itemId === 'logs' && b[0].quantity === 3 && (await used()) === 0,
          `bank ${JSON.stringify(b)} used ${await used()}`,
        );
        const bb = await g.eval(
          `document.querySelectorAll('[role=dialog][aria-label=Bank] .bank-grid:nth-of-type(2) .slot').length + '|' + document.querySelector('[role=dialog][aria-label=Bank] .bank-grid:nth-of-type(2) .slot-qty')?.textContent`,
        );
        expect(bb === '1|3', `bank UI ${bb}`);
        // 10 in bank, 25 axes in inv (3 free): withdraw all -> 3 logs, 7 stay
        await g.update(
          `({ ...g, bank: { ...g.bank, items: [{ itemId: 'logs', quantity: 10 }] } })`,
        );
        await g.setInventory(Array(25).fill('bronze_axe'));
        await g.sleep(200);
        await g.tapSelector(bankSlot(2, 1));
        await tapMenu('Withdraw all');
        const b2 = await bank();
        expect(
          (await total('logs')) === 3 && (await used()) === 28 && b2[0]?.quantity === 7,
          `inv logs ${await total('logs')} used ${await used()} bank ${JSON.stringify(b2)}`,
        );
        return `${vp}: deposit -> bank [logs x3], UI ${bb}; withdraw-all with 3 free: inv logs 3, used 28, bank left ${b2[0].quantity}`;
      },
    );

    await check(
      't4',
      'stackable stack Drop = whole stack on the ground; Take -> one slot',
      async () => {
        await g.update(`({ ...g, bankOpen: false })`);
        await g.eval(SHIM(true));
        await g.setInventory(['bronze_axe', { itemId: 'logs', quantity: 7 }]);
        await g.teleport(lane.x, lane.y);
        await g.tapSelector('[data-slot-index="1"]');
        await tapMenu('Drop');
        const gi = await g.state('ground.items');
        expect(
          gi.length === 1 && gi[0].qty === 7 && (await used()) === 1,
          `ground ${JSON.stringify(gi)} used ${await used()}`,
        );
        await g.sleep(300);
        const v = await g.eval(
          `(() => { const sc = window.__idleRpg.scene().camera.scene; const c = sc.children.list.find((c) => c.type === 'Container' && c.list?.[0]?.texture?.key === 'ground_shadow' && c.visible); return c ? { x: c.x, y: c.y } : null; })()`,
        );
        expect(v, 'no ground view');
        await g.teleport(lane.x, lane.y + 2);
        const pt = await g.page(`toClient(${v.x}, ${v.y - 8})`);
        await g.tap(pt.x, pt.y);
        await g.waitFor(async () => (await g.state('ground.items')).length === 0, {
          label: 'take',
        });
        await g.sleep(200);
        const s = await slots();
        expect(
          s[1]?.quantity === 7 && (await used()) === 2 && (await badge(1)) === '7',
          `slots ${JSON.stringify(s.slice(0, 3))} badge ${await badge(1)}`,
        );
        return `${vp}: ground qty ${gi[0].qty}, after Take slot1 x${s[1].quantity}, used ${await used()}, badge ${await badge(1)}`;
      },
    );

    await check(
      't5',
      'full inventory + stackable present: new item still joins the stack',
      async () => {
        await g.eval(SHIM(true));
        await g.setInventory(
          ['bronze_axe', { itemId: 'logs', quantity: 4 }, ...Array(26).fill('iron_axe')].slice(
            0,
            28,
          ),
        );
        await g.sleep(200);
        expect((await used()) === 28, `used ${await used()}`);
        await chop(5);
        await g.sleep(200);
        const s = await slots();
        expect(
          s[1].quantity === 5 && (await used()) === 28,
          `slot1 ${JSON.stringify(s[1])} used ${await used()}`,
        );
        expect((await g.chatCount("You don't have enough inventory space")) === 0, 'no-space chat');
        return `${vp}: full 28/28, logs 4->5 in slot 1, used still ${await used()}`;
      },
    );
    await g.eval(SHIM(false));
  }),
);
